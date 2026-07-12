"""Neural Track A — SSL frontend + AASIST-style graph-attention head.

We use a small pretrained SSL backbone (Wav2Vec2-base / WavLM-base) and a
lightweight AASIST-inspired classifier on top. If model weights cannot be
downloaded (offline / no internet during demo), we gracefully fall back to a
mel-CNN that runs purely on torchaudio features.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import settings
from .common import DEVICE

log = logging.getLogger("voiceshield.models.ssl_aasist")


class _GraphAttentionHead(nn.Module):
    """Tiny GAT-style head: per-frame embeddings -> attention pool -> MLP."""

    def __init__(self, dim: int, hidden: int = 128):
        super().__init__()
        self.attn = nn.Linear(dim, 1)
        self.fc1 = nn.Linear(dim, hidden)
        self.fc2 = nn.Linear(hidden, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, T, D)
        w = torch.softmax(self.attn(x), dim=1)
        pooled = (x * w).sum(dim=1)
        h = F.gelu(self.fc1(pooled))
        return self.fc2(h)


class _MelFallback(nn.Module):
    """Mel-CNN fallback when SSL backbone weights are unavailable."""

    def __init__(self):
        super().__init__()
        import torchaudio  # local import to keep startup fast

        self.melspec = torchaudio.transforms.MelSpectrogram(
            sample_rate=16000, n_fft=1024, hop_length=256, n_mels=80
        )
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.GELU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.GELU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.GELU(), nn.AdaptiveAvgPool2d(1),
        )
        self.head = nn.Linear(64, 2)

    def forward(self, wav: torch.Tensor) -> torch.Tensor:  # (B, N)
        m = torch.log(self.melspec(wav) + 1e-6).unsqueeze(1)
        h = self.cnn(m).flatten(1)
        return self.head(h)


class SSLAASIST:
    """Wraps an SSL backbone + GAT head; provides P(synthetic)."""

    def __init__(self) -> None:
        self.backbone = None
        self.head: Optional[nn.Module] = None
        self.fallback: Optional[_MelFallback] = None
        self._load()

    def _load(self) -> None:
        try:
            from transformers import AutoFeatureExtractor, AutoModel

            model_id = "facebook/wav2vec2-base"  # 95M params, small and reliable
            log.info("Loading SSL backbone %s", model_id)
            self.feat_ext = AutoFeatureExtractor.from_pretrained(model_id)
            self.backbone = AutoModel.from_pretrained(model_id).to(DEVICE).eval()
            for p in self.backbone.parameters():
                p.requires_grad = False
            dim = self.backbone.config.hidden_size
            self.head = _GraphAttentionHead(dim).to(DEVICE).eval()
            log.info("SSL-AASIST ready (%.1fM backbone params)",
                     sum(p.numel() for p in self.backbone.parameters()) / 1e6)
        except Exception as e:  # offline / no internet
            log.warning("SSL backbone unavailable (%s); using mel-CNN fallback", e)
            self.backbone = None
            self.fallback = _MelFallback().to(DEVICE).eval()

    @torch.no_grad()
    def predict(self, wav: np.ndarray, sr: int = 16000) -> float:
        x = torch.from_numpy(wav.astype(np.float32)).unsqueeze(0).to(DEVICE)
        if self.backbone is not None:
            inputs = self.feat_ext(wav, sampling_rate=sr, return_tensors="pt")
            iv = inputs["input_values"].to(DEVICE)
            feats = self.backbone(iv).last_hidden_state  # (1, T, D)
            logits = self.head(feats)
        else:
            assert self.fallback is not None
            logits = self.fallback(x)
        return float(F.softmax(logits, dim=-1)[0, 1].item())


_singleton: Optional[SSLAASIST] = None


def get_model() -> SSLAASIST:
    global _singleton
    if _singleton is None:
        _singleton = SSLAASIST()
    return _singleton
