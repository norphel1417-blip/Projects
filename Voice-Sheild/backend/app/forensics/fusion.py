"""Calibrated fusion of model + forensic scores.

Three neural tracks are now supported:
  * neural_a — SSL-AASIST (wav2vec2-base + GAT head)
  * neural_b — Whisper-head
  * neural_c — AST deepfake detector (PRIMARY SOTA, when loaded)

Plus the forensic-features track. The fusion is a weighted logistic over
mean-centred probabilities. AST gets the highest weight when available since
it's the SOTA leaderboard architecture for ASVspoof; the legacy neural tracks
act as ensemble corroborators. When AST is unavailable we still fuse the
remaining tracks. Forensic-only is the final graceful-degradation tier.
"""
from __future__ import annotations

import math

from ..schemas import ModelScores


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


# Per-track weights (calibrated on neutral-noise + held-out spoof samples).
_W_AST = 1.6        # SOTA primary
_W_AASIST = 0.9     # corroborator
_W_WHISPER = 0.7    # corroborator
_W_FORENSIC_NEURAL = 0.6   # forensic weight when neural tracks present
_W_FORENSIC_ONLY = 1.4     # forensic weight when no neural tracks
_BIAS = -0.15       # slight bias toward "real" — empirical calibration on noise


def _centre(p: float) -> float:
    return (p - 0.5) * 2  # → [-1, 1]


def fuse(
    neural_a: float | None,
    neural_b: float | None,
    neural_c: float | None,
    forensic: float,
) -> float:
    """Logistic fusion over whatever tracks are available."""
    z = _BIAS
    has_neural = False
    if neural_c is not None:
        z += _W_AST * _centre(neural_c)
        has_neural = True
    if neural_a is not None:
        z += _W_AASIST * _centre(neural_a)
        has_neural = True
    if neural_b is not None:
        z += _W_WHISPER * _centre(neural_b)
        has_neural = True
    if has_neural:
        z += _W_FORENSIC_NEURAL * _centre(forensic)
    else:
        z = _W_FORENSIC_ONLY * _centre(forensic)
    return _sigmoid(z)


def build_scores(
    neural_a: float | None,
    neural_b: float | None,
    neural_c: float | None,
    forensic: float,
) -> ModelScores:
    has_neural = any(x is not None for x in (neural_a, neural_b, neural_c))
    return ModelScores(
        neural_a=neural_a,
        neural_b=neural_b,
        neural_c=neural_c,
        forensic=forensic,
        fused=fuse(neural_a, neural_b, neural_c, forensic),
        neural_available=has_neural,
    )


def reasons_from(features, contrib: dict[str, float]) -> list[str]:
    """Top-3 natural-language reasons given feature contributions."""
    catalog = {
        "low_pitch_jitter": "Unnaturally smooth pitch contour (jitter ~0)",
        "low_shimmer": "Suspiciously stable amplitude — vocoder fingerprint",
        "low_hf_energy": "Bandlimited high-frequency content (>6 kHz deficient)",
        "high_spectral_flatness": "Flattened spectrum — weak harmonic peaks",
        "phase_anomaly": "Inter-band phase incoherence (GAN/diffusion signature)",
        "high_voiced_ratio": "No micro-pauses or breath events detected",
        "spectral_tilt_anomaly": "Anomalous long-term spectral tilt",
    }
    ranked = sorted(
        [(k, v) for k, v in contrib.items() if v > 0.15],
        key=lambda kv: kv[1],
        reverse=True,
    )[:3]
    return [catalog[k] for k, _ in ranked] or ["No strong forensic indicators in this window"]
