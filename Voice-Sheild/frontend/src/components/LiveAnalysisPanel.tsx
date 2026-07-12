import { useEffect, useRef, useState } from "react";
import { useStore, ReasoningStep, ScoreSnap } from "../store";
import { streamUploadedFile, stopAll } from "../lib/audio";
import {
  Activity, Brain, Cpu, FileAudio, Loader2, Scale, ShieldAlert, Sparkles, Square, Upload,
} from "lucide-react";
import clsx from "clsx";

const STAGE_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  feat:     { label: "Forensic features",  color: "#3b6ea5", bg: "rgba(59,110,165,0.10)", icon: Activity },
  ast:      { label: "AST neural track",   color: "#a37d2c", bg: "rgba(163,125,44,0.12)",  icon: Brain },
  forensic: { label: "Forensic logistic",  color: "#7a4ea8", bg: "rgba(122,78,168,0.12)",  icon: Cpu },
  fusion:   { label: "Adaptive fusion",    color: "#2c8f8f", bg: "rgba(44,143,143,0.12)",  icon: Scale },
  verdict:  { label: "Verdict",            color: "#8e2f3d", bg: "rgba(142,47,61,0.12)",   icon: ShieldAlert },
};

function fmt(n: any, digits = 3): string {
  if (n === null || n === undefined) return "—";
  if (typeof n === "number") return n.toFixed(digits);
  if (Array.isArray(n)) return n.map((x) => fmt(x, digits)).join(", ");
  if (typeof n === "object") return JSON.stringify(n);
  return String(n);
}

