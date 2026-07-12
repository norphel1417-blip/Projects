"""Neural Track C — Audio Spectrogram Transformer (AST) fine-tuned for
synthetic-voice / deepfake detection.

This is the *primary* SOTA detector. AST (Gong et al., 2021) is the current
backbone for most ASVspoof leaderboards and we wrap a publicly-available
HuggingFace checkpoint specialised on ASVspoof5 / fake-audio classification.
Loading is lazy and resilient — multiple checkpoint IDs are attempted and
the inferencer falls back to the legacy two-track stack if every option fails.

Memory: ~340 MB FP32 / 170 MB FP16 — comfortably fits 8 GB VRAM alongside the
existing wav2vec2-base + whisper-tiny tracks.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch

from .common import DEVICE, HF_OFFLINE

log = logging.getLogger("voiceshield.models.ast_deepfake")


# Ranked list of public HF checkpoints, all AST-family deepfake/spoof
# detectors. We pick the first one that loads successfully.
_CANDIDATE_MODELS = [
    "MattyB95/AST-ASVspoof5-Synthetic-Voice-Detection",
    "WpythonW/ast-fakeaudio-detector",
    "MattyB95/AST-ASVspoof2019-Synthetic-Voice-Detection",
    "motheecreator/Deepfake-audio-detection",  # wav2vec2 fallback
]


class ASTDeepfake:
    """Lazy-loaded SOTA deepfake detector. Exposes `predict(wav, sr) -> P(synthetic)`
    plus `model_id` and `architecture` for telemetry."""

    def __init__(self) -> None:
        self.model = None
        self.processor = None
        self.model_id: Optional[str] = None
        self.architecture: Optional[str] = None
        self.label_map: dict[int, str] = {}
        self.synthetic_idx: int = 1  # most checkpoints use 0=real, 1=fake/spoof
        self._load()

    def _load(self) -> None:
        if HF_OFFLINE:
            log.warning("HF offline mode — AST detector disabled")
            return
        try:
            from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
        except Exception as e:
            log.warning("transformers import failed (%s); AST detector disabled", e)
            return

        for mid in _CANDIDATE_MODELS:
            try:
                log.info("Attempting to load AST deepfake checkpoint %s …", mid)
                proc = AutoFeatureExtractor.from_pretrained(mid)
                mdl = AutoModelForAudioClassification.from_pretrained(mid).to(DEVICE).eval()
                self.processor = proc
                self.model = mdl
                self.model_id = mid
                self.architecture = type(mdl).__name__
                # resolve which class index corresponds to synthetic
                id2label = getattr(mdl.config, "id2label", {}) or {}
                self.label_map = {int(k): str(v) for k, v in id2label.items()}
                self.synthetic_idx = self._guess_synthetic_idx(self.label_map)
                params_m = sum(p.numel() for p in mdl.parameters()) / 1e6
                log.info(
                    "AST detector ready · model=%s · arch=%s · %.1fM params · labels=%s · synthetic_idx=%d",
                    mid, self.architecture, params_m, self.label_map, self.synthetic_idx,
                )
                return
            except Exception as e:
                log.warning("Failed loading %s (%s) — trying next candidate", mid, e)
                continue

        log.warning("All AST candidates failed — AST track will be disabled.")

    @staticmethod
    def _guess_synthetic_idx(label_map: dict[int, str]) -> int:
        if not label_map:
            return 1
        synth_keywords = ("spoof", "fake", "synth", "deepfake", "generated", "ai")
        real_keywords = ("real", "bona", "genuine", "human", "authentic")
        for idx, lbl in label_map.items():
            low = lbl.lower()
            if any(k in low for k in synth_keywords):
                return idx
        for idx, lbl in label_map.items():
            low = lbl.lower()
            if any(k in low for k in real_keywords):
                # synthetic is the *other* class
                others = [i for i in label_map.keys() if i != idx]
                return others[0] if others else idx
        return 1

    @property
    def available(self) -> bool:
        return self.model is not None and self.processor is not None

    @torch.inference_mode()
    def predict(self, wav: np.ndarray, sr: int = 16000) -> float:
        if not self.available:
            raise RuntimeError("AST detector not loaded")
        # Most AST/wav2vec2 checkpoints expect 16 kHz mono float32 in [-1, 1]
        x = wav.astype(np.float32)
        try:
            inputs = self.processor(x, sampling_rate=sr, return_tensors="pt")
        except Exception:
            # Some processors require explicit max_length / padding for short clips
            inputs = self.processor(x, sampling_rate=sr, return_tensors="pt", padding=True)
        inputs = {k: v.to(DEVICE) for k, v in inputs.items() if hasattr(v, "to")}
        out = self.model(**inputs)
        logits = out.logits  # (1, num_classes)
        probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()
        if self.synthetic_idx >= probs.shape[0]:
            # binary head with reversed convention
            return float(probs[-1])
        return float(probs[self.synthetic_idx])

    def telemetry(self) -> dict:
        return {
            "loaded": self.available,
            "model_id": self.model_id,
            "architecture": self.architecture,
            "labels": self.label_map,
            "synthetic_idx": self.synthetic_idx,
        }


_singleton: Optional[ASTDeepfake] = None


def get_model() -> ASTDeepfake:
    global _singleton
    if _singleton is None:
        _singleton = ASTDeepfake()
    return _singleton
