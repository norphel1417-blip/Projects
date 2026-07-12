/**
 * Audio capture + WebSocket client.
 * Captures the microphone, downsamples to 16 kHz Int16 PCM via an
 * AudioWorklet, and streams chunks to /ws/stream.
 *
 * Also supports streaming a server-side reference audio file (.wav) by
 * fetching its bytes and pushing them as int16 chunks for parity with the
 * mic code path, plus a one-shot `uploadAudio` helper that posts an
 * arbitrary user-supplied file to /api/upload for full-recording analysis.
 */
import { useStore, ScoreSnap, Risk } from "../store";

const WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/stream`;
})();

let ws: WebSocket | null = null;
let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let micStream: MediaStream | null = null;
let sampleTimer: number | null = null;
let playbackEl: HTMLAudioElement | null = null;
let playbackUrl: string | null = null;
let completeTimer: number | null = null;
let streamFinished = false;
const STREAM_READY_TIMEOUT_MS = 120000;

function syncPlayback(filename?: string) {
  const el = playbackEl;
  useStore.getState().setPlayback({
    url: playbackUrl ?? undefined,
    filename: filename ?? useStore.getState().playback.filename,
    currentTime: el?.currentTime ?? 0,
    duration: Number.isFinite(el?.duration ?? NaN) ? el!.duration : 0,
    playing: !!el && !el.paused && !el.ended,
    volume: el?.volume ?? useStore.getState().playback.volume,
    rate: el?.playbackRate ?? useStore.getState().playback.rate,
  });
}

function startPlayback(blob: Blob, filename?: string) {
  stopPlayback();
  try {
    playbackUrl = URL.createObjectURL(blob);
    playbackEl = new Audio(playbackUrl);
    playbackEl.preload = "auto";
    playbackEl.volume = useStore.getState().playback.volume;
    playbackEl.playbackRate = useStore.getState().playback.rate;
    const events = ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "ratechange", "volumechange"];
    events.forEach((event) => playbackEl?.addEventListener(event, () => syncPlayback(filename)));
    syncPlayback(filename);
    // Best-effort autoplay; browsers may block until user gesture (file picker counts).
    playbackEl.play().then(() => syncPlayback(filename)).catch(() => syncPlayback(filename));
    // expose globally so an audio control surface in the UI can attach to it
    (window as any).__voiceshield_playback = playbackEl;
    window.dispatchEvent(new CustomEvent("voiceshield:playback", { detail: { url: playbackUrl, filename } }));
  } catch { /* ignore */ }
}

function stopPlayback() {
  if (playbackEl) {
    try { playbackEl.pause(); } catch {}
    playbackEl.src = "";
    playbackEl = null;
  }
  if (playbackUrl) {
    try { URL.revokeObjectURL(playbackUrl); } catch {}
    playbackUrl = null;
  }
  (window as any).__voiceshield_playback = null;
  window.dispatchEvent(new CustomEvent("voiceshield:playback", { detail: { url: null } }));
  useStore.getState().setPlayback({
    url: undefined,
    filename: undefined,
    currentTime: 0,
    duration: 0,
    playing: false,
  });
}

function scheduleCompletion(delayMs: number) {
  if (completeTimer != null) { window.clearTimeout(completeTimer); completeTimer = null; }
  completeTimer = window.setTimeout(() => {
    completeTimer = null;
    const st = useStore.getState();
    if (st.windows.length > 0 && st.source !== "mic") {
      useStore.getState().setSessionComplete(true);
    }
  }, delayMs);
}

function finishFileStream() {
  if (streamFinished) return;
  streamFinished = true;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "flush" }));
  }
  scheduleCompletion(Math.max(completionDelayMs(), 3000));
}

function completionDelayMs() {
  const st = useStore.getState();
  const seconds =
    st.streamInfo?.stride_seconds ??
    st.stats?.stride_seconds ??
    st.streamInfo?.window_seconds ??
    st.stats?.window_seconds ??
    2;
  return Math.ceil(seconds * 1000);
}

function onMessage(ev: MessageEvent): string | undefined {
  if (typeof ev.data !== "string") return undefined;
  try {
    const msg = JSON.parse(ev.data);
    const store = useStore.getState();
    if (msg.type === "info") {
      store.setSession(msg.payload.session_id);
      store.setStreamInfo({
        sample_rate: msg.payload.sample_rate,
        window_seconds: msg.payload.window_seconds,
        stride_seconds: msg.payload.stride_seconds,
        buffer_seconds: msg.payload.buffer_seconds,
        meter_interval_seconds: msg.payload.meter_interval_seconds,
        n_fft: msg.payload.n_fft,
        hop_length: msg.payload.hop_length,
        n_mels: msg.payload.n_mels,
        high_threshold: msg.payload.high_threshold,
        medium_threshold: msg.payload.medium_threshold,
        consecutive_required: msg.payload.consecutive_required,
        ema_alpha: msg.payload.ema_alpha,
        transcription_enabled: msg.payload.transcription_enabled,
      });
      store.setTranscriptStatus(msg.payload.transcription_enabled ? (msg.payload.transcription_ready ? "listening" : "warming") : "unavailable");
    } else if (msg.type === "window") {
      const firstWindow = store.windows.length === 0;
      const w = msg.payload.window;
      const snap: ScoreSnap = {
        t: w.t_start,
        forensic: w.scores.forensic,
        neural_a: w.scores.neural_a ?? null,
        neural_b: w.scores.neural_b ?? null,
        neural_c: w.scores.neural_c ?? null,
        fused: w.scores.fused,
        ema: msg.payload.ema_score,
        stability: w.stability ?? 1,
        reasons: w.reasons ?? [],
        features: w.features,
        threat_fingerprint: w.threat_fingerprint ?? null,
        threat_confidence: w.threat_confidence ?? 0,
        spectrogram_b64: w.spectrogram_b64,
        gradcam_b64: w.gradcam_b64,
        waveform_b64: w.waveform_b64,
        reasoning_chain: w.reasoning_chain ?? [],
        risk: msg.payload.risk as Risk,
        neural_available: w.scores.neural_available ?? false,
      };
      store.pushWindow(snap);
      store.setRisk(msg.payload.risk as Risk, msg.payload.newly_flagged ? w.t_start : undefined);
      if (firstWindow && store.source !== "mic") {
        useStore.getState().setError(undefined);
      }
    } else if (msg.type === "state") {
      // backend sends iso flagged_at; we already captured t_start above
      store.setRisk(msg.payload.risk as Risk);
    } else if (msg.type === "status") {
      store.setError(String(msg.payload?.message ?? "Preparing live analysis pipeline..."));
      if (msg.payload?.phase === "warming_transcriber") store.setTranscriptStatus("warming");
      if (msg.payload?.phase === "transcribing") store.setTranscriptStatus("transcribing");
    } else if (msg.type === "meter") {
      const payload = msg.payload ?? {};
      store.setAudioMeter({
        t: Number(payload.t ?? 0),
        rms: Number(payload.rms ?? 0),
        peak: Number(payload.peak ?? 0),
        level_db: Number(payload.level_db ?? -120),
        samples_written: Number(payload.samples_written ?? 0),
        window_progress: Number(payload.window_progress ?? 0),
      });
    } else if (msg.type === "complete") {
      if (store.source !== "mic") {
        store.setSessionComplete(true);
      }
      store.setError(undefined);
    } else if (msg.type === "transcript") {
      const payload = msg.payload ?? {};
      if (payload.status === "unavailable") {
        store.setTranscriptStatus("unavailable");
      } else {
        store.pushTranscript({
          t_start: Number(payload.t_start ?? 0),
          t_end: Number(payload.t_end ?? payload.t_start ?? 0),
          text: String(payload.text ?? ""),
          confidence: payload.confidence ?? null,
          source: payload.source ?? "whisper",
          is_final: payload.is_final ?? true,
        });
      }
    } else if (msg.type === "error") {
      store.setError(String(msg.payload?.message ?? msg.payload?.detail ?? "unknown error"));
    }
    return msg.type;
  } catch {
    /* ignore */
  }
  return undefined;
}

async function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(WS_URL);
    sock.binaryType = "arraybuffer";
    let settled = false;
    const readyTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      try { sock.close(); } catch {}
      reject(new Error("stream setup timed out while preparing models"));
    }, STREAM_READY_TIMEOUT_MS);
    sock.onopen = () => {
      useStore.getState().setConnected(true);
    };
    sock.onmessage = (ev) => {
      const type = onMessage(ev);
      if (type === "info" && !settled) {
        settled = true;
        window.clearTimeout(readyTimer);
        resolve(sock);
      }
    };
    sock.onerror = (e) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(readyTimer);
        reject(e);
      }
    };
    sock.onclose = () => {
      useStore.getState().setConnected(false);
      if (!settled) {
        settled = true;
        window.clearTimeout(readyTimer);
        reject(new Error("stream closed before backend readiness"));
      }
    };
  });
}

export async function startMic() {
  stopAll();
  useStore.getState().reset("mic");
  ws = await openSocket();

  audioCtx = new AudioContext({ sampleRate: 48000 });
  await audioCtx.audioWorklet.addModule("/audioworklet.js");
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
  });
  const src = audioCtx.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(audioCtx, "pcm-downsampler", {
    processorOptions: { targetSr: 16000 },
  });
  workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(ev.data);
  };
  src.connect(workletNode);
  // Worklet does not need to reach destination
}

function streamInt16WithPlayback(i16: Int16Array, sr = 16000) {
  const chunk = 1024;
  let pos = 0;
  streamFinished = false;
  sampleTimer = window.setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const el = playbackEl;
    if (el && el.paused && !el.ended) return;

    const targetPos = el
      ? Math.min(i16.length, Math.max(pos, Math.floor(el.currentTime * sr)))
      : Math.min(i16.length, pos + chunk);
    let sends = 0;
    while (pos < targetPos && sends < 8) {
      const slice = i16.subarray(pos, Math.min(pos + chunk, targetPos));
      ws.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
      pos += slice.length;
      sends += 1;
    }

    if (pos >= i16.length || el?.ended) {
      if (pos < i16.length) {
        const slice = i16.subarray(pos);
        ws.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
        pos = i16.length;
      }
      window.clearInterval(sampleTimer!);
      sampleTimer = null;
      finishFileStream();
    }
  }, 33);
}

export async function streamSample(name: string) {
  stopAll();
  useStore.getState().reset("sample");
  useStore.getState().setCurrentFilename(name);
  useStore.getState().setError(`Preparing "${name}" for live analysis...`);

  const resp = await fetch(`/api/samples/${encodeURIComponent(name)}`);
  if (!resp.ok) throw new Error(`fetch ${name}: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/wav" });
  const { samples, sr } = decodeWav(buf);
  // resample if needed
  const target = 16000;
  const wav16 = sr === target ? samples : linearResample(samples, sr, target);
  const i16 = floatToInt16(wav16);

  ws = await openSocket();
  useStore.getState().setError(`Streaming "${name}" -> live windows incoming...`);
  // Begin playback only after the backend has warmed and sent runtime config.
  startPlayback(blob, name);
  streamInt16WithPlayback(i16, target);
}

