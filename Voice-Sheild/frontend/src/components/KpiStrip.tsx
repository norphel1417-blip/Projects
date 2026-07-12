import { useStore } from "../store";
import { PhoneCall, ShieldCheck, Activity, Cpu } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

function Spark({ data, color }: { data: number[]; color: string }) {
  const d = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 -mx-1 -mb-1">
      <ResponsiveContainer>
        <AreaChart data={d}>
          <defs>
            <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#g-${color})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function KpiStrip() {
  const stats = useStore((s) => s.stats);
  const wins = useStore((s) => s.windows);
  const ema = useStore((s) => s.ema);
  const density = useStore((s) => s.prefs.density);
  const compact = density === "compact";
  const hasHistory = (stats?.calls_total ?? 0) > 0;
  const emaSpark = wins.slice(-30).map((w) => w.ema * 100);
  const fusedSpark = wins.slice(-30).map((w) => w.fused * 100);
  const liveActive = wins.length > 0;
  const dash = "—";

  const items = [
    {
      label: "Active Calls",
      value: stats?.active_sessions ?? 0,
      sub: hasHistory
        ? `${stats?.calls_today ?? 0} today · ${stats?.calls_total ?? 0} total`
        : "no calls recorded yet",
      icon: <PhoneCall className="w-4 h-4 text-navy-900" />,
      color: "#3a3e45",
      spark: emaSpark,
      finish: "metal-gold-soft",
      ring: "ring-gold-300/60",
    },
    {
      label: "Threats Blocked Today",
      value: hasHistory ? (stats?.threats_blocked_today ?? 0) : dash,
      sub: hasHistory ? `${stats?.threats_blocked_total ?? 0} all-time` : "awaiting first session",
      icon: <ShieldCheck className="w-4 h-4 text-risk-high" />,
      color: "#8a96a8",
      spark: fusedSpark,
      finish: "metal-silver-soft",
      ring: "ring-silver-300/70",
    },
    {
      label: "Live EMA Risk",
      value: liveActive ? `${(ema * 100).toFixed(0)}%` : dash,
      sub: hasHistory
        ? `avg ${(((stats?.avg_ema_score ?? 0)) * 100).toFixed(1)}% per call`
        : "start a session to populate",
      icon: <Activity className="w-4 h-4 text-gold-700" />,
      color: "#52575f",
      spark: emaSpark,
      finish: "metal-gold-soft",
      ring: "ring-gold-300/60",
    },
    {
      label: "Model",
      value: stats?.model_version ?? dash,
      sub: stats
        ? `${stats.use_neural ? "neural+forensic" : "forensic fast"} · ${
            hasHistory ? (stats.avg_windows_per_call ?? 0).toFixed(1) + " win/call" : "no history"
          }`
        : "loading…",
      icon: <Cpu className="w-4 h-4 text-silver-700" />,
      color: "#6c7585",
      spark: fusedSpark,
      finish: "metal-silver-soft",
      ring: "ring-silver-300/70",
    },
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 ${compact ? "gap-3" : "gap-4"}`}>
      {items.map((it) => (
        <div key={it.label} className={`kpi-card ${compact ? "!p-3" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="kpi-label">{it.label}</div>
            <div className={`${compact ? "w-7 h-7" : "w-8 h-8"} rounded-lg ${it.finish} ring-1 ${it.ring} flex items-center justify-center shadow-sm`}>
              {it.icon}
            </div>
          </div>
          <div className={`kpi-value num-mono ${compact ? "!text-xl" : ""}`}>{it.value}</div>
          <div className="text-[11px] text-ink-500">{it.sub}</div>
          {!compact && it.spark.length > 0 && <Spark data={it.spark} color={it.color} />}
        </div>
      ))}
    </div>
  );
}
