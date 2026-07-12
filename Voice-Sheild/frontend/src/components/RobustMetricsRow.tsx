import { useMemo } from "react";
import { Sparkline } from "./Sparkline";

interface SessionRow {
  session_id: string;
  started_at?: string;
  ended_at?: string;
  windows?: number;
  final_risk?: "low" | "medium" | "high";
  ema_score?: number;
  source?: string;
}

/**
 * Second-tier analytics row — robust statistical summaries derived from the
 * full sessions corpus: distribution percentiles, recency deltas, dominant
 * source mix and average session duration.  All values are computed from the
 * `rows` prop (real /api/sessions data) — no synthetic fallback.
 */
export default function RobustMetricsRow({ rows }: { rows: SessionRow[] }) {
  const m = useMemo(() => computeMetrics(rows), [rows]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Tile label="P50 EMA" value={m.p50 != null ? `${(m.p50 * 100).toFixed(1)}%` : "n/a"} hint="Median session score" spark={m.emaSpark} />
      <Tile label="P95 EMA" value={m.p95 != null ? `${(m.p95 * 100).toFixed(1)}%` : "n/a"} hint="Worst-case tail" spark={m.emaSpark} tone={m.p95 != null && m.p95 >= 0.85 ? "danger" : m.p95 != null && m.p95 >= 0.65 ? "warn" : undefined} />
      <Tile label="Avg Session" value={m.avgDurationSec != null ? formatDuration(m.avgDurationSec) : "n/a"} hint="Mean wall-clock duration" />
      <Tile label="7-Day Δ" value={m.weeklyDelta != null ? `${m.weeklyDelta >= 0 ? "▲" : "▼"} ${Math.abs(m.weeklyDelta).toFixed(1)}%` : "n/a"} hint="Flag-rate change vs prior week" tone={m.weeklyDelta != null && m.weeklyDelta > 5 ? "danger" : m.weeklyDelta != null && m.weeklyDelta < -5 ? "success" : undefined} />
      <Tile label="Distinct Sources" value={m.distinctSources.toString()} hint={m.dominantSource ? `Dominant: ${m.dominantSource}` : "—"} />
      <Tile label="Today / All" value={`${m.todayCount} / ${m.totalCount}`} hint={m.totalCount > 0 ? `${((m.todayCount / m.totalCount) * 100).toFixed(1)}% of corpus` : "—"} />
    </div>
  );
}

function Tile({ label, value, hint, spark, tone }: { label: string; value: string; hint?: string; spark?: number[]; tone?: "danger" | "warn" | "success" }) {
  const c =
    tone === "danger" ? "text-risk-high" : tone === "warn" ? "text-risk-med" : tone === "success" ? "text-risk-low" : "kpi-value";
  return (
    <div className="kpi-card p-4">
      <div className="label">{label}</div>
      <div className={`font-display text-2xl font-bold tracking-tight num-mono mt-1 ${tone ? c : "kpi-value"}`}>{value}</div>
      {spark && spark.length > 1 && (
        <div className="mt-1.5 -mx-1">
          <Sparkline values={spark} height={24} />
        </div>
      )}
      {hint && <div className="text-[10px] text-ink-400 mt-1 truncate">{hint}</div>}
    </div>
  );
}

function computeMetrics(rows: SessionRow[]) {
  const emas = rows
    .map((r) => r.ema_score)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const p50 = percentile(emas, 0.5);
  const p95 = percentile(emas, 0.95);

  const durations: number[] = [];
  for (const r of rows) {
    if (r.started_at && r.ended_at) {
      const a = Date.parse(r.started_at);
      const b = Date.parse(r.ended_at);
      if (!isNaN(a) && !isNaN(b) && b > a) durations.push((b - a) / 1000);
    }
  }
  const avgDurationSec = durations.length ? durations.reduce((x, y) => x + y, 0) / durations.length : null;

  // 7-day delta: flag-rate(last 7d) - flag-rate(prior 7d), in absolute %.
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const last: SessionRow[] = [];
  const prior: SessionRow[] = [];
  for (const r of rows) {
    if (!r.started_at) continue;
    const t = Date.parse(r.started_at);
    if (isNaN(t)) continue;
    if (t >= now - weekMs) last.push(r);
    else if (t >= now - 2 * weekMs) prior.push(r);
  }
  const flagRate = (xs: SessionRow[]) => (xs.length ? (xs.filter((x) => x.final_risk === "high").length / xs.length) * 100 : null);
  const lastFR = flagRate(last);
  const priorFR = flagRate(prior);
  const weeklyDelta = lastFR != null && priorFR != null ? lastFR - priorFR : null;

  const sourceCounts: Record<string, number> = {};
  for (const r of rows) sourceCounts[r.source ?? "unknown"] = (sourceCounts[r.source ?? "unknown"] ?? 0) + 1;
  const distinctSources = Object.keys(sourceCounts).length;
  const dominantSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => (r.started_at ?? "").startsWith(todayIso)).length;
  const totalCount = rows.length;

  // Sparkline: chronologically-ordered EMA values (last 32) for context.
  const emaSpark = rows
    .filter((r) => typeof r.ema_score === "number")
    .sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""))
    .slice(-32)
    .map((r) => (r.ema_score as number) * 100);

  return { p50, p95, avgDurationSec, weeklyDelta, distinctSources, dominantSource, todayCount, totalCount, emaSpark };
}

function percentile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
