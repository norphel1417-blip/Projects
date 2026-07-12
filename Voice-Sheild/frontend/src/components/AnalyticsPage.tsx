import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { RefreshCw, TrendingUp, ShieldAlert, Activity } from "lucide-react";
import clsx from "clsx";
import RobustMetricsRow from "./RobustMetricsRow";
import TelemetryConsole from "./TelemetryConsole";

interface SessionRow {
  session_id: string;
  started_at?: string;
  ended_at?: string;
  windows?: number;
  final_risk?: "low" | "medium" | "high";
  ema_score?: number;
  source?: string;
}

const COLORS = {
  high: "#7a3340",
  medium: "#6b6356",
  low: "#3f6a55",
  gold: "#52575f",
  goldDark: "#23262c",
  silver: "#9aa0a8",
};

export default function AnalyticsPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/sessions?limit=500");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const agg = useMemo(() => {
    const r = rows ?? [];
    const byDay = new Map<string, { day: string; total: number; high: number; medium: number; low: number; ema: number; emaN: number }>();
    const emaBuckets = Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${i * 10 + 10}%`, count: 0 }));
    const sourceCounts: Record<string, number> = {};
    const riskCounts = { low: 0, medium: 0, high: 0 };
    let totalWindows = 0;
    for (const x of r) {
      const day = (x.started_at ?? "").slice(0, 10) || "unknown";
      if (!byDay.has(day)) byDay.set(day, { day, total: 0, high: 0, medium: 0, low: 0, ema: 0, emaN: 0 });
      const b = byDay.get(day)!;
      b.total += 1;
      if (x.final_risk === "high") b.high += 1;
      else if (x.final_risk === "medium") b.medium += 1;
      else b.low += 1;
      if (typeof x.ema_score === "number") { b.ema += x.ema_score; b.emaN += 1; }
      const idx = Math.min(9, Math.max(0, Math.floor((x.ema_score ?? 0) * 10)));
      emaBuckets[idx].count += 1;
      sourceCounts[x.source ?? "unknown"] = (sourceCounts[x.source ?? "unknown"] ?? 0) + 1;
      if (x.final_risk && x.final_risk in riskCounts) riskCounts[x.final_risk as "low"] += 1;
      totalWindows += x.windows ?? 0;
    }
    const days = Array.from(byDay.values())
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((d) => ({ ...d, avgEma: d.emaN ? +(d.ema / d.emaN * 100).toFixed(1) : 0 }));
    const riskPie = Object.entries(riskCounts).map(([k, v]) => ({ name: k, value: v }));
    const sourcePie = Object.entries(sourceCounts).map(([k, v]) => ({ name: k, value: v }));
    const total = r.length;
    const flagRate = total ? (riskCounts.high / total) * 100 : 0;
    const avgEma = total ? r.reduce((a, x) => a + (x.ema_score ?? 0), 0) / total * 100 : 0;
    const avgWindows = total ? totalWindows / total : 0;
    return { days, emaBuckets, riskPie, sourcePie, total, totalWindows, flagRate, avgEma, avgWindows };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label">Historical Analytics</div>
          <div className="font-display text-2xl font-bold metal-gold-text">Session-Level Insights</div>
        </div>
        <button onClick={refresh} className="btn" disabled={loading}>
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {err && <div className="p-3 rounded-xl border border-rose-200 bg-risk-highBg text-sm text-risk-high font-medium">Failed to load: {err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Big label="Total Sessions" value={agg.total.toString()} icon={Activity} />
        <Big label="Windows Analyzed" value={agg.totalWindows.toLocaleString()} icon={TrendingUp} />
        <Big label="Avg Windows / Session" value={agg.avgWindows ? agg.avgWindows.toFixed(1) : "—"} icon={Activity} />
        <Big label="Flag Rate (High)" value={`${agg.flagRate.toFixed(1)}%`} icon={ShieldAlert} tone={agg.flagRate >= 25 ? "danger" : agg.flagRate >= 10 ? "warn" : "success"} />
        <Big label="Avg EMA" value={`${agg.avgEma.toFixed(1)}%`} icon={TrendingUp} />
        <Big label="Live vs Upload" value={`${agg.sourcePie.find((s) => s.name === "live")?.value ?? 0} / ${agg.sourcePie.find((s) => s.name === "upload")?.value ?? 0}`} icon={Activity} />
      </div>

      <div className="space-y-2">
        <div className="label flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-steel-600 shadow-[0_0_6px_rgba(82,87,95,0.55)]" />
          Robust Statistical Indicators
        </div>
        <RobustMetricsRow rows={rows ?? []} />
      </div>

      <TelemetryConsole />

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8 surface-premium gilt-border p-4">
          <div className="label mb-3">Daily Volume & Risk Mix</div>
          {agg.days.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agg.days} stackOffset="sign">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(58,62,69,0.16)" />
                  <XAxis dataKey="day" stroke="#52575f" fontSize={11} />
                  <YAxis stroke="#52575f" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #c4c8cf", borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="low" stackId="r" fill={COLORS.low} name="Low" />
                  <Bar dataKey="medium" stackId="r" fill={COLORS.medium} name="Elevated" />
                  <Bar dataKey="high" stackId="r" fill={COLORS.high} name="High" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 surface-premium gilt-border p-4">
          <div className="label mb-3">Risk Distribution</div>
          {agg.total === 0 ? (
            <Empty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={agg.riskPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {agg.riskPie.map((s) => (
                      <Cell key={s.name} fill={s.name === "high" ? COLORS.high : s.name === "medium" ? COLORS.medium : COLORS.low} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #c4c8cf", borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-7 surface-premium gilt-border p-4">
          <div className="label mb-3">Daily Average EMA Score</div>
          {agg.days.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agg.days}>
                  <defs>
                    <linearGradient id="emaArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(58,62,69,0.16)" />
                  <XAxis dataKey="day" stroke="#52575f" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#52575f" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #c4c8cf", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="avgEma" stroke={COLORS.goldDark} strokeWidth={2.5} fill="url(#emaArea)" name="Avg EMA %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-5 surface-premium gilt-border p-4">
          <div className="label mb-3">EMA Score Histogram</div>
          {agg.total === 0 ? (
            <Empty />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agg.emaBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(58,62,69,0.16)" />
                  <XAxis dataKey="bucket" stroke="#52575f" fontSize={10} />
                  <YAxis stroke="#52575f" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #c4c8cf", borderRadius: 12 }} />
                  <Bar dataKey="count" name="Sessions">
                    {agg.emaBuckets.map((b, i) => (
                      <Cell key={i} fill={i >= 8 ? COLORS.high : i >= 6 ? COLORS.medium : COLORS.gold} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="col-span-12 surface-premium gilt-border p-4">
          <div className="label mb-3">Source Mix (Live Stream vs Upload)</div>
          {agg.total === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-wrap gap-3">
              {agg.sourcePie.map((s) => (
                <div key={s.name} className="kpi-card px-4 py-3">
                  <div className="label">{s.name}</div>
                  <div className="kpi-value text-2xl">{s.value}</div>
                  <div className="text-[11px] text-ink-500">{((s.value / agg.total) * 100).toFixed(1)}% of total</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: "danger" | "warn" | "success" }) {
  const c = tone === "danger" ? "text-risk-high" : tone === "warn" ? "text-risk-med" : tone === "success" ? "text-risk-low" : "kpi-value";
  return (
    <div className="kpi-card p-4">
      <div className="flex items-start justify-between">
        <div className="label">{label}</div>
        <Icon className="w-4 h-4 text-gold-700" />
      </div>
      <div className={clsx("font-display text-2xl font-bold tracking-tight num-mono mt-1", tone ? c : "kpi-value")}>{value}</div>
    </div>
  );
}

function Empty() {
  return <div className="h-48 flex items-center justify-center text-xs text-ink-400">No session history yet — run a few analyses to populate analytics.</div>;
}
