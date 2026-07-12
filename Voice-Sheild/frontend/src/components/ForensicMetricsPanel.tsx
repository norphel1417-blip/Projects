import { useMemo } from "react";
import { useStore, ForensicFeatures } from "../store";
import { Microscope } from "lucide-react";

interface Spec {
  key: keyof ForensicFeatures;
  label: string;
  scale?: number;
  unit?: string;
}

const SPECS: Spec[] = [
  { key: "pitch_jitter",       label: "Pitch Jitter",       scale: 100, unit: "%" },
  { key: "pitch_shimmer",      label: "Pitch Shimmer",      scale: 100, unit: "%" },
  { key: "spectral_kurtosis",  label: "Spectral Kurtosis" },
  { key: "spectral_flatness",  label: "Spectral Flatness" },
  { key: "phase_coherence",    label: "Phase Coherence" },
  { key: "hf_energy_ratio",    label: "HF Energy Ratio" },
  { key: "spectral_tilt",      label: "Spectral Tilt",       unit: " dB" },
  { key: "voiced_ratio",       label: "Voiced Ratio" },
];

function stats(values: number[]) {
  if (values.length === 0) return { n: 0, min: 0, max: 0, mean: 0, std: 0, last: 0 };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / values.length;
  let varAcc = 0;
  for (const v of values) varAcc += (v - mean) * (v - mean);
  const std = Math.sqrt(varAcc / values.length);
  return { n: values.length, min, max, mean, std, last: values[values.length - 1] };
}

function fmt(v: number, unit?: string) {
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${s}${unit ?? ""}`;
}

export default function ForensicMetricsPanel() {
  const wins = useStore((s) => s.windows);
  const density = useStore((s) => s.prefs.density);
  const compact = density === "compact";

  const rows = useMemo(() => {
    return SPECS.map((m) => {
      const scale = m.scale ?? 1;
      const series = wins
        .map((w) => w.features?.[m.key])
        .filter((v): v is number => typeof v === "number")
        .map((v) => v * scale);
      const st = stats(series);
      const deltaSigma = st.n > 1 && st.std > 0 ? (st.last - st.mean) / st.std : 0;
      return { ...m, st, deltaSigma };
    });
  }, [wins]);

  const totalWindows = wins.length;

  return (
    <div className="surface-premium gilt-border p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Forensic Metrics</div>
          <div className="font-display font-semibold text-ink-900 flex items-center gap-2">
            <Microscope className="w-4 h-4 text-gold-700" />
            Session-level micro-feature stats
          </div>
        </div>
        <span className="tag">{totalWindows} window{totalWindows === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full ${compact ? "text-[11px]" : "text-xs"}`}>
          <thead>
            <tr className="text-ink-500 text-left">
              <th className={`font-semibold ${compact ? "py-1" : "py-1.5"} pr-2`}>Feature</th>
              <th className="font-semibold py-1.5 pr-2 text-right">Last</th>
              <th className="font-semibold py-1.5 pr-2 text-right">Mean</th>
              <th className="font-semibold py-1.5 pr-2 text-right">±σ</th>
              <th className="font-semibold py-1.5 pr-2 text-right">Min</th>
              <th className="font-semibold py-1.5 pr-2 text-right">Max</th>
              <th className="font-semibold py-1.5 text-right">Δσ live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-slate-50/60">
                <td className={`${compact ? "py-1" : "py-1.5"} pr-2 text-ink-800 font-medium`}>{r.label}</td>
                <td className="py-1.5 pr-2 text-right num-mono text-ink-900">{r.st.n ? fmt(r.st.last, r.unit) : "—"}</td>
                <td className="py-1.5 pr-2 text-right num-mono">{r.st.n ? fmt(r.st.mean, r.unit) : "—"}</td>
                <td className="py-1.5 pr-2 text-right num-mono text-ink-500">{r.st.n ? fmt(r.st.std, r.unit) : "—"}</td>
                <td className="py-1.5 pr-2 text-right num-mono text-ink-500">{r.st.n ? fmt(r.st.min, r.unit) : "—"}</td>
                <td className="py-1.5 pr-2 text-right num-mono text-ink-500">{r.st.n ? fmt(r.st.max, r.unit) : "—"}</td>
                <td className="py-1.5 text-right">
                  <span className="num-mono font-semibold text-ink-700">
                    {r.st.n > 1 ? r.deltaSigma.toFixed(2) : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalWindows === 0 && (
        <div className="mt-4 text-center text-ink-500 text-xs">
          Awaiting first analysis window — start a live session or load a sample to populate forensic stats.
        </div>
      )}
    </div>
  );
}
