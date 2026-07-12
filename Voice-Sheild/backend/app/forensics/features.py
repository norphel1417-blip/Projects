"""Forensic DSP features — explainable signals that catch synthetic voice.

These features encode well-documented artifacts of TTS / voice-clone systems:

* **Pitch jitter / shimmer**: real voices have natural cycle-to-cycle variation;
  many neural vocoders over-smooth pitch contours.
* **Spectral kurtosis / flatness**: vocoders tend to flatten the spectrum and
  reduce sharp harmonic peaks.
* **Phase coherence**: GAN/diffusion vocoders often emit phase-incoherent
  high-frequency content.
* **HF energy ratio**: many TTS systems under-produce >6kHz energy.
* **Spectral tilt**: clone speech often has unnatural long-term spectral tilt.
* **Voiced ratio**: extremely high voiced ratio (no breath / no micro-pauses)
  is suspicious.

All features are bounded into [0, 1] and combined into a single P(synthetic)
via a hand-tuned logistic that is easy to explain to auditors.
"""
from __future__ import annotations

import numpy as np
from scipy import signal as scisig
from scipy.stats import kurtosis

from ..schemas import ForensicFeatures


# ----- low-level helpers ------------------------------------------------- #

def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return float(a / b) if b else default


def _autocorr_pitch(frame: np.ndarray, sr: int, fmin: int = 70, fmax: int = 400) -> float:
    """Cheap autocorr-based pitch estimate; returns 0 for unvoiced frames."""
    if frame.size < 2:
        return 0.0
    frame = frame - frame.mean()
    if np.max(np.abs(frame)) < 1e-3:
        return 0.0
    corr = np.correlate(frame, frame, mode="full")[frame.size - 1 :]
    min_lag = int(sr / fmax)
    max_lag = int(sr / fmin)
    if max_lag >= corr.size:
        return 0.0
    seg = corr[min_lag:max_lag]
    if seg.size == 0:
        return 0.0
    peak = int(np.argmax(seg)) + min_lag
    if corr[peak] < 0.3 * corr[0]:
        return 0.0
    return float(sr / peak)