export async function streamUploadedFile(file: File) {
  stopAll();
  useStore.getState().reset("sample");
  useStore.getState().setCurrentFilename(file.name);
  useStore.getState().setError(`Preparing "${file.name}" for live analysis...`);
  const buf = await file.arrayBuffer();
  let samples: Float32Array; let sr: number;
  try {
    ({ samples, sr } = decodeWav(buf));
  } catch {
    // Fall back to WebAudio decoder for non-PCM16 / non-WAV files (mp3/ogg/flac via browser).
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    sr = decoded.sampleRate;
    samples = decoded.getChannelData(0).slice();
    if (decoded.numberOfChannels > 1) {
      const r = decoded.getChannelData(1);
      for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] + r[i]) * 0.5;
    }
    ctx.close().catch(() => {});
  }
  const target = 16000;
  const wav16 = sr === target ? samples : linearResample(samples, sr, target);
  const i16 = floatToInt16(wav16);
  ws = await openSocket();
  useStore.getState().setError(`Streaming "${file.name}" -> live windows incoming...`);
  // Keep audio playback synchronized with analysis startup instead of model loading.
  startPlayback(file, file.name);
  streamInt16WithPlayback(i16, target);
}

export function stopAll() {
  if (sampleTimer) { window.clearInterval(sampleTimer); sampleTimer = null; }
  if (completeTimer) { window.clearTimeout(completeTimer); completeTimer = null; }
  if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  if (ws) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send("stop");
      ws.close();
    } catch {}
    ws = null;
  }
  stopPlayback();
  useStore.getState().setConnected(false);
}

