"""Latency + first-flag-time benchmark.

Streams a deepfake sample through the inference pipeline at 4s window /
2s stride and asserts:
  - p95 per-window latency <= 600 ms
  - first 'high' flag occurs within 10 s of stream start
"""
from __future__ import annotations

import statistics
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from app.config import SAMPLES_DIR, settings
from app.inference import get_inferencer
from app.streaming import Session, update_decision


def run(path: Path) -> dict:
    wav, sr = sf.read(path, dtype="float32", always_2d=False)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    if sr != settings.audio.sample_rate:
        ratio = settings.audio.sample_rate / sr
        wav = np.interp(
            np.linspace(0, len(wav), int(len(wav) * ratio), endpoint=False),
            np.arange(len(wav)), wav,
        ).astype(np.float32)
        sr = settings.audio.sample_rate

    cfg = settings.audio
    win_n = int(cfg.window_seconds * sr)
    stride_n = int(cfg.stride_seconds * sr)
    inf = get_inferencer()
    session = Session(session_id="bench", sr=sr)

    latencies, fused_trace = [], []
    first_flag_t = None
    for i, start in enumerate(range(0, len(wav) - win_n + 1, stride_n)):
        seg = wav[start : start + win_n]
        res = inf.run(seg, sr, window_index=i, t_start=start / sr)
        latencies.append(res.elapsed_ms)
        session.windows.append(res.window)
        newly, lvl = update_decision(session, res.window.scores.fused)
        session.window_index = i + 1
        fused_trace.append((start / sr, res.window.scores.fused, session.ema_score, lvl))
        if newly and first_flag_t is None:
            first_flag_t = start / sr + cfg.window_seconds  # decision visible at end of window

    return {
        "file": str(path),
        "windows": len(latencies),
        "lat_p50_ms": statistics.median(latencies),
        "lat_p95_ms": statistics.quantiles(latencies, n=20)[-1] if len(latencies) >= 20
                       else max(latencies),
        "lat_max_ms": max(latencies),
        "first_flag_s": first_flag_t,
        "final_risk": session.risk,
        "ema": session.ema_score,
        "trace": fused_trace,
    }


def main() -> int:
    deepfakes = sorted(SAMPLES_DIR.glob("deepfake_*.wav"))
    if not deepfakes:
        print("No deepfake samples found. Run: python -m scripts.generate_samples")
        return 1
    failed = 0
    for p in deepfakes:
        r = run(p)
        print(f"\n=== {p.name} ===")
        print(f"  windows={r['windows']}  p50={r['lat_p50_ms']:.1f}ms  "
              f"p95={r['lat_p95_ms']:.1f}ms  max={r['lat_max_ms']:.1f}ms")
        print(f"  first_flag_s={r['first_flag_s']}  final_risk={r['final_risk']}  "
              f"ema={r['ema']:.3f}")
        ok = (r["first_flag_s"] is not None and r["first_flag_s"] <= 10.0
              and r["lat_p95_ms"] <= 600)
        print(f"  PASS={ok}")
        if not ok:
            failed += 1
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