def _frame_signal(x: np.ndarray, frame: int, hop: int) -> np.ndarray:
    if x.size < frame:
        return np.empty((0, frame), dtype=x.dtype)
    n = 1 + (x.size - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


# ----- individual feature extractors ------------------------------------- #

def pitch_track(x: np.ndarray, sr: int) -> np.ndarray:
    frame = int(0.04 * sr)
    hop = int(0.01 * sr)
    frames = _frame_signal(x, frame, hop)
    if frames.size == 0:
        return np.array([])
    return np.array([_autocorr_pitch(f, sr) for f in frames])


def jitter_shimmer(x: np.ndarray, sr: int) -> tuple[float, float, float]:
    """Returns (jitter, shimmer, voiced_ratio).

    jitter — relative cycle-to-cycle pitch variation
    shimmer — relative cycle-to-cycle amplitude variation
    voiced_ratio — fraction of frames with detected pitch
    """
    pitches = pitch_track(x, sr)
    if pitches.size < 4:
        return 0.0, 0.0, 0.0
    voiced_mask = pitches > 0
    voiced_ratio = float(voiced_mask.mean())
    voiced = pitches[voiced_mask]
    if voiced.size < 4:
        return 0.0, 0.0, voiced_ratio

    periods = 1.0 / voiced
    jitter = float(np.mean(np.abs(np.diff(periods))) / (np.mean(periods) + 1e-9))

    # shimmer via short-window RMS of voiced segments
    frame = int(0.04 * sr)
    hop = int(0.01 * sr)
    frames = _frame_signal(x, frame, hop)
    rms = np.sqrt(np.mean(frames**2, axis=1) + 1e-12)
    rms_v = rms[: voiced_mask.size][voiced_mask]
    if rms_v.size < 4:
        return jitter, 0.0, voiced_ratio
    shimmer = float(np.mean(np.abs(np.diff(rms_v))) / (np.mean(rms_v) + 1e-9))
    return jitter, shimmer, voiced_ratio


def spectral_stats(x: np.ndarray, sr: int) -> tuple[float, float, float, float]:
    """Returns (spectral_kurtosis, spectral_flatness, hf_energy_ratio, spectral_tilt)."""
    f, t, S = scisig.stft(x, fs=sr, nperseg=1024, noverlap=768)
    mag = np.abs(S) + 1e-9
    psd = (mag**2).mean(axis=1)

    # Spectral kurtosis across frequency bins
    spec_kurt = float(kurtosis(psd, fisher=True, nan_policy="omit"))

    # Spectral flatness (geo mean / arith mean)
    geo = np.exp(np.mean(np.log(psd)))
    arith = np.mean(psd)
    flat = float(geo / (arith + 1e-12))

    # HF / total energy
    hf_mask = f >= 6000
    hf_ratio = float(psd[hf_mask].sum() / (psd.sum() + 1e-12))

    # Spectral tilt via simple log-log linear fit
    eps = 1e-9
    log_f = np.log(f + eps)
    log_p = np.log(psd + eps)
    tilt = float(np.polyfit(log_f, log_p, 1)[0])
    return spec_kurt, flat, hf_ratio, tilt


def phase_coherence(x: np.ndarray, sr: int) -> float:
    """Phase coherence across frequency bands.

    Real recordings have moderate phase variance; vocoder output is often
    extreme on either end (too random or too smooth).
    """
    _, _, S = scisig.stft(x, fs=sr, nperseg=1024, noverlap=768)
    phase = np.angle(S)
    diff = np.diff(np.unwrap(phase, axis=1), axis=1)
    var = np.var(diff, axis=1)
    # normalize: real speech ~0.5–1.5; cloned often <0.2 or >2.0
    norm = float(np.exp(-((np.median(var) - 1.0) ** 2) / 0.5))
    return 1.0 - norm  # 0 = real-like, 1 = anomalous


# ----- top-level extractor + scoring ------------------------------------- #

def extract_features(x: np.ndarray, sr: int) -> ForensicFeatures:
    if x.dtype != np.float32:
        x = x.astype(np.float32)
    # normalize loudness
    peak = float(np.max(np.abs(x))) or 1.0
    x = x / peak

    jitter, shimmer, voiced = jitter_shimmer(x, sr)
    sk, flat, hf, tilt = spectral_stats(x, sr)
    coh = phase_coherence(x, sr)

    return ForensicFeatures(
        pitch_jitter=float(np.clip(jitter, 0, 1)),
        pitch_shimmer=float(np.clip(shimmer, 0, 1)),
        spectral_kurtosis=float(np.clip((sk + 5) / 20, 0, 1)),  # squash
        spectral_flatness=float(np.clip(flat, 0, 1)),
        phase_coherence=float(np.clip(coh, 0, 1)),
        hf_energy_ratio=float(np.clip(hf, 0, 1)),
        spectral_tilt=float(np.clip((tilt + 4) / 8, 0, 1)),
        voiced_ratio=float(np.clip(voiced, 0, 1)),
    )


def forensic_probability(feat: ForensicFeatures) -> tuple[float, dict[str, float]]:
    """Hand-calibrated logistic over forensic features.

    Each contribution is exposed for the explainability panel.
    Returns (probability, contributions_dict).

    Heuristic rationale:
      * Very LOW jitter+shimmer → over-smoothed clone → +
      * Very LOW HF energy → bandlimited TTS → +
      * Anomalous phase coherence → +
      * High flatness → +
      * Voiced ratio close to 1.0 (no breath) → +
    """
    # Each term is roughly in [-1, 1] and pushes prob up if positive.
    contrib: dict[str, float] = {
        "low_pitch_jitter":      _bell_low(feat.pitch_jitter, 0.01, 0.04) * 1.2,
        "low_shimmer":           _bell_low(feat.pitch_shimmer, 0.02, 0.05) * 1.0,
        "low_hf_energy":         _bell_low(feat.hf_energy_ratio, 0.02, 0.10) * 1.4,
        "high_spectral_flatness": _bell_high(feat.spectral_flatness, 0.05, 0.20) * 1.0,
        "phase_anomaly":         (feat.phase_coherence - 0.4) * 2.0,
        "high_voiced_ratio":     _bell_high(feat.voiced_ratio, 0.7, 0.95) * 0.8,
        "spectral_tilt_anomaly": _bell_far(feat.spectral_tilt, 0.5, 0.18) * 0.7,
    }
    z = -0.4 + sum(contrib.values())
    prob = 1.0 / (1.0 + np.exp(-z))
    return float(prob), contrib


# bell-shaped helpers
def _bell_low(v: float, lo: float, hi: float) -> float:
    """Returns ~1 when v < lo, 0 when v > hi, smooth between."""
    if v <= lo:
        return 1.0
    if v >= hi:
        return -0.2
    return 1.0 - (v - lo) / (hi - lo)


def _bell_high(v: float, lo: float, hi: float) -> float:
    if v <= lo:
        return -0.2
    if v >= hi:
        return 1.0
    return (v - lo) / (hi - lo)


def _bell_far(v: float, center: float, sigma: float) -> float:
    return 1.0 - float(np.exp(-((v - center) ** 2) / (2 * sigma * sigma)))
