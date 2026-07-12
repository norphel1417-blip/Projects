"""Pydantic schemas for API + WS payloads."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


RiskLevel = Literal["low", "medium", "high"]


class ForensicFeatures(BaseModel):
    pitch_jitter: float
    pitch_shimmer: float
    spectral_kurtosis: float
    spectral_flatness: float
    phase_coherence: float
    hf_energy_ratio: float  # high-frequency energy ratio (TTS often deficient)
    spectral_tilt: float
    voiced_ratio: float


class ModelScores(BaseModel):
    neural_a: Optional[float] = Field(default=None, description="SSL-AASIST P(synthetic). None when neural model unavailable.")
    neural_b: Optional[float] = Field(default=None, description="Whisper-head P(synthetic). None when neural model unavailable.")
    neural_c: Optional[float] = Field(default=None, description="AST deepfake-detector P(synthetic). None when SOTA AST model unavailable.")
    forensic: float = Field(..., description="Forensic features P(synthetic)")
    fused: float = Field(..., description="Calibrated fused P(synthetic)")
    neural_available: bool = Field(default=False, description="Whether neural tracks contributed to fusion.")


class ReasoningStep(BaseModel):
    """One step in the slow-thinking chain produced for a single window.

    Mirrors the <think>/<answer> paradigm from arXiv:2503.24115 — instead of an
    LLM hallucinating, each step is grounded in a real intermediate signal
    produced by the inference pipeline. The frontend renders these as a typed
    chain-of-thought trace synchronised with the live waveform / spectrogram.
    """
    stage: str = Field(..., description="pipeline stage id (feat / ast / forensic / fusion / verdict)")
    label: str = Field(..., description="human-readable stage label")
    thought: str = Field(..., description="natural-language reasoning fragment")
    evidence: dict = Field(default_factory=dict, description="numeric evidence supporting the thought")
    elapsed_ms: float = Field(default=0.0, description="time spent in this stage")


class WindowResult(BaseModel):
    window_index: int
    t_start: float
    t_end: float
    scores: ModelScores
    features: ForensicFeatures
    reasons: list[str]
    stability: float = Field(..., ge=0, le=1, description="Adversarial stability (1=stable)")
    threat_fingerprint: Optional[str] = Field(
        default=None, description="Suspected synthesis family (heuristic)."
    )
    threat_confidence: float = Field(default=0.0, ge=0, le=1)
    spectrogram_b64: Optional[str] = None
    gradcam_b64: Optional[str] = None
    waveform_b64: Optional[str] = Field(default=None, description="Base64 PNG of the raw waveform for this window.")
    reasoning_chain: list[ReasoningStep] = Field(default_factory=list)


class SessionState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    session_id: str
    started_at: datetime
    windows: list[WindowResult] = Field(default_factory=list)
    ema_score: float = 0.0
    consecutive_medium: int = 0
    risk: RiskLevel = "low"
    flagged_at: Optional[datetime] = None


class WSMessage(BaseModel):
    type: Literal["window", "state", "error", "info", "status", "complete", "transcript", "meter"]
    payload: dict