export function togglePlayback() {
  if (!playbackEl) return;
  if (playbackEl.paused) playbackEl.play().catch(() => syncPlayback());
  else playbackEl.pause();
  syncPlayback();
}

export function seekPlayback(seconds: number) {
  if (!playbackEl || !Number.isFinite(seconds)) return;
  playbackEl.currentTime = Math.max(0, Math.min(seconds, playbackEl.duration || seconds));
  syncPlayback();
}

export function setPlaybackVolume(volume: number) {
  const v = Math.max(0, Math.min(1, volume));
  if (playbackEl) playbackEl.volume = v;
  useStore.getState().setPlayback({ volume: v });
}

export function setPlaybackRate(rate: number) {
  const r = Math.max(0.5, Math.min(2, rate));
  if (playbackEl) playbackEl.playbackRate = r;
  useStore.getState().setPlayback({ rate: r });
}

// ----- WAV decoding (PCM16 mono/stereo) ---------------------------------
function decodeWav(buf: ArrayBuffer): { samples: Float32Array; sr: number } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x52494646) throw new Error("not RIFF");
  // Parse fmt + data chunks
  let offset = 12;
  let sr = 16000, channels = 1, bits = 16, dataOffset = 0, dataLen = 0;
  while (offset < dv.byteLength) {
    const id = dv.getUint32(offset, false);
    const size = dv.getUint32(offset + 4, true);
    if (id === 0x666d7420 /* fmt  */) {
      channels = dv.getUint16(offset + 10, true);
      sr = dv.getUint32(offset + 12, true);
      bits = dv.getUint16(offset + 22, true);
    } else if (id === 0x64617461 /* data */) {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size;
  }
  if (bits !== 16) throw new Error(`unsupported bits=${bits}`);
  const total = dataLen / 2;
  const out = new Float32Array(total / channels);
  let oi = 0;
  for (let i = 0; i < total; i += channels) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += dv.getInt16(dataOffset + (i + c) * 2, true);
    out[oi++] = (sum / channels) / 0x8000;
  }
  return { samples: out, sr };
}