function fmtSeconds(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function TypedThought({ text, color }: { text: string; color: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += Math.max(1, Math.round(text.length / 40));
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <div className="text-[12px] leading-relaxed font-mono text-ink-800">
      <span style={{ color }} className="font-bold">▍</span> {shown}
      {shown.length < text.length && <span className="opacity-60 animate-pulse">▍</span>}
    </div>
  );
}

function StageRow({ step, idx }: { step: ReasoningStep; idx: number }) {
  const meta = STAGE_META[step.stage] ?? { label: step.stage, color: "#444", bg: "rgba(0,0,0,0.05)", icon: Sparkles };
  const Icon = meta.icon;
  const evidenceEntries = Object.entries(step.evidence).slice(0, 8);
  return (
    <div
      className="rounded-xl border border-line p-3 space-y-2"
      style={{ background: meta.bg, borderColor: meta.color + "44" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: meta.color }}>{idx + 1}</span>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
          <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[10px] text-ink-500 font-mono">· {step.label}</span>
        </div>
        <span className="text-[10px] font-mono text-ink-500">{step.elapsed_ms.toFixed(1)} ms</span>
      </div>
      <TypedThought text={step.thought} color={meta.color} />
      {evidenceEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 pt-1 border-t border-dashed" style={{ borderColor: meta.color + "33" }}>
          {evidenceEntries.map(([k, v]) => (
            <div key={k} className="text-[10px] font-mono leading-tight">
              <span className="text-ink-500">{k}</span>{" "}
              <span className="text-ink-900 font-semibold">{fmt(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimingBar({ chain }: { chain: ReasoningStep[] }) {
  const total = chain.reduce((s, c) => s + c.elapsed_ms, 0) || 1;
  return (
    <div className="space-y-1">
      <div className="label">Per-stage latency · total {total.toFixed(1)} ms</div>
      <div className="flex h-3 rounded-full overflow-hidden border border-line">
        {chain.map((s, i) => {
          const m = STAGE_META[s.stage] ?? { color: "#888" };
          return (
            <div key={i}
              title={`${s.stage} · ${s.elapsed_ms.toFixed(1)} ms`}
              style={{ width: `${(s.elapsed_ms / total) * 100}%`, background: (m as any).color }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-mono text-ink-500">
        {chain.map((s, i) => {
          const m = STAGE_META[s.stage] ?? { color: "#888" };
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: (m as any).color }} />
              {s.stage} {s.elapsed_ms.toFixed(1)}ms
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-6" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 100;
  const h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6">
      <polyline fill="none" stroke={color} strokeWidth="1.4" points={pts} />
    </svg>
  );
}

function FeatureDeltaGrid({ windows }: { windows: ScoreSnap[] }) {
  const last = windows.slice(-30);
  if (last.length === 0) return null;
  const keys: (keyof NonNullable<ScoreSnap["features"]>)[] = [
    "pitch_jitter", "pitch_shimmer", "spectral_kurtosis", "spectral_flatness",
    "phase_coherence", "hf_energy_ratio", "spectral_tilt", "voiced_ratio",
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {keys.map((k) => {
        const series = last.map((w) => w.features?.[k] ?? 0);
        const cur = series[series.length - 1] ?? 0;
        const prev = series.length > 1 ? series[series.length - 2] : cur;
        const delta = cur - prev;
        const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "■";
        const color = Math.abs(delta) < 1e-6 ? "#888" : delta > 0 ? "#8e2f3d" : "#3f7a5e";
        return (
          <div key={k} className="p-2 rounded-lg border border-line bg-white/50">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-ink-600">{k}</span>
              <span style={{ color }}>{arrow} {delta.toFixed(3)}</span>
            </div>
            <div className="text-[12px] num-mono font-bold text-ink-900">{cur.toFixed(3)}</div>
            <MiniSpark data={series} color="#a37d2c" />
          </div>
        );
      })}
    </div>
  );
}

export default function LiveAnalysisPanel() {
  const windows = useStore((s) => s.windows);
  const connected = useStore((s) => s.connected);
  const risk = useStore((s) => s.risk);
  const ema = useStore((s) => s.ema);
  const streamInfo = useStore((s) => s.streamInfo);
  const stats = useStore((s) => s.stats);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(windows.length);
  }, [windows.length]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setErr(null);
    setBusy(true);
    try {
      await streamUploadedFile(f);
    } catch (ex: any) {
      setErr(ex?.message ?? String(ex));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!connected && busy) setBusy(false);
  }, [connected, busy]);

  const stop = () => {
    stopAll();
    setBusy(false);
  };

  const latest = windows[windows.length - 1];
  const chain = latest?.reasoning_chain ?? [];
  const verdictStep = chain.find((s) => s.stage === "verdict");
  const fusedSeries = windows.slice(-30).map((w) => w.fused);
  const emaSeries = windows.slice(-30).map((w) => w.ema);
  const windowSeconds = streamInfo?.window_seconds ?? stats?.window_seconds ?? 4;
  const strideSeconds = streamInfo?.stride_seconds ?? stats?.stride_seconds ?? 2;

  return (
    <div className="space-y-4">
      <div className="surface-premium gilt-border p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label">Live Analyze</div>
            <div className="font-display text-2xl font-bold metal-gold-text flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-gold-700" /> Per-window streaming explainability
            </div>
            <p className="text-[12px] text-ink-500 mt-1 max-w-xl">
              Upload a single audio file (.wav / .mp3 / .ogg / .flac). Each {fmtSeconds(windowSeconds)}-second window advances every {fmtSeconds(strideSeconds)} seconds through the same forensic pipeline
              used for live calls. The chain-of-thought log below is grounded in the real intermediate signals — no scripted text.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".wav,.mp3,.ogg,.flac,audio/*"
              onChange={onPick}
              title="Upload audio for live per-window analysis"
              aria-label="Upload audio for live per-window analysis"
              className="text-[12px] file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:text-[12px] file:font-bold file:bg-gold-100 file:text-gold-900 hover:file:bg-gold-200 cursor-pointer"
            />
            <button onClick={stop} disabled={!connected} className="btn">
              <Square className="w-4 h-4" /> Stop
            </button>
          </div>
        </div>
        {filename && (
          <div className="mt-3 text-[11px] font-mono text-ink-600 flex items-center gap-2">
            <FileAudio className="w-3.5 h-3.5 text-gold-700" /> {filename}
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gold-700" />}
            <span className="ml-auto">{count} windows · EMA {(ema * 100).toFixed(1)}% · {risk.toUpperCase()}</span>
          </div>
        )}
        {err && (
          <div className="mt-3 p-2 rounded-lg border border-rose-200 bg-risk-highBg text-[12px] text-risk-high font-medium">
            {err}
          </div>
        )}
      </div>

      {windows.length === 0 ? (
        <div className="surface-soft p-10 text-center text-xs text-ink-400 border border-dashed border-gold-300 rounded-2xl">
          <Upload className="w-6 h-6 mx-auto mb-2 text-gold-500" />
          Pick an audio file to begin streaming analysis. Each window will appear below in real time as the backend processes it.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="surface-premium gilt-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="label">Latest window · t = {latest?.t.toFixed(2)}s</div>
                <div className="text-[10px] font-mono text-ink-500">window {count}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ImageTile title="Waveform" src={latest?.waveform_b64} />
                <ImageTile title="Mel-spectrogram" src={latest?.spectrogram_b64} />
                <ImageTile title="Saliency (Grad-CAM)" src={latest?.gradcam_b64} />
              </div>
              {chain.length > 0 && <TimingBar chain={chain} />}
            </div>

            <div className="surface-premium gilt-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="label flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-gold-700" /> Chain-of-thought · grounded in real signals
                </div>
                <div className="text-[10px] font-mono text-ink-500">{chain.length} stages</div>
              </div>
              {chain.length === 0 ? (
                <div className="text-[12px] text-ink-500 italic">Awaiting first window…</div>
              ) : (
                <div className="space-y-2">
                  {chain.map((step, i) => <StageRow key={i} step={step} idx={i} />)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-premium gilt-border p-4 space-y-3">
              <div className="label">Verdict</div>
              {verdictStep ? (
                <>
                  <div className={clsx("font-display text-2xl font-bold",
                    risk === "high" ? "text-risk-high" : risk === "medium" ? "text-risk-med" : "text-risk-low")}>
                    {String(verdictStep.evidence.verdict ?? "—").toUpperCase()}
                  </div>
                  <div className="text-[12px] font-mono text-ink-700">
                    Fused: <strong>{fmt(verdictStep.evidence.fused, 3)}</strong>
                    {" · "}EMA: <strong>{fmt(verdictStep.evidence.ema, 3)}</strong>
                  </div>
                  {verdictStep.evidence.fingerprint && (
                    <div className="text-[11px] font-mono text-ink-600">
                      fingerprint: <span className="text-gold-800 font-bold">{verdictStep.evidence.fingerprint}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[12px] text-ink-500 italic">No verdict yet</div>
              )}
              <div>
                <div className="label mt-2">Top reasons (current)</div>
                {(latest?.reasons ?? []).length === 0 ? (
                  <div className="text-[11px] text-ink-500 italic">—</div>
                ) : (
                  <ul className="text-[11px] font-mono text-ink-700 list-disc list-inside space-y-0.5">
                    {latest!.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="surface-premium gilt-border p-4 space-y-3">
              <div className="label">Score trajectory · last 30 windows</div>
              <div>
                <div className="text-[10px] font-mono text-ink-500">fused</div>
                <MiniSpark data={fusedSeries} color="#8e2f3d" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-ink-500">EMA</div>
                <MiniSpark data={emaSeries} color="#a37d2c" />
              </div>
            </div>

            <div className="surface-premium gilt-border p-4 space-y-2">
              <div className="label">Feature deltas (per window)</div>
              <FeatureDeltaGrid windows={windows} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageTile({ title, src }: { title: string; src?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-950/5 overflow-hidden">
      <div className="px-2 py-1 text-[10px] font-mono text-ink-600 border-b border-line bg-white/40">{title}</div>
      {src ? (
        <img src={`data:image/png;base64,${src}`} alt={title} className="w-full h-24 object-cover bg-black" />
      ) : (
        <div className="w-full h-24 flex items-center justify-center text-[10px] text-ink-400 italic">no data</div>
      )}
    </div>
  );
}
