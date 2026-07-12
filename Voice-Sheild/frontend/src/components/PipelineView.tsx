import { useStore } from "../store";
import { Mic, Brain, Sparkles, Layers, Gauge } from "lucide-react";
import clsx from "clsx";

function fmtRate(sr?: number) {
  if (!sr) return "sample rate pending";
  return sr >= 1000 ? `${+(sr / 1000).toFixed(1)} kHz` : `${sr} Hz`;
}

function fmtSeconds(sec?: number) {
  return typeof sec === "number" ? `${+sec.toFixed(2)}s` : "window pending";
}

interface Node {
  key: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  value: number | null; // 0..1, or null when not available
  color: string;
}

export default function PipelineView() {
  const last = useStore((s) => s.windows[s.windows.length - 1]);
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const stats = useStore((s) => s.stats);
  const streamInfo = useStore((s) => s.streamInfo);
  const sampleRate = stats?.sample_rate ?? streamInfo?.sample_rate;
  const windowSeconds = stats?.window_seconds ?? streamInfo?.window_seconds;
  const emaAlpha = stats?.ema_alpha ?? streamInfo?.ema_alpha;

  const nodes: Node[] = [
    {
      key: "audio",
      label: "Audio",
      sub: `${fmtRate(sampleRate)} · ${fmtSeconds(windowSeconds)} win`,
      icon: <Mic className="w-4 h-4" />,
      value: 1,
      color: "#3a3e45",
    },
    {
      key: "forensic",
      label: "Forensic",
      sub: "jitter · shimmer · phase",
      icon: <Sparkles className="w-4 h-4" />,
      value: last?.forensic ?? 0,
      color: "#8a96a8",
    },
    {
      key: "neuralA",
      label: "Neural-A",
      sub: "wav2vec2 · GAT",
      icon: <Brain className="w-4 h-4" />,
      value: last?.neural_a ?? null,
      color: "#52575f",
    },
    {
      key: "neuralB",
      label: "Neural-B",
      sub: "Whisper · MLP",
      icon: <Brain className="w-4 h-4" />,
      value: last?.neural_b ?? null,
      color: "#6c7585",
    },
    {
      key: "fusion",
      label: "Fusion",
      sub: "logistic · w·x + b",
      icon: <Layers className="w-4 h-4" />,
      value: last?.fused ?? 0,
      color: "#23262c",
    },
    {
      key: "ema",
      label: "EMA Decision",
      sub: `${emaAlpha == null ? "EMA α pending" : `α=${emaAlpha.toFixed(2)}`} · risk ${risk}`,
      icon: <Gauge className="w-4 h-4" />,
      value: ema,
      color: risk === "high" ? "#7a3340" : risk === "medium" ? "#6b6356" : "#3f6a55",
    },
  ];

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Inference Pipeline</div>
          <div className="font-display font-semibold text-ink-900">
            Real-time signal flow · forensic + neural fusion
          </div>
        </div>
        <span className="tag tag-brand">Streaming</span>
      </div>

      <div className="grid grid-cols-6 gap-2 items-stretch">
        {nodes.map((n, i) => (
          <div key={n.key} className="flex items-center">
            <div
              className={clsx(
                "flex-1 rounded-xl border border-line bg-slate-50/70 p-3 relative overflow-hidden",
                "min-h-[110px]",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow"
                  style={{ background: n.color }}
                >
                  {n.icon}
                </span>
                <div className="text-[11px] font-semibold text-ink-700">{n.label}</div>
              </div>
              <div className="text-[10px] text-ink-500 mt-1">{n.sub}</div>
              <div className="mt-2 num-mono text-lg font-bold" style={{ color: n.value == null ? "#8a96a8" : n.color }}>
                {n.value == null ? "n/a" : `${(n.value * 100).toFixed(0)}%`}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-line">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, (n.value ?? 0) * 100)}%`,
                    background: n.color,
                  }}
                />
              </div>
            </div>
            {i < nodes.length - 1 && (
              <div className="w-3 mx-1 hidden md:block">
                <div className="flow-track" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
