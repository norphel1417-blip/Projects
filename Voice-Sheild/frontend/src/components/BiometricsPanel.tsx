import { useStore, ForensicFeatures } from "../store";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

interface MetricSpec {
  key: keyof ForensicFeatures;
  label: string;
  unit?: string;
  color: string;
  scale?: number; // multiply for display
}

const METRICS: MetricSpec[] = [
  { key: "pitch_jitter", label: "Pitch Jitter", color: "#06b6d4", scale: 100, unit: "%" },
  { key: "pitch_shimmer", label: "Pitch Shimmer", color: "#8b5cf6", scale: 100, unit: "%" },
  { key: "hf_energy_ratio", label: "HF Energy", color: "#f59e0b", scale: 1 },
  { key: "phase_coherence", label: "Phase Coherence", color: "#10b981", scale: 1 },
  { key: "spectral_kurtosis", label: "Spectral Kurtosis", color: "#f43f5e", scale: 1 },
];

export default function BiometricsPanel() {
  const wins = useStore((s) => s.windows);
  const last = wins[wins.length - 1];
  const visibleCount = Math.min(30, wins.length);
  return (
    <div className="surface p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Voice Biometrics</div>
          <div className="font-display font-semibold text-ink-900">
            Forensic micro-features
          </div>
        </div>
        <span className="tag">{visibleCount > 0 ? `Last ${visibleCount} windows` : "Awaiting windows"}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {METRICS.map((m) => {
          const series = wins.slice(-Math.max(1, visibleCount)).map((w, i) => ({
            i,
            v: ((w.features?.[m.key] as number | undefined) ?? 0) * (m.scale ?? 1),
          }));
          if (series.length === 0) series.push({ i: 0, v: 0 });
          const cur = ((last?.features?.[m.key] as number | undefined) ?? 0) * (m.scale ?? 1);
          const prev = series.length > 1 ? series[series.length - 2].v : cur;
          const deltaColor = cur > prev ? "#8e2f3d" : cur < prev ? "#3f7a5e" : m.color;
          return (
            <div
              key={m.key}
              className="rounded-xl border border-line bg-slate-50/60 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-ink-700">{m.label}</div>
                <div
                  className="num-mono text-sm font-bold"
                  style={{ color: deltaColor }}
                >
                  {cur.toFixed(2)}
                  {m.unit ?? ""}
                </div>
              </div>
              <div className="h-12 -mx-1 -mb-1 mt-1">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id={`b-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={m.color} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={["auto", "auto"]} />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={m.color}
                      strokeWidth={1.6}
                      fill={`url(#b-${m.key})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
