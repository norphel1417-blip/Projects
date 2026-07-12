import { useEffect, useMemo, useState } from "react";
import { MAX_WINDOW_BUFFER, useStore } from "../store";
import { Cpu, Activity, Radio, Database, AlertTriangle, CheckCircle2, Info } from "lucide-react";

/**
 * Industrial-grade black-screen telemetry console.
 *
 * Two panes:
 *   LEFT  — SYSTEM TELEMETRY: live KV pairs sourced from /api/stats (already
 *           polled into the Zustand store) plus locally-derived runtime
 *           metrics (uptime, window throughput, last EMA, risk LED).
 *   RIGHT — EVENT LOG: scrolling tail of `state.actions` with severity icons.
 *
 * Fully dynamic — every value is derived from real store data. No hardcoded
 * placeholder telemetry; null-safe with "n/a" where appropriate.
 */
export default function TelemetryConsole({ compact = false }: { compact?: boolean }) {
  const stats = useStore((s) => s.stats);
  const windows = useStore((s) => s.windows);
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const connected = useStore((s) => s.connected);
  const startTs = useStore((s) => s.startTs);
  const source = useStore((s) => s.source);
  const actions = useStore((s) => s.actions);
  const streamInfo = useStore((s) => s.streamInfo);
  const audioMeter = useStore((s) => s.audioMeter);

  // Re-render every second so uptime / "last update" stays fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const uptime = useMemo(() => {
    if (!startTs) return "—";
    const sec = Math.max(0, Math.floor((now - startTs) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [now, startTs]);

  // Throughput: windows in the last 10 s.
  const throughput = useMemo(() => {
    if (windows.length < 2) return 0;
    const last = windows[windows.length - 1].t;
    const cutoff = last - 10;
    const recent = windows.filter((w) => w.t >= cutoff);
    if (recent.length < 2) return 0;
    const span = recent[recent.length - 1].t - recent[0].t || 1;
    return recent.length / span;
  }, [windows]);

  const riskColor =
    risk === "high" ? "#e57385" : risk === "medium" ? "#e2b06a" : "#7fc8a4";
  const riskLabel = risk.toUpperCase();

  const lastUpdate = useMemo(() => {
    if (!actions.length && !windows.length) return "—";
    const ts = actions.length ? actions[actions.length - 1].ts : now;
    const delta = Math.max(0, Math.floor((now - ts) / 1000));
    if (delta < 1) return "just now";
    if (delta < 60) return `${delta}s ago`;
    const m = Math.floor(delta / 60);
    return `${m}m ago`;
  }, [actions, windows, now]);

  // Build telemetry rows.
  const rows: { k: string; v: string; ok?: boolean | null }[] = [
    { k: "MODEL", v: stats?.model_version ?? "—" },
    { k: "ENV", v: (stats?.env ?? "—").toUpperCase() },
    { k: "DEVICE", v: (stats?.device ?? "—").toUpperCase() },
    { k: "NEURAL", v: stats == null ? "n/a" : stats.use_neural ? "online" : "n/a", ok: stats?.use_neural ?? null },
    { k: "SAMPLE RATE", v: `${stats?.sample_rate ?? streamInfo?.sample_rate ?? "—"} Hz` },
    { k: "WINDOW", v: `${stats?.window_seconds ?? streamInfo?.window_seconds ?? "—"} s` },
    { k: "STRIDE", v: `${stats?.stride_seconds ?? streamInfo?.stride_seconds ?? "—"} s` },
    { k: "METER TICK", v: `${Math.round((stats?.meter_interval_seconds ?? streamInfo?.meter_interval_seconds ?? 0) * 1000) || "—"} ms` },
    { k: "AUDIO LEVEL", v: audioMeter ? `${audioMeter.level_db.toFixed(1)} dB` : "n/a" },
    { k: "AUDIO PEAK", v: audioMeter ? `${(audioMeter.peak * 100).toFixed(0)}%` : "n/a" },
    { k: "WIN PROGRESS", v: audioMeter ? `${(audioMeter.window_progress * 100).toFixed(0)}%` : "n/a" },
    { k: "MEL BINS", v: `${stats?.n_mels ?? streamInfo?.n_mels ?? "—"}` },
    { k: "EMA ALPHA", v: `${stats?.ema_alpha ?? streamInfo?.ema_alpha ?? "—"}` },
    { k: "HIGH THRESH", v: stats?.high_threshold ?? streamInfo?.high_threshold ? `${((stats?.high_threshold ?? streamInfo?.high_threshold ?? 0) * 100).toFixed(0)}%` : "—" },
    { k: "MED THRESH", v: stats?.medium_threshold ?? streamInfo?.medium_threshold ? `${((stats?.medium_threshold ?? streamInfo?.medium_threshold ?? 0) * 100).toFixed(0)}%` : "—" },
    { k: "WS LINK", v: connected ? "established" : "idle", ok: connected },
    { k: "SOURCE", v: source.toUpperCase() },
    { k: "UPTIME", v: uptime },
    { k: "THROUGHPUT", v: `${throughput.toFixed(2)} win/s` },
    { k: "ACTIVE SESS", v: (stats?.active_sessions ?? 0).toString() },
    { k: "CALLS TODAY", v: (stats?.calls_today ?? 0).toString() },
    { k: "CALLS TOTAL", v: (stats?.calls_total ?? 0).toString() },
    { k: "FLAGGED 24H", v: (stats?.threats_blocked_today ?? 0).toString() },
    { k: "FLAGGED ALL", v: (stats?.threats_blocked_total ?? 0).toString() },
    { k: "AVG EMA", v: stats ? `${(stats.avg_ema_score * 100).toFixed(1)}%` : "n/a" },
    { k: "AVG WIN/CALL", v: stats ? stats.avg_windows_per_call.toFixed(1) : "n/a" },
    { k: "LIVE EMA", v: windows.length ? `${(ema * 100).toFixed(1)}%` : "n/a" },
    { k: "WIN BUFFER", v: `${windows.length}/${MAX_WINDOW_BUFFER}` },
  ];

  const tail = actions.slice(-(compact ? 8 : 14)).reverse();

  return (
    <div className="rounded-2xl overflow-hidden border border-gold-700/60 shadow-cardLg">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#0a0d12] border-b border-gold-700/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
            style={{ color: riskColor, background: riskColor }}
          />
          <span className="font-mono text-[11px] tracking-[0.2em] text-gold-300">
            VOICESHIELD ▸ TELEMETRY CONSOLE
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-silver-400">
          <span>RISK <span style={{ color: riskColor }}>{riskLabel}</span></span>
          <span>UPDATED {lastUpdate}</span>
          <span className="text-gold-500">{new Date(now).toISOString().slice(11, 19)} UTC</span>
        </div>
      </div>

      {/* Body: two columns */}
      <div className="grid grid-cols-12 bg-[#05070b] text-silver-200 font-mono text-[11px]">
        {/* LEFT — telemetry KV */}
        <div className="col-span-12 md:col-span-7 p-4 border-r border-gold-700/30">
          <div className="flex items-center gap-2 mb-3 text-gold-400/90">
            <Cpu className="w-3.5 h-3.5" />
            <span className="tracking-[0.2em] text-[10px]">SYSTEM TELEMETRY</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {rows.map((r) => (
              <div key={r.k} className="flex items-center justify-between gap-3 border-b border-gold-700/10 pb-1">
                <span className="text-silver-500">{r.k}</span>
                <span
                  className={
                    r.ok === false
                      ? "text-silver-500"
                      : r.ok === true
                      ? "text-[#7fc8a4]"
                      : "text-gold-200"
                  }
                >
                  {r.v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — event log */}
        <div className="col-span-12 md:col-span-5 p-4">
          <div className="flex items-center gap-2 mb-3 text-gold-400/90">
            <Radio className="w-3.5 h-3.5" />
            <span className="tracking-[0.2em] text-[10px]">EVENT LOG</span>
            <span className="ml-auto text-silver-500 text-[10px]">{actions.length} entries</span>
          </div>
          <div className="space-y-1 max-h-[260px] overflow-auto pr-1">
            {tail.length === 0 && (
              <div className="text-silver-500 italic">awaiting events…</div>
            )}
            {tail.map((a) => {
              const t = new Date(a.ts).toISOString().slice(11, 19);
              const Icon =
                a.severity === "danger"
                  ? AlertTriangle
                  : a.severity === "warn"
                  ? Activity
                  : a.severity === "success"
                  ? CheckCircle2
                  : Info;
              const color =
                a.severity === "danger"
                  ? "#e57385"
                  : a.severity === "warn"
                  ? "#e2b06a"
                  : a.severity === "success"
                  ? "#7fc8a4"
                  : "#a4adbc";
              return (
                <div key={a.id} className="flex items-start gap-2 leading-snug">
                  <span className="text-silver-500 shrink-0">{t}</span>
                  <Icon className="w-3 h-3 mt-0.5 shrink-0" style={{ color }} />
                  <div className="min-w-0">
                    <div className="truncate" style={{ color }}>{a.title}</div>
                    {a.detail && (
                      <div className="text-silver-500 truncate">{a.detail}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer status strip */}
      <div className="flex items-center justify-between bg-[#0a0d12] border-t border-gold-700/40 px-4 py-1.5 font-mono text-[10px] text-silver-500">
        <div className="flex items-center gap-3">
          <Database className="w-3 h-3 text-gold-500" />
          <span>SESSIONS LOG ▸ /reports/sessions.jsonl</span>
        </div>
        <div className="flex items-center gap-4">
          <span>WIN {windows.length}/{MAX_WINDOW_BUFFER}</span>
          <span>EMA {(ema * 100).toFixed(1)}%</span>
          <span style={{ color: riskColor }}>● {riskLabel}</span>
        </div>
      </div>
    </div>
  );
}
