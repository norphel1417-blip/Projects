import { create } from "zustand";

export type Risk = "low" | "medium" | "high";

export interface ForensicFeatures {
  pitch_jitter: number;
  pitch_shimmer: number;
  spectral_kurtosis: number;
  spectral_flatness: number;
  phase_coherence: number;
  hf_energy_ratio: number;
  spectral_tilt: number;
  voiced_ratio: number;
}

export interface ReasoningStep {
  stage: string;
  label: string;
  thought: string;
  evidence: Record<string, any>;
  elapsed_ms: number;
}

export interface ScoreSnap {
  t: number;            // window start time (s)
  forensic: number;
  neural_a: number | null;
  neural_b: number | null;
  neural_c: number | null;
  fused: number;
  ema: number;
  stability: number;
  reasons: string[];
  features?: ForensicFeatures;
  threat_fingerprint?: string | null;
  threat_confidence?: number;
  spectrogram_b64?: string;
  gradcam_b64?: string;
  waveform_b64?: string;
  reasoning_chain?: ReasoningStep[];
  risk: Risk;
  neural_available?: boolean;
}

export type ActionKind =
  | "freeze_call"
  | "send_otp"
  | "transfer_branch"
  | "mark_safe"
  | "session_start"
  | "session_end"
  | "risk_change"
  | "report_export";

export interface ActionLog {
  id: string;
  ts: number;
  kind: ActionKind;
  title: string;
  detail?: string;
  severity?: "info" | "success" | "warn" | "danger";
}

export interface LoadedModel {
  id: string;
  track: string;
  role: string;
  arch?: string;
}

export interface StreamInfo {
  sample_rate?: number;
  window_seconds?: number;
  stride_seconds?: number;
  buffer_seconds?: number;
  meter_interval_seconds?: number;
  n_fft?: number;
  hop_length?: number;
  n_mels?: number;
  high_threshold?: number;
  medium_threshold?: number;
  consecutive_required?: number;
  ema_alpha?: number;
  transcription_enabled?: boolean;
}

export interface TranscriptSegment {
  id: string;
  t_start: number;
  t_end: number;
  text: string;
  confidence?: number | null;
  source?: string;
  is_final?: boolean;
}

export interface PlaybackState {
  url?: string;
  filename?: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  volume: number;
  rate: number;
}

export interface AudioMeter {
  t: number;
  rms: number;
  peak: number;
  level_db: number;
  samples_written: number;
  window_progress: number;
  updatedAt: number;
}

export interface Stats extends StreamInfo {
  calls_total: number;
  calls_today: number;
  threats_blocked_total: number;
  threats_blocked_today: number;
  active_sessions: number;
  avg_ema_score: number;
  avg_windows_per_call: number;
  model_version: string;
  use_neural: boolean;
  env?: string;
  device?: string;
  loaded_models?: LoadedModel[];
  models_loaded?: boolean;
}

export const MAX_WINDOW_BUFFER = 180;

export interface Toast {
  id: string;
  title: string;
  body?: string;
  severity?: "info" | "success" | "warn" | "danger";
  ttl?: number;
}

interface State {
  connected: boolean;
  sessionId?: string;
  windows: ScoreSnap[];
  ema: number;
  risk: Risk;
  flaggedAtSec?: number;
  startTs?: number;
  source: "mic" | "sample" | "idle";
  error?: string;
  actions: ActionLog[];
  stats?: Stats;
  streamInfo?: StreamInfo;
  transcriptSegments: TranscriptSegment[];
  transcriptStatus: "idle" | "warming" | "listening" | "transcribing" | "unavailable";
  playback: PlaybackState;
  audioMeter?: AudioMeter;
  toasts: Toast[];
  // autonomous run lifecycle
  currentFilename?: string;
  sessionComplete: boolean;
  // tab routing
  tab: "overview" | "live" | "sessions" | "analytics" | "datasets" | "settings";
  // user-tunable preferences (UI-side; affect risk display, density, polling)
  prefs: {
    highThreshold: number;       // 0..1
    mediumThreshold: number;     // 0..1
    statsPollMs: number;         // 1000..30000
    density: "comfortable" | "compact";
    showSpectrograms: boolean;
    showHeatmap: boolean;
    autoExportOnHigh: boolean;
  };
  setTab(t: State["tab"]): void;
  setPrefs(p: Partial<State["prefs"]>): void;
  setConnected(b: boolean): void;
  setSession(id: string): void;
  pushWindow(w: ScoreSnap): void;
  setRisk(r: Risk, flaggedAtSec?: number): void;
  reset(source: "mic" | "sample"): void;
  setError(e?: string): void;
  pushAction(a: Omit<ActionLog, "id" | "ts"> & { ts?: number }): void;
  setStats(s: Stats): void;
  setStreamInfo(s: StreamInfo): void;
  pushTranscript(s: Omit<TranscriptSegment, "id"> & { id?: string }): void;
  setTranscriptStatus(s: State["transcriptStatus"]): void;
  setPlayback(p: Partial<PlaybackState>): void;
  setAudioMeter(m: Omit<AudioMeter, "updatedAt">): void;
  pushToast(t: Omit<Toast, "id">): void;
  dismissToast(id: string): void;
  setCurrentFilename(name?: string): void;
  setSessionComplete(b: boolean): void;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const PREFS_KEY = "voiceshield.prefs.v1";
const TAB_KEY = "voiceshield.tab.v2";
const loadPrefs = (): State["prefs"] => {
  const def = {
    highThreshold: 0.85,
    mediumThreshold: 0.65,
    statsPollMs: 5000,
    density: "comfortable" as const,
    showSpectrograms: true,
    showHeatmap: true,
    autoExportOnHigh: false,
  };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch { return def; }
};
const loadTab = (): State["tab"] => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TAB_KEY) : null;
    if (raw === "overview" || raw === "live" || raw === "sessions" || raw === "analytics" || raw === "datasets" || raw === "settings") return raw;
  } catch {}
  return "overview";
};

