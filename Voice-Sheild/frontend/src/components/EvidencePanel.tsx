import { useStore } from "../store";
import { ShieldAlert, Activity, Waves } from "lucide-react";

export default function EvidencePanel() {
  const last = useStore((s) => s.windows[s.windows.length - 1]);
  const reasons = last?.reasons ?? [];
  return (
    <div className="surface p-5 h-full">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-4 h-4 text-risk-med" />
        <div className="label">Evidence · Why this verdict?</div>
      </div>
      {reasons.length === 0 ? (
        <div className="text-sm text-ink-500">
          No anomalies detected yet. Forensic engine continuously analyses pitch
          jitter, spectral flatness, phase coherence, and high-frequency content.
        </div>
      ) : (
        <ul className="space-y-2">
          {reasons.map((r, i) => (
            <li key={i} className="surface-soft p-3 text-sm flex items-start gap-2 text-ink-800">
              <Activity className="w-4 h-4 mt-0.5 text-accent-cyan shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Pill icon={<Waves className="w-3 h-3" />} label="Stability" v={last ? `${(last.stability * 100).toFixed(0)}%` : "—"} />
        <Pill icon={<Activity className="w-3 h-3" />} label="Reasons" v={String(reasons.length)} />
      </div>
    </div>
  );
}

function Pill({ icon, label, v }: { icon: React.ReactNode; label: string; v: string }) {
  return (
    <div className="surface-soft p-2.5 flex items-center justify-between">
      <span className="text-ink-500 inline-flex items-center gap-1 font-semibold">{icon} {label}</span>
      <span className="num-mono font-bold text-ink-900">{v}</span>
    </div>
  );
}
