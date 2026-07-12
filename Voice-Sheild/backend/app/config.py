"""Global configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
SAMPLES_DIR = BASE_DIR.parent / "samples"
WEIGHTS_DIR = BASE_DIR / "weights"
REPORTS_DIR = BASE_DIR.parent / "reports"

WEIGHTS_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)


@dataclass
class AudioCfg:
    sample_rate: int = 16000
    window_seconds: float = 3.0
    stride_seconds: float = 1.0
    buffer_seconds: float = 10.0
    meter_interval_seconds: float = 0.25
    n_fft: int = 1024
    hop_length: int = 256
    n_mels: int = 80


@dataclass
class DecisionCfg:
    # High Risk if EMA P(synthetic) >= high_threshold for 1 window,
    # OR P >= medium_threshold for >= 2 consecutive windows.
    high_threshold: float = 0.85
    medium_threshold: float = 0.65
    consecutive_required: int = 2
    ema_alpha: float = 0.55  # weight on new score


@dataclass
class TranscriptionCfg:
    enabled: bool = field(default_factory=lambda: os.getenv("VS_TRANSCRIBE", "1") == "1")
    model_id: str = field(default_factory=lambda: os.getenv("VS_ASR_MODEL", "openai/whisper-tiny"))
    min_rms: float = field(default_factory=lambda: float(os.getenv("VS_ASR_MIN_RMS", "0.003")))
    segment_stride_seconds: float = field(default_factory=lambda: float(os.getenv("VS_ASR_STRIDE_SECONDS", "2.0")))
    max_new_tokens: int = field(default_factory=lambda: int(os.getenv("VS_ASR_MAX_NEW_TOKENS", "48")))


@dataclass
class FusionWeights:
    # Logistic-style weights over [neural_a, neural_b, forensic]
    # Calibrated heuristics; replaceable by Platt fit on real data.
    bias: float = -0.6
    w_neural_a: float = 1.4
    w_neural_b: float = 1.1
    w_forensic: float = 1.6


@dataclass
class Settings:
    audio: AudioCfg = field(default_factory=AudioCfg)
    decision: DecisionCfg = field(default_factory=DecisionCfg)
    transcription: TranscriptionCfg = field(default_factory=TranscriptionCfg)
    fusion: FusionWeights = field(default_factory=FusionWeights)
    use_neural: bool = field(default_factory=lambda: os.getenv("VS_USE_NEURAL", "1") == "1")
    device: str = field(default_factory=lambda: os.getenv("VS_DEVICE", "auto"))
    env_label: str = field(default_factory=lambda: os.getenv("VS_ENV", "PRODUCTION"))
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip() for o in os.getenv(
                "VS_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",") if o.strip()
        ]
    )


settings = Settings()
