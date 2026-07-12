import { useEffect, useState, useMemo } from "react";
import clsx from "clsx";
import { Download, RefreshCw, FileText, Filter, Search, ChevronRight } from "lucide-react";

interface SessionRow {
  session_id: string;
  started_at?: string;
  ended_at?: string;
  windows?: number;
  final_risk?: "low" | "medium" | "high";
  ema_score?: number;
  source?: string;
  filename?: string;
}

const fmt = (iso?: string) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

export default function SessionsPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "stream" | "upload">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/sessions?limit=200");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancel = false;
    setDetailErr(null);
    setDetail(null);
    fetch(`/api/sessions/${encodeURIComponent(selected)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancel) setDetail(j);
      })
      .catch((e) => !cancel && setDetailErr(e?.message ?? String(e)));
    return () => {
      cancel = true;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (riskFilter !== "all" && r.final_risk !== riskFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${r.session_id} ${r.filename ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, riskFilter, sourceFilter, q]);

  const summary = useMemo(() => {
    const r = rows ?? [];
    const total = r.length;
    const high = r.filter((x) => x.final_risk === "high").length;
    const med = r.filter((x) => x.final_risk === "medium").length;
    const low = r.filter((x) => x.final_risk === "low").length;
    const wins = r.reduce((a, x) => a + (x.windows ?? 0), 0);
    const avgEma = total ? r.reduce((a, x) => a + (x.ema_score ?? 0), 0) / total : 0;
    return { total, high, med, low, wins, avgEma };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Total Sessions" value={summary.total.toString()} />
        <Stat label="High Risk" value={summary.high.toString()} tone="danger" />
        <Stat label="Elevated" value={summary.med.toString()} tone="warn" />
        <Stat label="Low Risk" value={summary.low.toString()} tone="success" />
        <Stat label="Total Windows" value={summary.wins.toLocaleString()} />
        <Stat label="Avg EMA" value={`${(summary.avgEma * 100).toFixed(1)}%`} />
      </div>

      <div className="surface-premium gilt-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gold-700" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by session id or filename…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gold-300 bg-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>
          <Filter className="w-4 h-4 text-gold-700 ml-1" />
          <Select value={riskFilter} onChange={setRiskFilter as any} options={[
            { v: "all", l: "All Risk" },
            { v: "high", l: "High" },
            { v: "medium", l: "Medium" },
            { v: "low", l: "Low" },
          ]} />
          <Select value={sourceFilter} onChange={setSourceFilter as any} options={[
            { v: "all", l: "All Sources" },
            { v: "stream", l: "Live Stream" },
            { v: "upload", l: "Upload" },
          ]} />
          <button onClick={refresh} className="btn" disabled={loading}>
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {err && <div className="mt-3 text-xs text-risk-high font-medium">Failed to load sessions: {err}</div>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {["Session", "Started", "Ended", "Source", "Windows", "EMA", "Risk", ""].map((h) => (
                  <th key={h} className="label py-2 pr-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-400 text-xs">
                    {rows && rows.length === 0 ? "No sessions recorded yet." : "No sessions match the current filters."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.session_id}
                  className={clsx(
                    "border-t border-gold-200/60 hover:bg-gold-50/50 cursor-pointer transition",
                    selected === r.session_id && "bg-gold-50",
                  )}
                  onClick={() => setSelected(r.session_id)}
                >
                  <td className="py-2 pr-3 font-mono text-[11px] text-ink-700">{r.session_id.slice(0, 12)}…</td>
                  <td className="py-2 pr-3 text-[12px] text-ink-700">{fmt(r.started_at)}</td>
                  <td className="py-2 pr-3 text-[12px] text-ink-700">{fmt(r.ended_at)}</td>
                  <td className="py-2 pr-3"><span className={clsx("tag", r.source === "upload" ? "tag-silver" : "tag-gold")}>{r.source ?? "—"}{r.filename ? ` · ${r.filename}` : ""}</span></td>
                  <td className="py-2 pr-3 num-mono">{r.windows ?? 0}</td>
                  <td className="py-2 pr-3 num-mono">{((r.ema_score ?? 0) * 100).toFixed(1)}%</td>
                  <td className="py-2 pr-3"><RiskTag r={r.final_risk} /></td>
                  <td className="py-2 pr-3 text-right">
                    <a
                      href={`/api/sessions/${encodeURIComponent(r.session_id)}/report`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-gold-800 hover:text-gold-900"
                      title="Download PDF report"
                    >
                      <Download className="w-3.5 h-3.5" /> PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="surface-premium gilt-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="label">Session Detail</div>
              <div className="font-display font-bold text-lg metal-gold-text">{selected}</div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/sessions/${encodeURIComponent(selected)}/report`}
                className="btn-primary"
                target="_blank" rel="noreferrer"
              >
                <FileText className="w-4 h-4" /> Download Report
              </a>
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
          {detailErr && <div className="text-xs text-risk-high font-medium">Failed to load session: {detailErr}</div>}
          {!detailErr && !detail && <div className="text-xs text-ink-500">Loading window history…</div>}
          {detail && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Risk" value={(detail.risk ?? "low").toUpperCase()} tone={detail.risk === "high" ? "danger" : detail.risk === "medium" ? "warn" : "success"} />
              <Stat label="EMA Score" value={`${((detail.ema_score ?? 0) * 100).toFixed(1)}%`} />
              <Stat label="Windows" value={(detail.windows?.length ?? 0).toString()} />
              <Stat label="Started" value={fmt(detail.started_at)} />
              {detail.windows && detail.windows.length > 0 && (
                <div className="col-span-2 md:col-span-4 mt-2">
                  <div className="label mb-2">Per-Window Fused Score (last {detail.windows.length})</div>
                  <Sparkline values={detail.windows.map((w: any) => w?.scores?.fused ?? 0)} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" | "success" }) {
  const c =
    tone === "danger" ? "text-risk-high" : tone === "warn" ? "text-risk-med" : tone === "success" ? "text-risk-low" : "metal-gold-text";
  return (
    <div className="kpi-card p-3">
      <div className="label">{label}</div>
      <div className={clsx("font-display text-2xl font-bold tracking-tight num-mono", tone ? c : "kpi-value")}>{value}</div>
    </div>
  );
}

function RiskTag({ r }: { r?: string }) {
  if (!r) return <span className="tag">—</span>;
  if (r === "high") return <span className="tag tag-danger">HIGH</span>;
  if (r === "medium") return <span className="tag tag-warn">ELEVATED</span>;
  return <span className="tag tag-success">LOW</span>;
}

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="px-3 py-2 rounded-xl border border-gold-300 bg-white/90 text-[12px] font-semibold text-ink-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
    >
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const w = 800, h = 60;
  const max = Math.max(0.001, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <defs>
        <linearGradient id="spk-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(82,87,95,0.45)" />
          <stop offset="100%" stopColor="rgba(82,87,95,0)" />
        </linearGradient>
        <linearGradient id="spk-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#23262c" />
          <stop offset="50%" stopColor="#52575f" />
          <stop offset="100%" stopColor="#3a3e45" />
        </linearGradient>
      </defs>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="url(#spk-fill)" />
      <polyline points={pts} fill="none" stroke="url(#spk-stroke)" strokeWidth="2" />
    </svg>
  );
}
