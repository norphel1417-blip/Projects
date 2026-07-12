import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Gauge, Timer, Waves, Zap } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

export default function LatencyPanel() {
  const wins = useStore((s) => s.windows);
  const startTs = useStore((s) => s.startTs);
  const connected = useStore((s) => s.connected);
  const source = useStore((s) => s.source);

  // tick once per second to refresh uptime / throughput
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const n = wins.length;
    const uptimeMs = startTs ? Date.now() - startTs : 0;
    const uptimeSec = uptimeMs / 1000;
    // window stride from window timestamps (server-side seconds)
    let avgStride = 0;
    if (n >= 2) {
      const first = wins[0].t;
      const last = wins[n - 1].t;
      avgStride = (last - first) / Math.max(1, n - 1);
    }
    const throughput = uptimeSec > 0 ? n / uptimeSec : 0;             // windows / sec wall-clock
    const audioCovered = n > 0 ? wins[n - 1].t + (avgStride || 0) : 0; // approx audio seconds analysed
    const rtFactor = uptimeSec > 0 ? audioCovered / uptimeSec : 0;
    const lastEma = n > 0 ? wins[n - 1].ema : 0;
    return { n, uptimeSec, avgStride, throughput, audioCovered, rtFactor, lastEma };
  }, [wins, startTs]);

  // sparkline of fused score (proxy for inference activity)
  const spark = wins.slice(-40).map((w, i) => ({ i, v: w.fused * 100 }));
  if (spark.length === 0) spark.push({ i: 0, v: 0 });

  const fmtTime = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0s";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return m > 0 ? `${m}m ${ss}s` : `${ss}s`;
  };

  return (
    <div className="surface-premium gilt-border p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Stream Telemetry</div>
          <div className="font-display font-semibold text-ink-900 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-gold-700" />
            Latency & Throughput
          </div>
        </div>
        <span
          className={`tag ${connected ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : ""}`}
        >
          {connected ? "live" : source === "idle" ? "idle" : "offline"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile icon={<Waves className="w-3.5 h-3.5" />} label="Windows" value={String(metrics.n)} sub={`${metrics.avgStride ? metrics.avgStride.toFixed(2) + "s stride" : "—"}`} />
        <Tile icon={<Timer className="w-3.5 h-3.5" />} label="Uptime" value={fmtTime(metrics.uptimeSec)} sub={`audio ${fmtTime(metrics.audioCovered)}`} />
        <Tile icon={<Zap className="w-3.5 h-3.5" />} label="Throughput" value={`${metrics.throughput.toFixed(2)}/s`} sub={`${(metrics.throughput * 60).toFixed(0)}/min`} />
        <Tile
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Real-Time Factor"
          value={metrics.rtFactor > 0 ? `${metrics.rtFactor.toFixed(2)}×` : "—"}
          sub={metrics.rtFactor === 0 ? "—" : metrics.rtFactor >= 1 ? "ahead of audio" : "catching up"}
          accent={metrics.rtFactor >= 1 ? "ok" : metrics.rtFactor > 0 ? "warn" : undefined}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-ink-500 mb-1">
          <span className="font-semibold uppercase tracking-wider">Inference Activity</span>
          <span className="num-mono">EMA {(metrics.lastEma * 100).toFixed(0)}%</span>
        </div>
        <div className="h-16 rounded-lg border border-line bg-slate-50/40 px-1">
          <ResponsiveContainer>
            <AreaChart data={spark}>
              <defs>
                <linearGradient id="lat-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#52575f" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="#52575f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 100]} />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#3a3e45"
                strokeWidth={1.6}
                fill="url(#lat-grad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Tile({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: "ok" | "warn";
}) {
  const ring =
    accent === "ok" ? "ring-emerald-200" :
    accent === "warn" ? "ring-amber-200" :
    "ring-line";
  const valColor =
    accent === "ok" ? "text-emerald-700" :
    accent === "warn" ? "text-amber-700" :
    "text-ink-900";
  return (
    <div className={`rounded-xl border border-line bg-white/70 p-3 ring-1 ${ring}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 num-mono text-lg font-bold ${valColor}`}>{value}</div>
      <div className="text-[10px] text-ink-500">{sub}</div>
    </div>
  );
}
