"""End-to-end WebSocket smoke test for /ws/stream."""
from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings


def _synthetic_fake(sr: int = 16000, seconds: float = 14.0) -> np.ndarray:
    t = np.arange(int(sr * seconds)) / sr
    f0 = 145.0
    sig = np.zeros_like(t)
    for k in range(1, 10):
        sig += (1.0 / k) * np.sin(2 * np.pi * f0 * k * t)
    sig /= np.max(np.abs(sig))
    sig = 0.5 * sig + 0.5 * np.convolve(sig, np.ones(8) / 8, mode="same")
    return sig.astype(np.float32) * 0.6


def test_ws_stream_emits_windows():
    fake = _synthetic_fake()
    pcm16 = (np.clip(fake, -1, 1) * 32767).astype(np.int16)

    cfg = settings.audio
    sr = cfg.sample_rate
    win_n = int(cfg.window_seconds * sr)
    stride_n = int(cfg.stride_seconds * sr)
    expected_windows = max(1, (len(pcm16) - win_n) // stride_n + 1)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/stream") as ws:
            info = ws.receive_json()
            assert info["type"] == "info"

            chunk = 1024
            for i in range(0, len(pcm16), chunk):
                ws.send_bytes(pcm16[i : i + chunk].tobytes())

            window_msgs = []
            risks = []
            for _ in range(expected_windows + 6):
                msg = ws.receive_json()
                if msg["type"] == "window":
                    window_msgs.append(msg)
                    risks.append(msg["payload"]["risk"])
                elif msg["type"] == "state":
                    risks.append(msg["payload"]["risk"])
                if len(window_msgs) >= expected_windows:
                    break

            assert len(window_msgs) >= 1
            scores = [m["payload"]["window"]["scores"]["forensic"] for m in window_msgs]
            assert max(scores) > 0.4, scores
