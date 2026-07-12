"""Ring buffer + session manager for live streaming detection."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from .config import settings
from .schemas import SessionState, WindowResult


class RingBuffer:
    """Mono float32 PCM ring buffer of fixed seconds capacity."""

    def __init__(self, seconds: float = 10.0, sr: int = 16000):
        self.sr = sr
        self.capacity = int(seconds * sr)
        self.buf = np.zeros(self.capacity, dtype=np.float32)
        self.write = 0  # absolute samples written
        self.lock = asyncio.Lock()

    async def push(self, pcm: np.ndarray) -> None:
        async with self.lock:
            n = pcm.size
            if n >= self.capacity:
                self.buf[:] = pcm[-self.capacity:]
                self.write += n
                return
            idx = self.write % self.capacity
            end = idx + n
            if end <= self.capacity:
                self.buf[idx:end] = pcm
            else:
                first = self.capacity - idx
                self.buf[idx:] = pcm[:first]
                self.buf[: n - first] = pcm[first:]
            self.write += n

    def latest(self, samples: int) -> Optional[np.ndarray]:
        if self.write < samples:
            return None
        idx = self.write % self.capacity
        if idx >= samples:
            return self.buf[idx - samples : idx].copy()
        # wrap
        first = samples - idx
        return np.concatenate([self.buf[-first:], self.buf[:idx]]).copy()

    def samples_between(self, start: int, end: int) -> Optional[np.ndarray]:
        if end < start or start < 0 or end > self.write:
            return None
        if start < max(0, self.write - self.capacity):
            return None
        n = end - start
        if n == 0:
            return np.zeros(0, dtype=np.float32)
        idx = start % self.capacity
        stop = idx + n
        if stop <= self.capacity:
            return self.buf[idx:stop].copy()
        first = self.capacity - idx
        return np.concatenate([self.buf[idx:], self.buf[: n - first]]).copy()


@dataclass
class Session:
    session_id: str
    sr: int = 16000
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    buf: RingBuffer = field(init=False)
    windows: list[WindowResult] = field(default_factory=list)
    ema_score: float = 0.0
    consecutive_medium: int = 0
    risk: str = "low"
    flagged_at: Optional[datetime] = None
    next_window_at: int = 0  # absolute sample index for next emission
    window_index: int = 0
    last_seen: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.buf = RingBuffer(seconds=settings.audio.buffer_seconds, sr=self.sr)

    def state(self) -> SessionState:
        return SessionState(
            session_id=self.session_id,
            started_at=self.started_at,
            windows=self.windows,
            ema_score=self.ema_score,
            consecutive_medium=self.consecutive_medium,
            risk=self.risk,  # type: ignore[arg-type]
            flagged_at=self.flagged_at,
        )


class SessionManager:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}
        self.lock = asyncio.Lock()

    async def create(self, sr: int = 16000) -> Session:
        async with self.lock:
            sid = uuid.uuid4().hex[:12]
            s = Session(session_id=sid, sr=sr)
            self.sessions[sid] = s
            return s

    async def get(self, sid: str) -> Optional[Session]:
        return self.sessions.get(sid)

    async def drop(self, sid: str) -> None:
        async with self.lock:
            self.sessions.pop(sid, None)


def update_decision(session: Session, fused: float) -> tuple[bool, str]:
    """Update EMA + decision state; returns (newly_flagged, level)."""
    cfg = settings.decision
    a = cfg.ema_alpha
    if session.window_index == 0:
        session.ema_score = fused
    else:
        session.ema_score = a * fused + (1 - a) * session.ema_score

    level = "low"
    newly_flagged = False
    if session.ema_score >= cfg.high_threshold or fused >= cfg.high_threshold:
        level = "high"
        if session.risk != "high":
            newly_flagged = True
            session.flagged_at = datetime.now(timezone.utc)
    elif session.ema_score >= cfg.medium_threshold:
        session.consecutive_medium += 1
        if session.consecutive_medium >= cfg.consecutive_required:
            level = "high"
            if session.risk != "high":
                newly_flagged = True
                session.flagged_at = datetime.now(timezone.utc)
        else:
            level = "medium"
    else:
        session.consecutive_medium = 0
        level = "low"

    session.risk = level
    return newly_flagged, level


manager = SessionManager()
