"""Lazy Whisper ASR for live transcript segments."""
from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np

from .config import settings

log = logging.getLogger("voiceshield.transcription")


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    compact = re.sub(r"\s+", "", text).lower()
    if len(compact) > 30:
        letters = [c for c in compact if c.isalpha()]
        if letters:
            most_common = max(set(letters), key=letters.count)
            if letters.count(most_common) / len(letters) > 0.75:
                return "prolonged vocalization"
        unique = set(compact)
        if len(unique) <= 4:
            return "prolonged vocalization"
    if len(text) > 220:
        return text[:217].rstrip() + "..."
    return text


@dataclass
class TranscriptResult:
    text: str
    elapsed_ms: float
    confidence: Optional[float] = None
    source: str = "whisper"


class Transcriber:
    _pipe: Any | None
    _load_error: str | None

    def __init__(self) -> None:
        self.enabled = settings.transcription.enabled
        self.available = False
        self._pipe: Any | None = None
        self._load_error: str | None = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()

    def _ensure_loaded(self) -> bool:
        with self._load_lock:
            if not self.enabled:
                self._load_error = "transcription disabled"
                return False
            if self.available and self._pipe is not None:
                return True
            if self._load_error is not None:
                return False
            try:
                from transformers import pipeline
                from .models.common import DEVICE

                device = 0 if str(DEVICE).startswith("cuda") else -1
                log.info("Loading ASR transcriber %s", settings.transcription.model_id)
                self._pipe = pipeline(
                    "automatic-speech-recognition",
                    model=settings.transcription.model_id,
                    device=device,
                )
                self.available = True
                log.info("ASR transcriber ready: %s", settings.transcription.model_id)
                return True
            except Exception as exc:
                self._load_error = str(exc)
                log.warning("ASR transcriber unavailable (%s)", exc)
                return False

    def warmup(self) -> bool:
        return self._ensure_loaded()

    def transcribe(self, wav: np.ndarray, sr: int) -> TranscriptResult | None:
        if wav.size == 0:
            return None
        rms = float(np.sqrt(np.mean(np.square(wav.astype(np.float32)))))
        if rms < settings.transcription.min_rms:
            return TranscriptResult(text="", elapsed_ms=0.0, confidence=None)
        if not self._ensure_loaded() or self._pipe is None:
            return None
        t0 = time.perf_counter()
        try:
            with self._infer_lock:
                generate_kwargs: dict[str, object] = {
                    "max_new_tokens": settings.transcription.max_new_tokens,
                    "num_beams": 1,
                    "do_sample": False,
                    "condition_on_prev_tokens": False,
                }
                if not settings.transcription.model_id.endswith(".en"):
                    generate_kwargs.update({"task": "transcribe", "language": "en"})
                out = self._pipe(
                    {"array": wav.astype(np.float32), "sampling_rate": sr},
                    return_timestamps=False,
                    generate_kwargs=generate_kwargs,
                )
            text = _clean_text(str(out.get("text", "") if isinstance(out, dict) else out))
            return TranscriptResult(
                text=text,
                elapsed_ms=(time.perf_counter() - t0) * 1000,
                confidence=None,
                source=settings.transcription.model_id,
            )
        except Exception as exc:
            log.warning("ASR transcription failed (%s)", exc)
            return None


_singleton: Transcriber | None = None


def get_transcriber() -> Transcriber:
    global _singleton
    if _singleton is None:
        _singleton = Transcriber()
    return _singleton
