"""Neural Track B — Whisper-tiny encoder + MLP forensic head.

Whisper's encoder produces phonetically-rich embeddings (39M params total).
We attach a small classifier to score P(synthetic). Falls back to a
log-mel statistics MLP if Whisper weights are unavailable offline.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .common import DEVICE

log = logging.getLogger("voiceshield.models.whisper_head")


class _Head(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, 256), nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(256, 64), nn.GELU(),
            nn.Linear(64, 2),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _StatHead(nn.Module):
    """Statistics MLP over log-mel for offline fallback."""

    def __init__(self):
        super().__init__()
        import torchaudio

        self.mel = torchaudio.transforms.MelSpectrogram(
            sample_rate=16000, n_fft=1024, hop_length=256, n_mels=80
        )
        self.head = _Head(80 * 4)  # mean, std, min, max per mel bin

    def forward(self, wav: torch.Tensor) -> torch.Tensor:
        m = torch.log(self.mel(wav) + 1e-6)  # (B, M, T)
        stats = torch.cat(
            [m.mean(-1), m.std(-1), m.amin(-1), m.amax(-1)], dim=-1
        )
        return self.head(stats)


class WhisperHead:
    def __init__(self) -> None:
        self.encoder = None
        self.head: Optional[nn.Module] = None
        self.fallback: Optional[_StatHead] = None
        self._load()

    def _load(self) -> None:
        try:
            from transformers import WhisperFeatureExtractor, WhisperModel

            log.info("Loading Whisper-tiny encoder")
            self.feat_ext = WhisperFeatureExtractor.from_pretrained("openai/whisper-tiny")
            full = WhisperModel.from_pretrained("openai/whisper-tiny")
            self.encoder = full.encoder.to(DEVICE).eval()
            for p in self.encoder.parameters():
                p.requires_grad = False
            dim = full.config.d_model
            self.head = _Head(dim).to(DEVICE).eval()
            log.info("Whisper-head ready (%.1fM encoder params)",
                     sum(p.numel() for p in self.encoder.parameters()) / 1e6)
        except Exception as e:
            log.warning("Whisper unavailable (%s); using stat-MLP fallback", e)
            self.encoder = None
            self.fallback = _StatHead().to(DEVICE).eval()

    @torch.no_grad()
    def predict(self, wav: np.ndarray, sr: int = 16000) -> float:
        if self.encoder is not None:
            inputs = self.feat_ext(wav, sampling_rate=sr, return_tensors="pt")
            feats = inputs["input_features"].to(DEVICE)
            enc = self.encoder(feats).last_hidden_state  # (1, T, D)
            pooled = enc.mean(dim=1)
            logits = self.head(pooled)
        else:
            assert self.fallback is not None
            x = torch.from_numpy(wav.astype(np.float32)).unsqueeze(0).to(DEVICE)
            logits = self.fallback(x)
        return float(F.softmax(logits, dim=-1)[0, 1].item())


_singleton: Optional[WhisperHead] = None


def get_model() -> WhisperHead:
    global _singleton
    if _singleton is None:
        _singleton = WhisperHead()
    return _singleton