function linearResample(x: Float32Array, srIn: number, srOut: number): Float32Array {
  const ratio = srIn / srOut;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * ratio;
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, x.length - 1);
    const f = t - i0;
    out[i] = x[i0] * (1 - f) + x[i1] * f;
  }
  return out;
}

function floatToInt16(x: Float32Array): Int16Array {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// ---- Stats polling --------------------------------------------------------
let statsTimer: number | null = null;
async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const j = await r.json();
    useStore.getState().setStats(j);
  } catch { /* ignore */ }
}
export function startStatsPolling(intervalMs = 5000) {
  if (statsTimer != null) return;
  fetchStats();
  statsTimer = window.setInterval(fetchStats, intervalMs);
}
export function stopStatsPolling() {
  if (statsTimer != null) { window.clearInterval(statsTimer); statsTimer = null; }
}

// ---- One-shot file analysis ----------------------------------------------
/**
 * Upload an arbitrary audio file (any sample rate / format soundfile can read)
 * to /api/upload. The backend windows it through the same pipeline used for
 * the live mic and returns per-window scores + final risk.
 */
export async function uploadAudio(file: File): Promise<any> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload ${file.name}: ${r.status} ${await r.text().catch(() => "")}`);
  return r.json();
}

/**
 * Batch-evaluate a list of files against the live pipeline. Pass a label
 * ("real" | "synthetic") to also receive accuracy + per-file correctness.
 */
export async function evaluateDataset(files: File[], label?: "real" | "synthetic"): Promise<any> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f, f.name);
  const url = "/api/datasets/evaluate" + (label ? `?label=${encodeURIComponent(label)}` : "");
  const r = await fetch(url, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`evaluate: ${r.status} ${await r.text().catch(() => "")}`);
  return r.json();
}
