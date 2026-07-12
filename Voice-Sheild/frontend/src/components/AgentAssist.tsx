import { useMemo } from "react";
import { useStore } from "../store";
import { Bot, ShieldCheck, AlertTriangle, PhoneOff } from "lucide-react";

interface Suggestion {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "info" | "warn" | "danger";
}

export default function AgentAssist() {
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const reasons = useStore((s) => s.windows[s.windows.length - 1]?.reasons ?? []);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (risk === "high") {
      return [
        {
          icon: <PhoneOff className="w-4 h-4" />,
          title: "Step-up authentication required",
          body:
            "Voice is highly likely synthetic. Do NOT proceed with any financial " +
            "instruction. Ask the caller for an OTP issued to the registered mobile, " +
            "or transfer to branch verification.",
          tone: "danger",
        },
        {
          icon: <AlertTriangle className="w-4 h-4" />,
          title: "Suggested challenge questions",
          body:
            "1) Last 4 digits of recent transaction · 2) Date of account opening · " +
            "3) Branch name. AI clones often fail at exact, contextual recall.",
          tone: "warn",
        },
      ];
    }
    if (risk === "medium") {
      return [
        {
          icon: <AlertTriangle className="w-4 h-4" />,
          title: "Borderline signal — keep listening",
          body:
            "Some forensic markers are elevated" +
            (reasons.length ? `: ${reasons.slice(0, 2).join("; ")}.` : ".") +
            " Continue verification politely; ask an open-ended question and re-evaluate.",
          tone: "warn",
        },
      ];
    }
    return [
      {
        icon: <ShieldCheck className="w-4 h-4" />,
        title: "Voice appears authentic",
        body:
          `EMA at ${(ema * 100).toFixed(0)}%. Continue normal KYC flow. The system ` +
          `will alert you if voice characteristics drift.`,
        tone: "info",
      },
    ];
  }, [risk, ema, reasons]);

  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-accent-violet" />
        <div className="label">Agent Assist · Real-time guidance</div>
        <span className="ml-auto tag tag-brand">AI Copilot</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className={
              "rounded-xl p-4 border " +
              (s.tone === "danger"
                ? "border-rose-200 bg-risk-highBg"
                : s.tone === "warn"
                ? "border-amber-200 bg-risk-medBg"
                : "border-emerald-200 bg-risk-lowBg")
            }
          >
            <div className={
              "flex items-center gap-2 text-sm font-bold " +
              (s.tone === "danger" ? "text-risk-high" : s.tone === "warn" ? "text-risk-med" : "text-emerald-700")
            }>
              {s.icon} {s.title}
            </div>
            <div className="text-sm text-ink-700 mt-1.5 leading-relaxed">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
