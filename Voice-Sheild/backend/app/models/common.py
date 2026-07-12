"""Device + lazy module loaders."""
from __future__ import annotations

import logging
import os

import torch

from ..config import settings

log = logging.getLogger("voiceshield.models")


def select_device() -> str:
    if settings.device != "auto":
        return settings.device
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEVICE = select_device()
log.info("Selected torch device: %s", DEVICE)

# Allow offline operation via env
HF_OFFLINE = os.getenv("HF_HUB_OFFLINE", "0") == "1" or os.getenv("TRANSFORMERS_OFFLINE", "0") == "1"