export const useStore = create<State>((set, get) => ({
  connected: false,
  windows: [],
  ema: 0,
  risk: "low",
  source: "idle",
  actions: [],
  transcriptSegments: [],
  transcriptStatus: "idle",
  playback: {
    currentTime: 0,
    duration: 0,
    playing: false,
    volume: 0.85,
    rate: 1,
  },
  toasts: [],
  sessionComplete: false,
  tab: loadTab(),
  prefs: loadPrefs(),
  setTab: (t) => {
    try { localStorage.setItem(TAB_KEY, t); } catch {}
    set({ tab: t });
  },
  setPrefs: (p) => set((s) => {
    const next = { ...s.prefs, ...p };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
    return { prefs: next };
  }),
  setConnected: (b) => set({ connected: b }),
  setSession: (id) => set({ sessionId: id }),
  pushWindow: (w) =>
    set((s) => {
      const prevRisk = s.risk;
      const next: Partial<State> = {
        windows: [...s.windows, w].slice(-MAX_WINDOW_BUFFER),
        ema: w.ema,
        risk: w.risk,
      };
      if (w.risk !== prevRisk) {
        const sev: ActionLog["severity"] =
          w.risk === "high" ? "danger" : w.risk === "medium" ? "warn" : "success";
        next.actions = [
          ...s.actions,
          {
            id: newId(),
            ts: Date.now(),
            kind: "risk_change",
            title: `Risk → ${w.risk.toUpperCase()}`,
            detail: `EMA ${(w.ema * 100).toFixed(1)}% at t=${w.t.toFixed(1)}s`,
            severity: sev,
          },
        ].slice(-200);
      }
      return next;
    }),
  setRisk: (r, flaggedAtSec) =>
    set((s) => ({ risk: r, flaggedAtSec: flaggedAtSec ?? s.flaggedAtSec })),
  reset: (source) => {
    const startedAt = Date.now();
    set({
      windows: [],
      ema: 0,
      risk: "low",
      flaggedAtSec: undefined,
      sessionId: undefined,
      startTs: startedAt,
      source,
      error: undefined,
      sessionComplete: false,
      transcriptSegments: [],
      transcriptStatus: "idle",
      audioMeter: undefined,
      actions: [
        {
          id: newId(),
          ts: startedAt,
          kind: "session_start",
          title: `Session started (${source})`,
          severity: "info",
        },
      ],
    });
  },
  setError: (e) => set({ error: e }),
  pushAction: (a) =>
    set((s) => ({
      actions: [
        ...s.actions,
        { id: newId(), ts: a.ts ?? Date.now(), ...a },
      ].slice(-200),
    })),
  setStats: (st) => set({ stats: st }),
  setStreamInfo: (info) => set((s) => ({ streamInfo: { ...s.streamInfo, ...info } })),
  pushTranscript: (segment) =>
    set((s) => {
      const text = segment.text.trim();
      if (!text) return { transcriptStatus: "listening" };
      const prev = s.transcriptSegments[s.transcriptSegments.length - 1];
      if (prev && prev.text.trim().toLowerCase() === text.toLowerCase() && Math.abs(prev.t_end - segment.t_start) <= 3) {
        return {
          transcriptStatus: "listening",
          transcriptSegments: [
            ...s.transcriptSegments.slice(0, -1),
            { ...prev, t_end: Math.max(prev.t_end, segment.t_end), is_final: segment.is_final ?? prev.is_final },
          ],
        };
      }
      return {
        transcriptStatus: "listening",
        transcriptSegments: [
          ...s.transcriptSegments,
          { ...segment, id: segment.id ?? newId(), text },
        ].slice(-120),
      };
    }),
  setTranscriptStatus: (status) => set({ transcriptStatus: status }),
  setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
  setAudioMeter: (meter) => set({ audioMeter: { ...meter, updatedAt: Date.now() } }),
  pushToast: (t) => {
    const id = newId();
    set((s) => ({ toasts: [...s.toasts, { id, ttl: 3500, ...t }] }));
    setTimeout(() => {
      const cur = get().toasts.find((x) => x.id === id);
      if (cur) get().dismissToast(id);
    }, t.ttl ?? 3500);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setCurrentFilename: (name) => set({ currentFilename: name }),
  setSessionComplete: (b) => set({ sessionComplete: b }),
}));
