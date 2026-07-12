# VoiceShield · Threat Model

UCO Bank PSB Hackathon 2026 — Problem 2 (Audio Forensics for Voice Security).

## 1. System overview
VoiceShield ingests live or sampled call audio in 4-second windows (2-second stride),
runs a three-headed forensic + neural ensemble, fuses the scores with a calibrated
logistic, and emits per-window risk plus a sticky session decision (`low | medium | high`).
Decision rule: EMA(P_synthetic) ≥ 0.85 once **or** ≥ 0.65 for two consecutive windows.

```
Caller ──▶ Banker browser (mic / WAV) ──▶ WS /ws/stream ──▶ FastAPI backend
                                                          │
                              ┌───────────────────────────┼─────────────────────────┐
                              ▼                           ▼                         ▼
                        Forensic head             wav2vec2-base + GAT       whisper-tiny enc + MLP
                              └─────── logistic fusion + EMA + decision ────────────┘
                                                          │
                                          window/state JSON ▶ React UI + PDF report
```

## 2. Assets
| Asset | Sensitivity | Notes |
|---|---|---|
| Live call PCM | High | Never persisted by default; only ring-buffered in RAM. |
| Session audit (`reports/sessions.jsonl`) | Medium | IDs, timestamps, final risk, EMA — no audio. |
| PDF reports | Medium | Generated on demand; contain spectrogram thumbnails. |
| Model weights | Low | Public HF checkpoints. |

## 3. Trust boundaries
1. Browser ↔ FastAPI (WS, REST). Same-origin in prod via nginx proxy.
2. FastAPI ↔ HuggingFace Hub (one-time weight download; offline thereafter).
3. FastAPI ↔ local filesystem (samples, reports). Path-traversal guarded.

## 4. STRIDE per component

### 4.1 WebSocket `/ws/stream`
- **S (Spoofing):** Anyone reaching the port can open a session. *Mitigation (prod):* terminate TLS + auth at reverse proxy; bind to internal network; enforce origin check.
- **T (Tampering):** Binary PCM frames are trusted as int16 mono 16 kHz. Malformed frames silently drop NaNs in feature extractor.
- **R (Repudiation):** `sessions.jsonl` records start/end, window count, final risk.
- **I (Information disclosure):** No audio echoed back. Window payload contains base64 PNG thumbnails (downscaled mel + Grad-CAM); not original speech.
- **D (DoS):** Per-message inference is bounded (~100–300 ms on CPU). *Mitigation:* uvicorn worker limits, optional per-IP rate limit, ring buffer caps memory at ≤ 10 s × 2 bytes × 16 kHz ≈ 320 kB/session.
- **E (Elevation):** Pure inference path; no shell-out, no eval.

### 4.2 REST endpoints
- `/samples/{name}` — guarded with `Path.resolve()` parent check; only serves files under `data/samples`.
- `/upload` — accepts user WAV; bounded by FastAPI body limit; decoded with soundfile (libsndfile, sandboxed format).
- `/sessions/{sid}/report` — returns PDF generated server-side; no client-supplied HTML.

### 4.3 Models
- Weights pulled from `facebook/wav2vec2-base` and `openai/whisper-tiny` once at startup; cached under `HF_HOME`. **Pinned** to safetensors hashes in `scripts.download_weights` for supply-chain integrity (recommended for prod).
- All inference runs **frozen** with `torch.inference_mode()`; no fine-tuning at runtime.

## 5. Adversarial considerations (deepfake threat)

| Attack | Description | Defense |
|---|---|---|
| Off-the-shelf TTS (Tortoise, XTTS, ElevenLabs) | Cloned voice with conversational prosody | Forensic head detects unnatural HNR, jitter≈0, narrowband energy; neural heads pick up codec/over-smoothing artefacts. Three-head fusion + EMA reduces single-head false negatives. |
| Replayed deepfake over phone codec | Compression masks artefacts | Whisper-tiny encoder trained on noisy speech is robust; forensic features (spectral flatness, residual phase) survive G.711 pass-through. |
| Splice attack (real prefix → fake payload) | Hide synthetic content in middle of call | 2-s stride windowing + per-window risk; sticky decision triggers as soon as 2 consecutive windows exceed 0.65. |
| Adversarial perturbation against ensemble | White-box noise to suppress one head | Heterogeneous heads (forensic DSP + 2 SSL models) require coordinated attack on three architectures + a logistic threshold; ensemble disagreement flagged as low `stability`. |
| Audio injection at API | Send pre-crafted PCM | Same defenses as live; additionally `/upload` is rate-limited by gateway in prod. |

## 6. Privacy & compliance
- No raw call audio is written to disk in default config.
- Session audit retains **only** metadata; can be disabled by setting `VOICESHIELD_DISABLE_AUDIT=1` (future flag).
- PDF reports are user-initiated and contain only summary stats + low-resolution mel thumbnails — no transcripts.
- Suitable for on-prem deployment behind a bank's existing call-center perimeter.

## 7. Operational guardrails
- **Advisory only.** UI explicitly states "Advisory signal — do not use as sole basis for blocking transactions."
- **Human in the loop.** AgentAssist proposes step-up auth, not automatic call termination.
- **Override.** Banker can dismiss / mark false positive (future: feeds calibration set).

## 8. Known limitations
- CPU-only inference target ~p95 600 ms; bursty traffic may queue windows.
- Forensic features assume voiced speech; pure silence / DTMF tones are scored as low confidence (`stability ≪ 1`).
- No speaker enrolment — system is text- and speaker-independent by design.
