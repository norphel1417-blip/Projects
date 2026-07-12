import { useStore } from "../store";
import { SlidersHorizontal, RotateCcw, Layers, Eye, EyeOff, Activity, Cpu, FileDown } from "lucide-react";
import clsx from "clsx";

const DEFAULTS = {
  highThreshold: 0.85,
  mediumThreshold: 0.65,
  statsPollMs: 5000,
  density: "comfortable" as const,
  showSpectrograms: true,
  showHeatmap: true,
  autoExportOnHigh: false,
};

export default function SettingsPage() {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const stats = useStore((s) => s.stats);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="label">Operator Console</div>
          <div className="font-display text-2xl font-bold metal-gold-text flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-gold-700" /> Customization & Thresholds
          </div>
        </div>
        <button onClick={() => setPrefs(DEFAULTS)} className="btn">
          <RotateCcw className="w-4 h-4" /> Reset to defaults
        </button>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <Section title="Risk Thresholds" subtitle="UI display thresholds — the wire risk classification still comes from the server, but visualizations recolor based on these.">
          <Slider
            label="High-risk threshold"
            value={prefs.highThreshold}
            min={0.5}
            max={0.99}
            step={0.01}
            tone="danger"
            onChange={(v) => setPrefs({ highThreshold: Math.max(prefs.mediumThreshold + 0.01, v) })}
            display={`${(prefs.highThreshold * 100).toFixed(0)}%`}
          />
          <Slider
            label="Elevated (medium) threshold"
            value={prefs.mediumThreshold}
            min={0.3}
            max={Math.min(0.95, prefs.highThreshold - 0.01)}
            step={0.01}
            tone="warn"
            onChange={(v) => setPrefs({ mediumThreshold: v })}
            display={`${(prefs.mediumThreshold * 100).toFixed(0)}%`}
          />
        </Section>

        <Section title="Live Telemetry" subtitle="Polling cadence for /api/stats. Lower values give snappier dashboard updates at the cost of more requests.">
          <Slider
            label="Stats polling interval"
            value={prefs.statsPollMs}
            min={1000}
            max={30000}
            step={500}
            onChange={(v) => setPrefs({ statsPollMs: Math.round(v) })}
            display={`${(prefs.statsPollMs / 1000).toFixed(1)} s`}
          />
        </Section>

        <Section title="Display Density" subtitle="Compact mode tightens KPI tiles and table rows for high-density operations centers.">
          <div className="flex items-center gap-2">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setPrefs({ density: d })}
                className={clsx(
                  "px-4 py-2 rounded-xl text-[12px] font-bold border transition-all",
                  prefs.density === d
                    ? "metal-gold-soft border-gold-500 text-gold-900 shadow-glowGold"
                    : "bg-white/80 border-gold-300 text-ink-600 hover:bg-gold-50"
                )}
              >
                <Layers className="w-3.5 h-3.5 inline mr-1.5" />
                {d.toUpperCase()}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Visualization Toggles" subtitle="Disable heavy visualizations on slower hardware.">
          <Toggle
            label="Show spectrograms"
            icon={prefs.showSpectrograms ? Eye : EyeOff}
            value={prefs.showSpectrograms}
            onChange={(v) => setPrefs({ showSpectrograms: v })}
          />
          <Toggle
            label="Show timeline heatmap"
            icon={prefs.showHeatmap ? Eye : EyeOff}
            value={prefs.showHeatmap}
            onChange={(v) => setPrefs({ showHeatmap: v })}
          />
          <Toggle
            label="Auto-export PDF on HIGH risk verdicts"
            icon={FileDown}
            value={prefs.autoExportOnHigh}
            onChange={(v) => setPrefs({ autoExportOnHigh: v })}
          />
        </Section>

        <Section title="Backend Status" subtitle="Live diagnostics from /api/stats — useful for confirming the deployed model and environment.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Diag label="Model Version" value={stats?.model_version ?? "—"} icon={Cpu} />
            <Diag label="Environment" value={stats?.env ?? "—"} icon={Activity} />
            <Diag label="Neural Path" value={stats?.use_neural === undefined ? "—" : stats.use_neural ? "ENABLED" : "n/a"} icon={Cpu} tone={stats?.use_neural ? "success" : "neutral"} />
            <Diag label="Active Sessions" value={stats?.active_sessions?.toString() ?? "—"} icon={Activity} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="col-span-12 md:col-span-6 surface-premium gilt-border p-5 space-y-4">
      <div>
        <div className="font-display text-base font-bold metal-gold-text">{title}</div>
        {subtitle && <p className="text-[11px] text-ink-500 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display, tone }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string; tone?: "danger" | "warn" }) {
  const c = tone === "danger" ? "accent-rose-700" : tone === "warn" ? "accent-amber-700" : "accent-gold-600";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-bold text-ink-700">{label}</span>
        <span className="num-mono text-[12px] font-bold metal-gold-text">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        title={label}
        aria-label={label}
        className={clsx("w-full h-2 rounded-full cursor-pointer", c)}
      />
    </div>
  );
}

function Toggle({ label, value, onChange, icon: Icon }: { label: string; value: boolean; onChange: (v: boolean) => void; icon: any }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={clsx(
        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-[12px] font-bold",
        value ? "metal-gold-soft border-gold-500 text-gold-900" : "bg-white/80 border-gold-300 text-ink-600 hover:bg-gold-50"
      )}
    >
      <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {label}</span>
      <span className={clsx("inline-block w-9 h-5 rounded-full relative transition-colors", value ? "bg-gold-600" : "bg-ink-300")}>
        <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", value ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Diag({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: "success" | "neutral" }) {
  const c = tone === "success" ? "text-emerald-700" : "kpi-value";
  return (
    <div className="kpi-card p-3">
      <div className="flex items-start justify-between">
        <div className="label">{label}</div>
        <Icon className="w-3.5 h-3.5 text-gold-700" />
      </div>
      <div className={clsx("font-display text-base font-bold num-mono mt-1 truncate", tone === "success" ? c : "kpi-value")} title={value}>{value}</div>
    </div>
  );
}
