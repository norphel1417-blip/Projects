"""Inference orchestrator — runs the 3 tracks, fuses, and decorates output."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np

from .config import settings
from .explain.spectrogram import render_gradcam, render_spectrogram, render_waveform
from .forensics.features import extract_features, forensic_probability
from .forensics.fusion import build_scores, reasons_from
from .schemas import ReasoningStep, WindowResult

log = logging.getLogger("voiceshield.inference")


@dataclass
class InferenceResult:
    window: WindowResult
    elapsed_ms: float


class Inferencer:
    """Single-window inference. Models are lazily loaded on first call."""

    def __init__(self) -> None:
        self._models_loaded = False
        self._neural_a = None
        self._neural_b = None
        self._neural_c = None

    def _ensure_models(self) -> None:
        if self._models_loaded or not settings.use_neural:
            return
        try:
            from .models.ssl_aasist import get_model as get_a
            from .models.whisper_head import get_model as get_b

            self._neural_a = get_a()
            self._neural_b = get_b()
            log.info("Legacy neural models (SSL-AASIST + Whisper-head) loaded.")
        except Exception as e:
            log.warning("Legacy neural models failed to load (%s). Continuing without.", e)
            self._neural_a = None
            self._neural_b = None
        try:
            from .models.ast_deepfake import get_model as get_c

            cand = get_c()
            if cand.available:
                self._neural_c = cand
                log.info("AST SOTA deepfake model loaded: %s", cand.model_id)
            else:
                log.warning("AST SOTA model wrapper present but model unavailable.")
        except Exception as e:
            log.warning("AST SOTA model failed to load (%s). Continuing without.", e)
            self._neural_c = None
        self._models_loaded = True

    def warmup(self) -> None:
        self._ensure_models()

    def _neural_scores(self, wav: np.ndarray, sr: int) -> tuple[float | None, float | None, float | None]:
        """Return (neural_a, neural_b, neural_c) probabilities. Any track may
        independently be None when its model is unavailable. The fusion layer
        cleanly degrades to the available subset.
        """
        self._ensure_models()
        a = b = c = None
        if self._neural_a is not None and self._neural_b is not None:
            try:
                a = float(self._neural_a.predict(wav, sr))
                b = float(self._neural_b.predict(wav, sr))
            except Exception as e:
                log.warning("Legacy neural inference error (%s).", e)
                a = b = None
        if self._neural_c is not None and self._neural_c.available:
            try:
                c = float(self._neural_c.predict(wav, sr))
            except Exception as e:
                log.warning("AST inference error (%s).", e)
                c = None
        return a, b, c

    def _adversarial_stability(self, wav: np.ndarray, sr: int, base_fused: float) -> float:
        """Re-run forensic+fusion under small deterministic perturbations; high
        agreement = stable. Deterministic seeding keeps results reproducible
        across runs of the same window."""
        scores = []
        seed = int(np.abs(wav).sum() * 1000.0) % (2**32 - 1)
        rng = np.random.default_rng(seed)
        for gain in (0.95, 1.05):
            for shift in (-0.02, 0.02):
                shifted = np.roll(wav, int(shift * sr)) * gain
                shifted += rng.normal(0, 1e-3, size=shifted.shape).astype(np.float32)
                feat = extract_features(shifted, sr)
                fp, _ = forensic_probability(feat)
                scores.append(fp)
        var = float(np.var(scores))
        # var typically 0..0.05 — convert to stability in [0,1]
        return float(np.clip(1.0 - var * 20, 0.0, 1.0))

    def run(self, wav: np.ndarray, sr: int, window_index: int,
            t_start: float, with_explain: bool = True) -> InferenceResult:
        t0 = time.perf_counter()
        timings: dict[str, float] = {}

        t_a = time.perf_counter()
        feat = extract_features(wav, sr)
        forensic_p, contrib = forensic_probability(feat)
        timings["feat"] = (time.perf_counter() - t_a) * 1000

        t_a = time.perf_counter()
        n_a, n_b, n_c = self._neural_scores(wav, sr)
        timings["neural"] = (time.perf_counter() - t_a) * 1000

        t_a = time.perf_counter()
        scores = build_scores(n_a, n_b, n_c, forensic_p)
        timings["fusion"] = (time.perf_counter() - t_a) * 1000

        t_a = time.perf_counter()
        stability = self._adversarial_stability(wav, sr, scores.fused)
        timings["stability"] = (time.perf_counter() - t_a) * 1000

        reasons = reasons_from(feat, contrib)

        spec_b64 = render_spectrogram(wav, sr) if with_explain else None
        gc_b64 = render_gradcam(wav, contrib, sr) if with_explain else None
        wave_b64 = render_waveform(wav, sr) if with_explain else None

        fp_label, fp_conf = _classify_threat(feat, scores.fused)

        chain = self._build_reasoning_chain(
            feat=feat,
            contrib=contrib,
            scores=scores,
            fp_label=fp_label,
            fp_conf=fp_conf,
            stability=stability,
            timings=timings,
        )

        win = WindowResult(
            window_index=window_index,
            t_start=t_start,
            t_end=t_start + len(wav) / sr,
            scores=scores,
            features=feat,
            reasons=reasons,
            stability=stability,
            threat_fingerprint=fp_label,
            threat_confidence=fp_conf,
            spectrogram_b64=spec_b64,
            gradcam_b64=gc_b64,
            waveform_b64=wave_b64,
            reasoning_chain=chain,
        )
        return InferenceResult(window=win, elapsed_ms=(time.perf_counter() - t0) * 1000)

    def _build_reasoning_chain(
        self,
        *,
        feat,
        contrib: dict[str, float],
        scores,
        fp_label: str | None,
        fp_conf: float,
        stability: float,
        timings: dict[str, float],
    ) -> list[ReasoningStep]:
        """Build a slow-thinking trace inspired by arXiv:2503.24115's
        <think>/<answer> paradigm. Every step is grounded in real numerical
        evidence emitted by the pipeline — no LLM hallucination. The frontend
        renders these as a streaming chain-of-thought.
        """
        steps: list[ReasoningStep] = []

        # 1. Feature-extraction stage
        top_contribs = sorted(contrib.items(), key=lambda kv: kv[1], reverse=True)[:3]
        steps.append(ReasoningStep(
            stage="feat",
            label="Forensic feature extraction",
            thought=(
                f"Computed 8 perceptual + spectral features. "
                f"Pitch jitter={feat.pitch_jitter:.4f}, shimmer={feat.pitch_shimmer:.4f}, "
                f"HF energy ratio={feat.hf_energy_ratio:.3f}, "
                f"spectral flatness={feat.spectral_flatness:.3f}, "
                f"phase coherence={feat.phase_coherence:.3f}."
            ),
            evidence={
                "pitch_jitter": round(feat.pitch_jitter, 5),
                "pitch_shimmer": round(feat.pitch_shimmer, 5),
                "hf_energy_ratio": round(feat.hf_energy_ratio, 4),
                "spectral_flatness": round(feat.spectral_flatness, 4),
                "phase_coherence": round(feat.phase_coherence, 4),
                "voiced_ratio": round(feat.voiced_ratio, 4),
                "top_anomalies": [{"name": k, "weight": round(v, 3)} for k, v in top_contribs],
            },
            elapsed_ms=round(timings.get("feat", 0.0), 2),
        ))

        # 2. AST SOTA model stage
        ast_avail = self._neural_c is not None and self._neural_c.available
        ast_id = self._neural_c.model_id if ast_avail else None
        if scores.neural_c is not None:
            ast_thought = (
                f"AST ({ast_id}) returned P(synthetic)={scores.neural_c:.3f}. "
                f"This is the SOTA ASVspoof-fine-tuned audio-spectrogram-transformer track "
                f"and gets the highest weight in the fusion."
            )
        elif ast_avail:
            ast_thought = "AST model loaded but inference failed for this window — falling back to corroborator tracks."
        else:
            ast_thought = "AST SOTA model unavailable in this environment — relying on legacy neural + forensic tracks."
        steps.append(ReasoningStep(
            stage="ast",
            label="AST SOTA deepfake model",
            thought=ast_thought,
            evidence={
                "model_id": ast_id,
                "p_synthetic": round(scores.neural_c, 4) if scores.neural_c is not None else None,
                "available": ast_avail,
                "neural_a_p": round(scores.neural_a, 4) if scores.neural_a is not None else None,
                "neural_b_p": round(scores.neural_b, 4) if scores.neural_b is not None else None,
            },
            elapsed_ms=round(timings.get("neural", 0.0), 2),
        ))

        # 3. Forensic-physics stage
        steps.append(ReasoningStep(
            stage="forensic",
            label="Physics-based forensic probability",
            thought=(
                f"Forensic ensemble returned P(synthetic)={scores.forensic:.3f}. "
                + (
                    "Strongest signals: "
                    + ", ".join(f"{k}({v:.2f})" for k, v in top_contribs)
                    if top_contribs and top_contribs[0][1] > 0.05
                    else "No individual feature crossed the suspicion threshold."
                )
            ),
            evidence={
                "p_synthetic": round(scores.forensic, 4),
                "contributions": {k: round(v, 3) for k, v in contrib.items()},
            },
            elapsed_ms=round(timings.get("feat", 0.0), 2),
        ))

        # 4. Fusion stage
        steps.append(ReasoningStep(
            stage="fusion",
            label="Calibrated logistic fusion",
            thought=(
                f"Adaptive logistic fusion across "
                f"{sum(1 for x in (scores.neural_a, scores.neural_b, scores.neural_c) if x is not None)} "
                f"neural track(s) + forensic → fused P(synthetic)={scores.fused:.3f}. "
                f"Adversarial stability under perturbation = {stability:.2f}."
            ),
            evidence={
                "fused": round(scores.fused, 4),
                "neural_available": scores.neural_available,
                "stability": round(stability, 3),
            },
            elapsed_ms=round(timings.get("fusion", 0.0) + timings.get("stability", 0.0), 2),
        ))

        # 5. Verdict stage
        if scores.fused >= 0.65:
            verdict = "HIGH RISK"
        elif scores.fused >= 0.45:
            verdict = "MEDIUM RISK"
        else:
            verdict = "LOW RISK"
        verdict_thought = (
            f"Window verdict: {verdict}."
            + (f" Suspected family: {fp_label} (confidence {fp_conf:.2f})." if fp_label else " Authentic-leaning.")
        )
        steps.append(ReasoningStep(
            stage="verdict",
            label="Window verdict",
            thought=verdict_thought,
            evidence={
                "verdict": verdict,
                "fingerprint": fp_label,
                "fingerprint_confidence": round(fp_conf, 3),
            },
            elapsed_ms=0.0,
        ))
        return steps


def _classify_threat(feat, fused: float) -> tuple[str | None, float]:
    """Heuristic synthesis-family fingerprint.

    Maps forensic feature combinations to plausible vocoder/TTS families. Used
    only when the fused probability indicates non-trivial synthesis suspicion.
    Returns (label, confidence in [0,1]). Returns (None, 0) when the audio
    looks authentic.
    """
    if fused < 0.45:
        return None, 0.0
    hf_def = feat.hf_energy_ratio < 0.18
    flat_phase = feat.spectral_flatness > 0.32 and feat.phase_coherence < 0.55
    low_jitter = feat.pitch_jitter < 0.008 and feat.voiced_ratio > 0.4
    kurt_spike = feat.spectral_kurtosis > 8.0
    candidates: list[tuple[str, float]] = []
    if hf_def and low_jitter:
        candidates.append(("Autoregressive Vocoder (Tacotron-2 / WaveNet family)", 0.78))
    if flat_phase:
        candidates.append(("GAN Vocoder (HiFi-GAN / MelGAN family)", 0.74))
    if feat.spectral_flatness > 0.28 and feat.hf_energy_ratio > 0.22:
        candidates.append(("Diffusion / Flow-based TTS (StyleTTS / VALL-E family)", 0.7))
    if kurt_spike and feat.phase_coherence < 0.6:
        candidates.append(("Concatenative / Splice-edit Spoof", 0.66))
    if not candidates:
        return ("Generic Neural TTS", min(0.55, 0.4 + 0.5 * (fused - 0.45)))
    candidates.sort(key=lambda c: -c[1])
    label, base = candidates[0]
    # confidence scales with fused score
    conf = float(min(0.95, base * (0.6 + 0.4 * fused)))
    return label, conf


_singleton: Inferencer | None = None


def get_inferencer() -> Inferencer:
    global _singleton
    if _singleton is None:
        _singleton = Inferencer()
    return _singleton
