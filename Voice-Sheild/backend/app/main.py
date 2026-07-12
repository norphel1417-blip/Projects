"""FastAPI app: REST + WebSocket for VoiceShield."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import __version__
from .config import REPORTS_DIR, SAMPLES_DIR, settings
from .inference import get_inferencer
from .schemas import WSMessage
from .streaming import manager, update_decision
from .transcription import get_transcriber

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("voiceshield")

WSKind = Literal["window", "state", "error", "info", "status", "complete", "transcript", "meter"]


def _loaded_model_catalog(inf) -> list[dict]:
    loaded_models: list[dict] = []
    if getattr(inf, "_models_loaded", False):
        if inf._neural_a is not None:
            loaded_models.append({"id": "wav2vec2-base + AASIST head", "track": "neural_a", "role": "corroborator"})
        if inf._neural_b is not None:
            loaded_models.append({"id": "Whisper-encoder head", "track": "neural_b", "role": "corroborator"})
        if inf._neural_c is not None and inf._neural_c.available:
            t = inf._neural_c.telemetry()
            loaded_models.append({
                "id": t.get("model_id"),
                "arch": t.get("architecture"),
                "track": "neural_c",
                "role": "SOTA primary",
            })
    loaded_models.append({"id": "Forensic-Fusion (physics)", "track": "forensic", "role": "always-on"})
    return loaded_models

app = FastAPI(title="VoiceShield", version=__version__,
              description="Real-time AI voice forensics for call security")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    inf = get_inferencer()
    # Don't trigger model loading from a health check — only report what's loaded.
    loaded_models = _loaded_model_catalog(inf)
    return {
        "status": "ok",
        "version": __version__,
        "use_neural": settings.use_neural,
        "device": settings.device,
        "env": settings.env_label,
        "active_sessions": len(manager.sessions),
        "models_loaded": getattr(inf, "_models_loaded", False),
        "loaded_models": loaded_models,
        "transcription_enabled": settings.transcription.enabled,
    }


@app.get("/stats")
async def stats() -> dict:
    """Aggregate analytics across persisted sessions (audit log) for the dashboard KPI strip."""
    audit = REPORTS_DIR / "sessions.jsonl"
    today = datetime.now(timezone.utc).date()
    rows: list[dict] = []
    if audit.exists():
        for line in audit.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    today_rows = [
        r for r in rows
        if r.get("started_at", "").startswith(today.isoformat())
    ]
    flagged = [r for r in rows if r.get("final_risk") == "high"]
    flagged_today = [r for r in today_rows if r.get("final_risk") == "high"]
    avg_ema = (sum(r.get("ema_score", 0.0) for r in rows) / len(rows)) if rows else 0.0
    avg_windows = (sum(r.get("windows", 0) for r in rows) / len(rows)) if rows else 0.0
    inf = get_inferencer()
    return {
        "calls_total": len(rows),
        "calls_today": len(today_rows),
        "threats_blocked_total": len(flagged),
        "threats_blocked_today": len(flagged_today),
        "active_sessions": len(manager.sessions),
        "avg_ema_score": round(avg_ema, 3),
        "avg_windows_per_call": round(avg_windows, 1),
        "model_version": __version__,
        "use_neural": settings.use_neural,
        "env": settings.env_label,
        "device": settings.device,
        "models_loaded": getattr(inf, "_models_loaded", False),
        "loaded_models": _loaded_model_catalog(inf),
        "sample_rate": settings.audio.sample_rate,
        "window_seconds": settings.audio.window_seconds,
        "stride_seconds": settings.audio.stride_seconds,
        "buffer_seconds": settings.audio.buffer_seconds,
        "meter_interval_seconds": settings.audio.meter_interval_seconds,
        "n_fft": settings.audio.n_fft,
        "hop_length": settings.audio.hop_length,
        "n_mels": settings.audio.n_mels,
        "high_threshold": settings.decision.high_threshold,
        "medium_threshold": settings.decision.medium_threshold,
        "consecutive_required": settings.decision.consecutive_required,
        "ema_alpha": settings.decision.ema_alpha,
        "transcription_enabled": settings.transcription.enabled,
    }


@app.get("/samples")
async def list_samples() -> list[dict]:
    if not SAMPLES_DIR.exists():
        return []
    out = []
    for f in sorted(SAMPLES_DIR.glob("*.wav")):
        meta_path = f.with_suffix(".json")
        meta = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
            except Exception:
                pass
        out.append({"name": f.name, "url": f"/samples/{f.name}", **meta})
    return out


@app.get("/samples/{name}")
async def get_sample(name: str) -> FileResponse:
    p = (SAMPLES_DIR / name).resolve()
    if not p.exists() or SAMPLES_DIR.resolve() not in p.parents:
        raise HTTPException(404, "Sample not found")
    return FileResponse(p, media_type="audio/wav")


def _read_wav(data: bytes) -> tuple[np.ndarray, int]:
    import io
    wav, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    target_sr = settings.audio.sample_rate
    if sr != target_sr:
        try:
            import librosa  # high-quality polyphase resample
            wav = librosa.resample(wav.astype(np.float32), orig_sr=sr, target_sr=target_sr).astype(np.float32)
        except Exception:
            ratio = target_sr / sr
            new_len = int(len(wav) * ratio)
            wav = np.interp(
                np.linspace(0, len(wav), new_len, endpoint=False),
                np.arange(len(wav)),
                wav,
            ).astype(np.float32)
        sr = target_sr
    return wav, sr


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> JSONResponse:
    raw = await file.read()
    wav, sr = _read_wav(raw)
    inf = get_inferencer()
    cfg = settings.audio
    win_n = int(cfg.window_seconds * sr)
    stride_n = int(cfg.stride_seconds * sr)

    # Create a short-lived session purely for analytics output
    session = await manager.create(sr=sr)
    if len(wav) < win_n:
        wav = np.pad(wav, (0, win_n - len(wav)))

    results = []
    flagged_at: Optional[float] = None
    for i, start in enumerate(range(0, len(wav) - win_n + 1, stride_n)):
        seg = wav[start : start + win_n]
        res = inf.run(seg, sr, window_index=i, t_start=start / sr)
        session.windows.append(res.window)
        newly_flagged, level = update_decision(session, res.window.scores.fused)
        session.window_index = i + 1
        if newly_flagged and flagged_at is None:
            flagged_at = start / sr
        results.append({
            "i": i,
            "t_start": res.window.t_start,
            "t_end": res.window.t_end,
            "fused": res.window.scores.fused,
            "ema": session.ema_score,
            "risk": session.risk,
            "elapsed_ms": res.elapsed_ms,
        })

    payload = {
        "session_id": session.session_id,
        "duration_s": len(wav) / sr,
        "first_flag_s": flagged_at,
        "final_risk": session.risk,
        "ema_score": session.ema_score,
        "windows": [w.model_dump() for w in session.windows],
        "summary": results,
    }
    # Persist to audit log so /stats and /sessions reflect uploads too.
    try:
        audit = REPORTS_DIR / "sessions.jsonl"
        with audit.open("a", encoding="utf-8") as fp:
            fp.write(json.dumps({
                "session_id": session.session_id,
                "started_at": session.started_at.isoformat(),
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "windows": session.window_index,
                "final_risk": session.risk,
                "ema_score": session.ema_score,
                "source": "upload",
                "filename": file.filename,
            }) + "\n")
    except Exception:
        log.exception("audit append failed")
    return JSONResponse(payload)


@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket) -> None:
    await ws.accept()
    sr = settings.audio.sample_rate
    session = await manager.create(sr=sr)
    inf = get_inferencer()
    cfg = settings.audio
    win_n = int(cfg.window_seconds * sr)
    stride_n = int(cfg.stride_seconds * sr)
    meter_n = max(1, int(cfg.meter_interval_seconds * sr))
    send_lock = asyncio.Lock()
    transcript_tasks: set[asyncio.Task] = set()
    last_meter_at = 0
    last_transcript_at = -999.0
    transcriber = get_transcriber() if settings.transcription.enabled else None
    transcription_ready = False

    async def send_message(msg_type: WSKind, payload: dict) -> bool:
        try:
            async with send_lock:
                await ws.send_json({"type": msg_type, "payload": payload})
            return True
        except (WebSocketDisconnect, RuntimeError):
            return False

    async def emit_transcript(seg: np.ndarray, t_start: float, t_end: float, window_index: int) -> None:
        if not settings.transcription.enabled:
            return
        if transcriber is None or not transcription_ready:
            return
        await send_message("status", {
            "phase": "transcribing",
            "message": f"Transcribing audio around {t_start:.1f}s...",
        })
        result = await asyncio.get_event_loop().run_in_executor(None, transcriber.transcribe, seg, sr)
        if result is None:
            if transcriber._load_error is not None:
                await send_message("transcript", {
                    "status": "unavailable",
                    "reason": transcriber._load_error,
                })
            return
        if not result.text.strip():
            return
        await send_message("transcript", {
            "window_index": window_index,
            "t_start": round(t_start, 3),
            "t_end": round(t_end, 3),
            "text": result.text,
            "confidence": result.confidence,
            "source": result.source,
            "elapsed_ms": round(result.elapsed_ms, 2),
            "is_final": True,
        })

    def schedule_transcript(seg: np.ndarray, t_start: float, t_end: float, window_index: int) -> None:
        if not settings.transcription.enabled:
            return
        task = asyncio.create_task(emit_transcript(seg.copy(), t_start, t_end, window_index))
        transcript_tasks.add(task)
        task.add_done_callback(transcript_tasks.discard)

    async def emit_window(seg: np.ndarray, t_start: float) -> None:
        nonlocal last_transcript_at
        window_index = session.window_index
        res = await asyncio.get_event_loop().run_in_executor(
            None, inf.run, seg, sr, window_index, t_start
        )
        session.windows.append(res.window)
        newly_flagged, level = update_decision(session, res.window.scores.fused)
        session.window_index += 1

        await send_message("window", {
            "window": res.window.model_dump(),
            "ema_score": session.ema_score,
            "risk": session.risk,
            "newly_flagged": newly_flagged,
            "elapsed_ms": res.elapsed_ms,
        })
        t_end = t_start + len(seg) / sr
        if t_end - last_transcript_at >= settings.transcription.segment_stride_seconds:
            last_transcript_at = t_end
            schedule_transcript(seg, t_start, t_end, window_index)

        if newly_flagged:
            await send_message("state", {
                "risk": "high",
                "flagged_at": session.flagged_at.isoformat() if session.flagged_at else None,
                "first_flag_window": session.window_index - 1,
            })

    async def flush_remaining() -> None:
        if session.buf.write <= 0:
            return
        if session.window_index == 0:
            raw = session.buf.samples_between(0, session.buf.write)
            if raw is None:
                return
            seg = np.pad(raw, (0, max(0, win_n - raw.size)))[:win_n]
            await emit_window(seg.astype(np.float32, copy=False), 0.0)
            session.next_window_at = win_n + stride_n
            return

        last_window_end = max(0, session.next_window_at - stride_n)
        tail = session.buf.write - last_window_end
        min_tail = max(1, min(stride_n, sr // 2))
        if tail < min_tail:
            return
        start = max(0, session.buf.write - win_n)
        raw = session.buf.samples_between(start, session.buf.write)
        if raw is None:
            return
        seg = np.pad(raw, (0, max(0, win_n - raw.size)))[:win_n]
        await emit_window(seg.astype(np.float32, copy=False), start / sr)
        session.next_window_at = session.buf.write + stride_n

    if settings.use_neural and not getattr(inf, "_models_loaded", False):
        await send_message("status", {
            "phase": "warming_models",
            "message": "Preparing neural detectors before playback starts...",
        })
        await asyncio.get_event_loop().run_in_executor(None, inf.warmup)

    if settings.transcription.enabled and transcriber is not None:
        if not transcriber.available and transcriber._load_error is None:
            await send_message("status", {
                "phase": "warming_transcriber",
                "message": "Preparing speech transcription before playback starts...",
            })
            transcription_ready = await asyncio.get_event_loop().run_in_executor(None, transcriber.warmup)
        else:
            transcription_ready = transcriber.available
        if not transcription_ready and transcriber._load_error is not None:
            await send_message("transcript", {
                "status": "unavailable",
                "reason": transcriber._load_error,
            })

    await send_message("info", {
        "session_id": session.session_id,
        "sample_rate": sr,
        "window_seconds": cfg.window_seconds,
        "stride_seconds": cfg.stride_seconds,
        "buffer_seconds": cfg.buffer_seconds,
        "meter_interval_seconds": cfg.meter_interval_seconds,
        "n_fft": cfg.n_fft,
        "hop_length": cfg.hop_length,
        "n_mels": cfg.n_mels,
        "high_threshold": settings.decision.high_threshold,
        "medium_threshold": settings.decision.medium_threshold,
        "consecutive_required": settings.decision.consecutive_required,
        "ema_alpha": settings.decision.ema_alpha,
        "models_ready": getattr(inf, "_models_loaded", False) or not settings.use_neural,
        "transcription_enabled": settings.transcription.enabled,
        "transcription_ready": transcription_ready,
    })

    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data is None:
                # control text frame
                txt = msg.get("text") or ""
                command = txt.strip().lower()
                try:
                    control = json.loads(txt)
                    command = str(control.get("type") or control.get("command") or command).strip().lower()
                except Exception:
                    pass
                if command in ("flush", "end", "eof", "complete"):
                    await flush_remaining()
                    if transcript_tasks:
                        done, pending = await asyncio.wait(transcript_tasks, timeout=8.0)
                        for task in pending:
                            task.cancel()
                    await send_message("complete", {
                        "session_id": session.session_id,
                        "windows": session.window_index,
                        "duration_s": round(session.buf.write / sr, 3),
                        "final_risk": session.risk,
                        "ema_score": session.ema_score,
                    })
                    break
                if command in ("close", "stop"):
                    break
                continue

            pcm = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            await session.buf.push(pcm)
            if session.buf.write - last_meter_at >= meter_n:
                last_meter_at = session.buf.write
                rms = float(np.sqrt(np.mean(np.square(pcm)))) if pcm.size else 0.0
                peak = float(np.max(np.abs(pcm))) if pcm.size else 0.0
                next_at = session.next_window_at or win_n
                await send_message("meter", {
                    "t": round(session.buf.write / sr, 3),
                    "rms": round(rms, 6),
                    "peak": round(peak, 6),
                    "level_db": round(20 * float(np.log10(max(rms, 1e-6))), 2),
                    "samples_written": session.buf.write,
                    "window_progress": round(min(1.0, session.buf.write / max(next_at, 1)), 3),
                })

            # Emit windows whenever we've advanced enough.
            # next_window_at is the absolute sample index marking the END of the
            # next window to emit. First window ends at win_n; subsequent windows
            # advance by stride_n.
            if session.next_window_at == 0:
                session.next_window_at = win_n
            while session.buf.write >= session.next_window_at:
                start_at = session.next_window_at - win_n
                seg = session.buf.samples_between(start_at, session.next_window_at)
                if seg is None:
                    break
                await emit_window(seg, start_at / sr)
                session.next_window_at += stride_n
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.exception("ws error")
        try:
            await send_message("error", {"detail": str(e)})
        except Exception:
            pass
    finally:
        for task in transcript_tasks:
            task.cancel()
        # Persist a tiny audit line
        try:
            audit = REPORTS_DIR / "sessions.jsonl"
            with audit.open("a", encoding="utf-8") as fp:
                fp.write(json.dumps({
                    "session_id": session.session_id,
                    "started_at": session.started_at.isoformat(),
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                    "windows": session.window_index,
                    "final_risk": session.risk,
                    "ema_score": session.ema_score,
                    "source": "stream",
                }) + "\n")
        except Exception:
            log.exception("audit append failed")


@app.get("/sessions/{sid}")
async def get_session(sid: str) -> JSONResponse:
    s = await manager.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    return JSONResponse(s.state().model_dump())


@app.get("/sessions")
async def list_sessions(limit: int = 50) -> JSONResponse:
    """List recent persisted sessions from the audit log (most recent first)."""
    audit = REPORTS_DIR / "sessions.jsonl"
    if not audit.exists():
        return JSONResponse([])
    rows: list[dict] = []
    for line in audit.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    rows.sort(key=lambda r: r.get("ended_at") or r.get("started_at") or "", reverse=True)
    return JSONResponse(rows[: max(1, min(limit, 500))])


@app.post("/datasets/evaluate")
async def datasets_evaluate(
    files: list[UploadFile] = File(...),
    label: Optional[str] = None,
) -> JSONResponse:
    """Batch-evaluate a folder of audio files against the live pipeline.

    Each file is run through the same windowing + fusion path used in production.
    Optionally pass a `label` query (`real` or `synthetic`) so the response
    includes per-file correctness, accuracy and a confusion summary — useful
    for benchmarking on real-world datasets (ASVspoof, WaveFake, in-house).
    """
    inf = get_inferencer()
    cfg = settings.audio
    target_sr = cfg.sample_rate
    win_n = int(cfg.window_seconds * target_sr)
    stride_n = int(cfg.stride_seconds * target_sr)

    truth = (label or "").strip().lower() or None
    if truth and truth not in ("real", "synthetic"):
        raise HTTPException(400, "label must be 'real' or 'synthetic'")

    results: list[dict] = []
    correct = 0
    counted = 0
    for f in files:
        try:
            raw = await f.read()
            wav, sr = _read_wav(raw)
        except Exception as e:
            results.append({"name": f.filename, "error": f"decode: {e}"})
            continue
        if len(wav) < win_n:
            wav = np.pad(wav, (0, win_n - len(wav)))
        fused_per_window: list[float] = []
        ema = 0.0
        alpha = settings.decision.ema_alpha
        for i, start in enumerate(range(0, len(wav) - win_n + 1, stride_n)):
            seg = wav[start : start + win_n]
            res = inf.run(seg, sr, window_index=i, t_start=start / sr, with_explain=False)
            fused = res.window.scores.fused
            fused_per_window.append(fused)
            ema = fused if i == 0 else (alpha * fused + (1 - alpha) * ema)
        if not fused_per_window:
            results.append({"name": f.filename, "error": "no windows produced"})
            continue
        max_p = max(fused_per_window)
        pred = "synthetic" if (ema >= settings.decision.high_threshold or max_p >= settings.decision.high_threshold) else "real"
        row: dict[str, object] = {
            "name": f.filename,
            "duration_s": round(len(wav) / sr, 3),
            "windows": len(fused_per_window),
            "max_fused": round(max_p, 4),
            "ema_fused": round(ema, 4),
            "prediction": pred,
        }
        if truth is not None:
            row["label"] = truth
            row["correct"] = (pred == truth)
            counted += 1
            if row["correct"]:
                correct += 1
        results.append(row)

    summary: dict[str, object] = {"files": len(results)}
    if truth is not None and counted:
        summary["label"] = truth
        summary["evaluated"] = counted
        summary["correct"] = correct
        summary["accuracy"] = round(correct / counted, 4)
    return JSONResponse({"summary": summary, "results": results})


@app.get("/sessions/{sid}/report")
async def session_report(sid: str) -> Response:
    s = await manager.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    from .reports import build_pdf

    pdf_bytes = build_pdf(s.state())
    headers = {"Content-Disposition": f'attachment; filename="voiceshield-{sid}.pdf"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    main()
