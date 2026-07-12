"""Generate synthetic demo WAVs that exercise both real-voice and
deepfake-style fingerprints, so the demo runs even with no internet/dataset.

- real_voice_*.wav: jittered F0, breath noise, formant-shaped spectrum,
  micro-pauses → low forensic score.
- deepfake_*.wav: smooth F0, no shimmer, bandlimited at 6 kHz, flattened
  spectrum, no pauses → high forensic score.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

from app.config import SAMPLES_DIR

SR = 16000


def _formant_filter(x: np.ndarray, formants=(700, 1200, 2600)) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    out = np.zeros_like(x)
    for f in formants:
        bw = max(80, f * 0.1)
        sos = butter(2, [max(20, f - bw), f + bw], btype="band", fs=SR, output="sos")
        out += sosfilt(sos, x)
    return out / max(np.abs(out).max(), 1e-6) * 0.6


def _real_voice(seconds: float = 12.0, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    # Jittered F0
    f0 = 130 + 8 * np.sin(2 * np.pi * 0.3 * t) + rng.normal(0, 4, n)
    phase = np.cumsum(2 * np.pi * f0 / SR)
    # Glottal-ish source: sum of harmonics with shimmer
    src = np.zeros(n)
    for k in range(1, 25):
        amp = (1.0 / k) * (1 + 0.05 * rng.standard_normal(n))
        src += amp * np.sin(k * phase)
    src += 0.04 * rng.standard_normal(n)  # breath noise
    voiced = _formant_filter(src)

    # Insert micro-pauses (silence + breath)
    out = voiced.copy()
    for _ in range(6):
        s = rng.integers(SR, n - SR)
        L = rng.integers(int(0.08 * SR), int(0.25 * SR))
        out[s : s + L] *= 0.05
        out[s : s + L] += 0.01 * rng.standard_normal(L)
    out *= 0.7
    return out.astype(np.float32)


def _deepfake_voice(seconds: float = 12.0, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    # Very smooth F0 — vocoder hallmark
    f0 = 145 + 2 * np.sin(2 * np.pi * 0.15 * t)
    phase = np.cumsum(2 * np.pi * f0 / SR)
    src = np.zeros(n)
    for k in range(1, 22):
        # Constant amplitudes (no shimmer)
        src += (1.0 / k**0.9) * np.sin(k * phase)
    voiced = _formant_filter(src, formants=(650, 1150, 2400))
    voiced += 0.005 * rng.standard_normal(n)  # tiny noise floor

    # Bandlimit at 6 kHz (TTS/codec fingerprint)
    from scipy.signal import butter, sosfilt
    sos = butter(8, 6000, btype="low", fs=SR, output="sos")
    out = sosfilt(sos, voiced)

    # No pauses, perfectly continuous voicing
    out *= 0.7
    return out.astype(np.float32)


def main() -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    for i in range(2):
        wav = _real_voice(seed=i)
        p = SAMPLES_DIR / f"real_voice_{i+1}.wav"
        sf.write(p, wav, SR, subtype="PCM_16")
        meta = {"label": "real", "synthetic": False,
                "description": "Synthesized natural-style voice (training/demo only)"}
        Path(p).with_suffix(".json").write_text(json.dumps(meta, indent=2))
        items.append(p.name)

    for i in range(2):
        wav = _deepfake_voice(seed=10 + i)
        p = SAMPLES_DIR / f"deepfake_sample_{i+1}.wav"
        sf.write(p, wav, SR, subtype="PCM_16")
        meta = {"label": "deepfake", "synthetic": True,
                "description": "Synthesized vocoder-style fingerprint (demo only)"}
        Path(p).with_suffix(".json").write_text(json.dumps(meta, indent=2))
        items.append(p.name)

    print(f"Wrote {len(items)} samples to {SAMPLES_DIR}:")
    for it in items:
        print(" -", it)


if __name__ == "__main__":
    main()
