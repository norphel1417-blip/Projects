import { useStore } from "../store";
import { CheckCircle2, AlertTriangle, ShieldAlert, Info, X } from "lucide-react";
import clsx from "clsx";

const ICONS = {
  info: <Info className="w-4 h-4" />,
  success: <CheckCircle2 className="w-4 h-4" />,
  warn: <AlertTriangle className="w-4 h-4" />,
  danger: <ShieldAlert className="w-4 h-4" />,
};

export default function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[320px] pointer-events-none">
      {toasts.map((t) => {
        const sev = t.severity ?? "info";
        return (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto surface p-3 flex items-start gap-3 animate-fade-up",
              sev === "danger" && "border-rose-200 bg-risk-highBg",
              sev === "warn" && "border-amber-200 bg-risk-medBg",
              sev === "success" && "border-emerald-200 bg-risk-lowBg",
              sev === "info" && "bg-white",
            )}
          >
            <div
              className={clsx(
                "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                sev === "danger" && "bg-rose-100 text-risk-high",
                sev === "warn" && "bg-amber-100 text-amber-700",
                sev === "success" && "bg-emerald-100 text-emerald-700",
                sev === "info" && "bg-gold-50 text-gold-800 border border-gold-300",
              )}
            >
              {ICONS[sev]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink-900">{t.title}</div>
              {t.body && <div className="text-xs text-ink-500 mt-0.5">{t.body}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-ink-400 hover:text-ink-700"
              aria-label="dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
