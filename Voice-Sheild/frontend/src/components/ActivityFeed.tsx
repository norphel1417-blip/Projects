import { useStore, ActionKind } from "../store";
import {
  Activity,
  PhoneOff,
  KeyRound,
  Building2,
  ShieldCheck,
  Play,
  Square,
  AlertTriangle,
  FileText,
} from "lucide-react";

const ICONS: Record<ActionKind, React.ReactNode> = {
  freeze_call: <PhoneOff className="w-3.5 h-3.5" />,
  send_otp: <KeyRound className="w-3.5 h-3.5" />,
  transfer_branch: <Building2 className="w-3.5 h-3.5" />,
  mark_safe: <ShieldCheck className="w-3.5 h-3.5" />,
  session_start: <Play className="w-3.5 h-3.5" />,
  session_end: <Square className="w-3.5 h-3.5" />,
  risk_change: <AlertTriangle className="w-3.5 h-3.5" />,
  report_export: <FileText className="w-3.5 h-3.5" />,
};

const SEVERITY_DOT: Record<string, string> = {
  danger: "bg-risk-high",
  warn: "bg-risk-med",
  success: "bg-risk-low",
  info: "bg-gold-500",
};

export default function ActivityFeed() {
  const actions = useStore((s) => s.actions);
  const ordered = [...actions].reverse();

  return (
    <div className="surface p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gold-700" />
          <div className="label">Audit Activity</div>
        </div>
        <span className="tag">{actions.length} events</span>
      </div>
      <div className="flex-1 overflow-auto max-h-[420px] -mx-1">
        {ordered.length === 0 ? (
          <div className="text-sm text-ink-500 px-1">
            No activity yet. Start a session to begin streaming forensic events.
          </div>
        ) : (
          <ul className="space-y-1.5 px-1">
            {ordered.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-lg border border-line bg-slate-50/60 hover:bg-slate-50 px-3 py-2 transition-colors"
              >
                <span
                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[a.severity ?? "info"]}`}
                />
                <span className="w-6 h-6 rounded-md bg-white border border-line flex items-center justify-center text-ink-700 shrink-0">
                  {ICONS[a.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-ink-900 truncate">
                      {a.title}
                    </div>
                    <div className="text-[10px] num-mono text-ink-400 shrink-0">
                      {new Date(a.ts).toLocaleTimeString()}
                    </div>
                  </div>
                  {a.detail && (
                    <div className="text-[11px] text-ink-500 truncate">{a.detail}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
