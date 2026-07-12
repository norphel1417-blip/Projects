import { useMemo } from "react";
import { useStore, type ForensicFeatures, type ReasoningStep, type ScoreSnap } from "../store";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { X, Download, ShieldAlert, ShieldCheck, ShieldQuestion, Activity, Captions } from "lucide-react";

const FEATURE_KEYS: (keyof ForensicFeatures)[] = [
  "pitch_jitter",
  "pitch_shimmer",
  "spectral_kurtosis",
  "spectral_flatness",
  "phase_coherence",
  "hf_energy_ratio",
  "spectral_tilt",
  "voiced_ratio",
];

interface FeatureStat {
  key: keyof ForensicFeatures;
  mean: number;
  min: number;
  max: number;
  std: number;
  last: number;
  n: number;
}

function statsFor(key: keyof ForensicFeatures, wins: ScoreSnap[]): FeatureStat {
  const vals: number[] = [];
  for (const w of wins) {
    const v = w.features?.[key];
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return { key, mean: 0, min: 0, max: 0, std: 0, last: 0, n: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
  return {
    key,
    mean,
    min: Math.min(...vals),
    max: Math.max(...vals),
    std: Math.sqrt(variance),
    last: vals[vals.length - 1],
    n: vals.length,
  };
}

function aggregateStages(wins: ScoreSnap[]): { stage: string; meanMs: number; count: number; lastThought: string }[] {
  const buckets = new Map<string, { sum: number; n: number; lastThought: string; lastLabel: string }>();
  for (const w of wins) {
    const chain: ReasoningStep[] = w.reasoning_chain ?? [];
    for (const step of chain) {
      const key = step.stage || step.label || "stage";
      const prev = buckets.get(key) ?? { sum: 0, n: 0, lastThought: "", lastLabel: "" };
      prev.sum += step.elapsed_ms || 0;
      prev.n += 1;
      prev.lastThought = step.thought || prev.lastThought;
      prev.lastLabel = step.label || prev.lastLabel;
      buckets.set(key, prev);
    }
  }
  return Array.from(buckets.entries()).map(([stage, v]) => ({
    stage: v.lastLabel || stage,
    meanMs: v.n > 0 ? v.sum / v.n : 0,
    count: v.n,
    lastThought: v.lastThought,
  }));
}

function topReasons(wins: ScoreSnap[], k = 6): { reason: string; count: number }[] {
  const map = new Map<string, number>();
  for (const w of wins) {
    for (const r of w.reasons || []) map.set(r, (map.get(r) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([reason, count]) => ({ reason, count }));
}

function fmt(n: number, d = 3): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function inferStride(wins: ScoreSnap[]): number {
  if (wins.length < 2) return 0;
  const strides = wins.slice(1).map((w, i) => w.t - wins[i].t).filter((v) => v > 0);
  return strides.length ? strides.reduce((a, b) => a + b, 0) / strides.length : 0;
}

function scoreStats(values: number[]) {
  if (values.length === 0) return { p50: 0, p90: 0, p95: 0, max: 0, mean: 0, last: 0 };
  return {
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    last: values[values.length - 1],
  };
}

function trackStats(label: string, values: (number | null)[]) {
  const live = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const s = scoreStats(live);
  return { label, available: live.length, coverage: values.length ? live.length / values.length : 0, ...s };
}

export default function SessionReport() {
  const sessionComplete = useStore((s) => s.sessionComplete);
  const setSessionComplete = useStore((s) => s.setSessionComplete);
  const windows = useStore((s) => s.windows);
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const sessionId = useStore((s) => s.sessionId);
  const filename = useStore((s) => s.currentFilename);
  const stats = useStore((s) => s.stats);
  const streamInfo = useStore((s) => s.streamInfo);
  const transcriptSegments = useStore((s) => s.transcriptSegments);
  const prefs = useStore((s) => s.prefs);

  const open = sessionComplete && windows.length > 0;

  const summary = useMemo(() => {
    if (windows.length === 0) return null;
    const last = windows[windows.length - 1];
    const fusedVals = windows.map((w) => w.fused);
    const emaVals = windows.map((w) => w.ema);
    const stabilityVals = windows.map((w) => w.stability);
    const highThreshold = stats?.high_threshold ?? streamInfo?.high_threshold ?? prefs.highThreshold;
    const mediumThreshold = stats?.medium_threshold ?? streamInfo?.medium_threshold ?? prefs.mediumThreshold;
    const inferredStride = inferStride(windows);
    const windowSeconds = stats?.window_seconds ?? streamInfo?.window_seconds ?? inferredStride;
    const strideSeconds = stats?.stride_seconds ?? streamInfo?.stride_seconds ?? inferredStride;
    const meanFused = fusedVals.reduce((a, b) => a + b, 0) / fusedVals.length;
    const meanEma = emaVals.reduce((a, b) => a + b, 0) / emaVals.length;
    const maxFused = Math.max(...fusedVals);
    const maxEma = Math.max(...emaVals);
    const duration = (last.t || 0) + (windowSeconds || 0);
    const featureStats = FEATURE_KEYS.map((k) => statsFor(k, windows));
    const stages = aggregateStages(windows);
    const reasons = topReasons(windows);
    const riskCounts = windows.reduce(
      (acc, w) => ({ ...acc, [w.risk]: acc[w.risk] + 1 }),
      { low: 0, medium: 0, high: 0 },
    );
    const tracks = [
      trackStats("Forensic", windows.map((w) => w.forensic)),
      trackStats("Neural-A", windows.map((w) => w.neural_a)),
      trackStats("Neural-B", windows.map((w) => w.neural_b)),
      trackStats("Neural-C", windows.map((w) => w.neural_c)),
      trackStats("Fused", windows.map((w) => w.fused)),
      trackStats("EMA", windows.map((w) => w.ema)),
    ];
    const topWindows = [...windows]
      .sort((a, b) => b.fused - a.fused)
      .slice(0, 5)
      .map((w) => ({ t: w.t, fused: w.fused, ema: w.ema, risk: w.risk, reasons: w.reasons.slice(0, 2) }));
    const fingerprint =
      [...windows].reverse().find((w) => w.threat_fingerprint)?.threat_fingerprint ?? null;
    const fingerprintConf =
      [...windows].reverse().find((w) => w.threat_fingerprint)?.threat_confidence ?? 0;
    const flaggedAt = windows.find((w) => w.risk !== "low")?.t ?? null;
    return {
      last,
      meanFused,
      meanEma,
      maxFused,
      maxEma,
      duration,
      featureStats,
      stages,
      reasons,
      fingerprint,
      fingerprintConf,
      flaggedAt,
      highThreshold,
      mediumThreshold,
      strideSeconds,
      windowSeconds,
      scoreDistribution: {
        fused: scoreStats(fusedVals),
        ema: scoreStats(emaVals),
        stability: scoreStats(stabilityVals),
      },
      riskCounts,
      tracks,
      topWindows,
      config: {
        sampleRate: stats?.sample_rate ?? streamInfo?.sample_rate,
        windowSeconds,
        strideSeconds,
        bufferSeconds: stats?.buffer_seconds ?? streamInfo?.buffer_seconds,
        nFft: stats?.n_fft ?? streamInfo?.n_fft,
        hopLength: stats?.hop_length ?? streamInfo?.hop_length,
        nMels: stats?.n_mels ?? streamInfo?.n_mels,
        emaAlpha: stats?.ema_alpha ?? streamInfo?.ema_alpha,
        highThreshold,
        mediumThreshold,
        consecutiveRequired: stats?.consecutive_required ?? streamInfo?.consecutive_required,
        device: stats?.device,
        env: stats?.env,
        modelVersion: stats?.model_version,
      },
    };
  }, [windows, stats, streamInfo, prefs.highThreshold, prefs.mediumThreshold]);

  if (!open || !summary) return null;

  const recommendation =
    risk === "high"
      ? {
          label: "FREEZE CALL · ESCALATE TO BRANCH",
          color: "#ff4d6d",
          icon: ShieldAlert,
          detail:
            "Synthetic-voice indicators are persistent and severe. Halt the transaction immediately, send a verification OTP to the registered customer device, and route the case to the local branch fraud desk.",
        }
      : risk === "medium"
      ? {
          label: "SEND OTP · STEP-UP AUTHENTICATION",
          color: "#ffb454",
          icon: ShieldQuestion,
          detail:
            "Several windows show elevated fusion scores. Trigger out-of-band verification before authorising any high-value action and log the session for compliance review.",
        }
      : {
          label: "ALLOW · CONTINUE WITH MONITORING",
          color: "#6dffaf",
          icon: ShieldCheck,
          detail:
            "No persistent synthetic-voice signal detected. Allow the session to continue under standard monitoring and retain the recording per retention policy.",
        };

  const RecIcon = recommendation.icon;

  function exportJson() {
    const payload = {
      generated_at: new Date().toISOString(),
      session_id: sessionId ?? null,
      filename: filename ?? null,
      duration_seconds: summary?.duration,
      verdict: { risk, ema, max_fused: summary?.maxFused, mean_fused: summary?.meanFused },
      recommendation: recommendation.label,
      threat_fingerprint: summary?.fingerprint,
      config: summary?.config,
      score_distribution: summary?.scoreDistribution,
      model_track_stats: summary?.tracks,
      risk_counts: summary?.riskCounts,
      top_windows: summary?.topWindows,
      feature_stats: summary?.featureStats,
      stage_latency: summary?.stages,
      top_reasons: summary?.reasons,
      transcript: transcriptSegments,
      windows,
      stats: stats ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voiceshield-session-${sessionId ?? Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const chartData = windows.map((w) => ({ t: +w.t.toFixed(2), ema: +(w.ema * 100).toFixed(2), fused: +(w.fused * 100).toFixed(2) }));

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="max-w-6xl w-full max-h-[94vh] overflow-y-auto rounded-2xl bg-[#07101d] text-slate-100 border border-amber-300/30 shadow-2xl shadow-black/70"
        role="dialog"
        aria-modal="true"
        aria-label="Autonomous session report"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 border-b border-amber-300/20 bg-[#07101d]/95 backdrop-blur">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
              Autonomous Forensic Report · VoiceShield
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {filename ?? "Live Session"}{" "}
              <span className="text-xs font-mono text-white/50 ml-2">
                {sessionId ? `#${sessionId.slice(0, 10)}` : ""}
              </span>
            </div>
            <div className="text-xs text-white/60 mt-1 font-mono flex flex-wrap gap-x-4 gap-y-1">
              <span>duration {fmt(summary.duration, 2)} s</span>
              <span>{windows.length} windows</span>
              <span>generated {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportJson}
              className="px-3 py-2 text-xs uppercase tracking-wider rounded-md bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/30 flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button
              onClick={() => setSessionComplete(false)}
              className="p-2 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
              aria-label="Dismiss report"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 bg-gradient-to-b from-slate-950/30 to-slate-950/80">
          {/* Verdict block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="rounded-xl p-5 border"
              style={{
                background: `linear-gradient(135deg, ${recommendation.color}22, transparent)`,
                borderColor: `${recommendation.color}55`,
              }}
            >
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Final verdict</div>
              <div
                className="text-4xl font-mono font-extrabold mt-1"
                style={{ color: recommendation.color }}
              >
                {(ema * 100).toFixed(0)}%
              </div>
              <div className="text-sm uppercase tracking-wider mt-1" style={{ color: recommendation.color }}>
                {risk} · ema smoothed
              </div>
              <div className="text-[11px] text-white/50 mt-2 font-mono">
                peak fused {fmt(summary.maxFused * 100, 1)}% · mean {fmt(summary.meanFused * 100, 1)}%
              </div>
              {summary.flaggedAt != null && (
                <div className="text-[11px] text-amber-200 mt-1 font-mono">
                  first elevated window @ {fmt(summary.flaggedAt, 2)} s
                </div>
              )}
            </div>
            <div className="md:col-span-2 rounded-xl p-5 border border-white/10 bg-slate-900/70">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/60">
                <RecIcon className="w-3.5 h-3.5" style={{ color: recommendation.color }} />
                Recommended action
              </div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: recommendation.color }}
              >
                {recommendation.label}
              </div>
              <div className="text-xs text-white/70 leading-relaxed mt-2">
                {recommendation.detail}
              </div>
              {summary.fingerprint && (
                <div className="mt-3 text-[11px] font-mono text-white/60">
                  threat fingerprint:{" "}
                  <span className="text-amber-200">{summary.fingerprint}</span>{" "}
                  <span className="text-white/40">conf {fmt(summary.fingerprintConf, 2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Provenance + distribution */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Runtime provenance
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/70">
                <Info label="sample rate" value={summary.config.sampleRate ? `${summary.config.sampleRate} Hz` : "—"} />
                <Info label="window" value={summary.config.windowSeconds ? `${fmt(summary.config.windowSeconds, 2)} s` : "—"} />
                <Info label="stride" value={summary.config.strideSeconds ? `${fmt(summary.config.strideSeconds, 2)} s` : "—"} />
                <Info label="mel bins" value={summary.config.nMels ?? "—"} />
                <Info label="n_fft" value={summary.config.nFft ?? "—"} />
                <Info label="hop" value={summary.config.hopLength ?? "—"} />
                <Info label="EMA α" value={summary.config.emaAlpha ?? "—"} />
                <Info label="device" value={summary.config.device ?? "—"} />
                <Info label="medium" value={`${fmt(summary.mediumThreshold * 100, 0)}%`} />
                <Info label="high" value={`${fmt(summary.highThreshold * 100, 0)}%`} />
              </div>
            </div>
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Score distribution
              </div>
              <Distribution label="Fused" stats={summary.scoreDistribution.fused} />
              <Distribution label="EMA" stats={summary.scoreDistribution.ema} />
              <Distribution label="Stability" stats={summary.scoreDistribution.stability} />
            </div>
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Risk mix
              </div>
              {(["high", "medium", "low"] as const).map((key) => {
                const count = summary.riskCounts[key];
                const pct = windows.length ? (count / windows.length) * 100 : 0;
                const tone = key === "high" ? "bg-rose-400" : key === "medium" ? "bg-amber-300" : "bg-emerald-300";
                return (
                  <div key={key} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs font-mono text-white/75">
                      <span>{key.toUpperCase()}</span>
                      <span>{count} windows · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded overflow-hidden mt-1">
                      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EMA timeline */}
          <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Risk timeline
              </div>
              <div className="text-[10px] text-white/40 font-mono">
                EMA (smoothed) vs FUSED (instantaneous), %
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="reportEma" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff4d6d" stopOpacity={0.65} />
                      <stop offset="100%" stopColor="#ff4d6d" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="reportFused" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6cb1ff" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6cb1ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ffffff10" strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke="#ffffff60" tick={{ fontSize: 10 }} unit="s" />
                  <YAxis stroke="#ffffff60" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #ffffff20", fontSize: 11 }}
                  />
                  <ReferenceLine y={summary.highThreshold * 100} stroke="#ff4d6d" strokeDasharray="4 4" />
                  <ReferenceLine y={summary.mediumThreshold * 100} stroke="#ffb454" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="fused" stroke="#6cb1ff" fill="url(#reportFused)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="ema" stroke="#ff4d6d" fill="url(#reportEma)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 flex items-center gap-2">
                <Captions className="w-3.5 h-3.5" /> Transcript evidence
              </div>
              <div className="text-[10px] text-white/45 font-mono">{transcriptSegments.length} segments</div>
            </div>
            {transcriptSegments.length === 0 ? (
              <div className="text-xs text-white/50 font-mono">No transcript segments were captured for this run.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {transcriptSegments.map((segment) => (
                  <div key={segment.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="text-[10px] font-mono text-amber-200">
                      {fmt(segment.t_start, 2)}s - {fmt(segment.t_end, 2)}s · {segment.source ?? "asr"}
                    </div>
                    <div className="text-xs text-white/85 mt-1 leading-relaxed">{segment.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Feature stats + stage latency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Forensic feature distribution
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="text-white/40 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="text-left py-1 pr-2">feature</th>
                      <th className="text-right px-2">mean</th>
                      <th className="text-right px-2">σ</th>
                      <th className="text-right px-2">min</th>
                      <th className="text-right px-2">max</th>
                      <th className="text-right pl-2">last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.featureStats.map((f) => (
                      <tr key={f.key} className="border-t border-white/5 text-white/80">
                        <td className="py-1.5 pr-2 text-amber-200/80">{f.key}</td>
                        <td className="text-right px-2">{fmt(f.mean)}</td>
                        <td className="text-right px-2 text-white/50">{fmt(f.std)}</td>
                        <td className="text-right px-2 text-white/50">{fmt(f.min)}</td>
                        <td className="text-right px-2 text-white/50">{fmt(f.max)}</td>
                        <td className="text-right pl-2">{fmt(f.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Reasoning pipeline · mean latency per stage
              </div>
              <div className="space-y-2">
                {summary.stages.length === 0 && (
                  <div className="text-xs text-white/40">No reasoning chain captured.</div>
                )}
                {summary.stages.map((s) => (
                  <div key={s.stage} className="text-xs">
                    <div className="flex justify-between font-mono text-white/80">
                      <span className="text-amber-200/80">{s.stage}</span>
                      <span>
                        {fmt(s.meanMs, 1)} ms <span className="text-white/40">× {s.count}</span>
                      </span>
                    </div>
                    {s.lastThought && (
                      <div className="text-[11px] text-white/50 mt-0.5 italic line-clamp-2">
                        {s.lastThought}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Model track health
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="text-white/40 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="text-left py-1 pr-2">track</th>
                      <th className="text-right px-2">coverage</th>
                      <th className="text-right px-2">last</th>
                      <th className="text-right px-2">mean</th>
                      <th className="text-right pl-2">p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tracks.map((t) => (
                      <tr key={t.label} className="border-t border-white/5 text-white/80">
                        <td className="py-1.5 pr-2 text-amber-200/80">{t.label}</td>
                        <td className="text-right px-2">{(t.coverage * 100).toFixed(0)}%</td>
                        <td className="text-right px-2">{fmt(t.last * 100, 1)}%</td>
                        <td className="text-right px-2 text-white/50">{fmt(t.mean * 100, 1)}%</td>
                        <td className="text-right pl-2 text-white/50">{fmt(t.p95 * 100, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl p-4 border border-white/10 bg-slate-900/70">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
                Highest-risk windows
              </div>
              <div className="space-y-2">
                {summary.topWindows.map((w) => (
                  <div key={`${w.t}-${w.fused}`} className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <div className="flex justify-between text-xs font-mono text-white/80">
                      <span>t={fmt(w.t, 2)}s · {w.risk.toUpperCase()}</span>
                      <span className="text-amber-200">fused {fmt(w.fused * 100, 1)}% · EMA {fmt(w.ema * 100, 1)}%</span>
                    </div>
                    <div className="text-[11px] text-white/45 mt-1 truncate">
                      {w.reasons.length ? w.reasons.join(" · ") : "No explicit reason string for this window"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top reasons */}
          <div className="rounded-xl p-4 border border-white/10 bg-white/5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
              Top forensic indicators (frequency across {windows.length} windows)
            </div>
            {summary.reasons.length === 0 ? (
              <div className="text-xs text-white/40">No flagged indicators in this run.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {summary.reasons.map((r) => {
                  const pct = (r.count / windows.length) * 100;
                  return (
                    <div key={r.reason} className="text-xs">
                      <div className="flex justify-between text-white/80 font-mono">
                        <span className="truncate pr-2">{r.reason}</span>
                        <span className="text-amber-200">{r.count}× · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded overflow-hidden mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-rose-400"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div className="text-[10px] text-white/40 font-mono">
              Generated autonomously by VoiceShield · model {stats?.model_version ?? "live"} · neural{" "}
              {stats?.use_neural ? "ON" : "OFF"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportJson}
                className="px-4 py-2 text-xs uppercase tracking-wider rounded-md bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/30 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> Download report
              </button>
              <button
                onClick={() => setSessionComplete(false)}
                className="px-4 py-2 text-xs uppercase tracking-wider rounded-md bg-white/5 hover:bg-white/10 text-white border border-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 p-2">
      <div className="text-white/35 uppercase tracking-wider text-[9px]">{label}</div>
      <div className="text-white/85 mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Distribution({ label, stats }: { label: string; stats: ReturnType<typeof scoreStats> }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs font-mono text-white/75">
        <span>{label}</span>
        <span>p50 {fmt(stats.p50 * 100, 1)}% · p95 {fmt(stats.p95 * 100, 1)}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1 text-[10px] font-mono text-white/50">
        <span>mean {fmt(stats.mean * 100, 1)}%</span>
        <span>max {fmt(stats.max * 100, 1)}%</span>
        <span>last {fmt(stats.last * 100, 1)}%</span>
      </div>
    </div>
  );
}
