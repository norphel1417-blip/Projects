import { useStore } from "../store";
import { PhoneOff, KeyRound, Building2, ShieldCheck } from "lucide-react";
import clsx from "clsx";

export default function VerdictCard() {
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const flagged = useStore((s) => s.flaggedAtSec);
  const sessionId = useStore((s) => s.sessionId);
  const stats = useStore((s) => s.stats);
  const streamInfo = useStore((s) => s.streamInfo);
  const prefs = useStore((s) => s.prefs);
  const pushAction = useStore((s) => s.pushAction);
  const pushToast = useStore((s) => s.pushToast);

  const pct = Math.min(100, Math.max(0, ema * 100));
  const color =
    risk === "high" ? "#8e2f3d" : risk === "medium" ? "#a06a2a" : "#3f7a5e";
  const label =
    risk === "high"
      ? "HIGH RISK · Likely Synthetic"
      : risk === "medium"
      ? "ELEVATED · Inspect"
      : "LOW RISK · Voice Authentic";

  // semicircle gauge
  const r = 106;
  const cx = 160;
  const cy = 154;
  const theta = Math.PI * (pct / 100);
  const x = cx - r * Math.cos(theta);
  const y = cy - r * Math.sin(theta);
  const highThreshold = stats?.high_threshold ?? streamInfo?.high_threshold ?? prefs.highThreshold;
  const mediumThreshold = stats?.medium_threshold ?? streamInfo?.medium_threshold ?? prefs.mediumThreshold;
  const ticks = Array.from(new Set([0, 25, 50, Math.round(mediumThreshold * 100), Math.round(highThreshold * 100), 100]))
    .sort((a, b) => a - b);

  const act = (
    kind: "freeze_call" | "send_otp" | "transfer_branch" | "mark_safe",
    title: string,
    body: string,
    severity: "info" | "success" | "warn" | "danger",
  ) => {
    pushAction({ kind, title, detail: body, severity });
    pushToast({ title, body, severity });
  };

  return (
    <div
      className={clsx(
        "surface-premium gilt-border p-6 relative overflow-hidden",
        risk === "high" && "hero-glow-high",
        risk === "medium" && "hero-glow-med",
        risk === "low" && "hero-glow-low",
      )}
    >
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <div className="label">Live Verdict</div>
            <div className="font-display text-xl font-bold text-ink-900 mt-0.5">
              Synthetic Voice Probability
            </div>
          </div>
          <span
            className={clsx(
              "tag",
              risk === "high" && "tag-danger",
              risk === "medium" && "tag-warn",
              risk === "low" && "tag-success",
            )}
          >
            {risk === "high" && (
              <span className="led led-danger animate-pulse-ring" />
            )}
            {risk === "medium" && <span className="led led-warn" />}
            {risk === "low" && <span className="led led-on" />}
            {label}
          </span>
        </div>

        <div className="flex flex-col items-center mt-4">
          <svg viewBox="0 0 320 210" className="w-full max-w-[360px] h-52 overflow-visible">
            <defs>
              <linearGradient id="vgrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="55%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#8e2f3d" />
              </linearGradient>
              <linearGradient id="vtrack" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#c4c8cf" />
                <stop offset="50%" stopColor="#9aa0a8" />
                <stop offset="100%" stopColor="#52575f" />
              </linearGradient>
            </defs>
            {/* track */}
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              stroke="url(#vtrack)"
              strokeWidth="18"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* progress */}
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`}
              stroke="url(#vgrad)"
              strokeWidth="18"
              fill="none"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 6px 16px ${color}55)` }}
            />
            {/* tick marks */}
            {ticks.map((t) => {
              const a = Math.PI * (t / 100);
              const x1 = cx - (r + 12) * Math.cos(a);
              const y1 = cy - (r + 12) * Math.sin(a);
              const x2 = cx - (r + 22) * Math.cos(a);
              const y2 = cy - (r + 22) * Math.sin(a);
              return (
                <g key={t}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={t >= highThreshold * 100 ? "#8e2f3d" : t >= mediumThreshold * 100 ? "#a06a2a" : "#94a3b8"}
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
            {/* percentage label rendered inside the SVG so it never overlaps the arc */}
            <text
              x={cx}
              y={cy - 16}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight={800}
              fontSize="52"
              fill={color}
              style={{ filter: `drop-shadow(0 2px 0 rgba(35,38,44,0.25)) drop-shadow(0 0 12px ${color}55)` }}
            >
              {pct.toFixed(0)}%
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="10"
              fill="#64748b"
              letterSpacing="0.18em"
            >
              EMA · SMOOTHED
            </text>
            <text x={cx - r - 4} y={cy + 22} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="ui-monospace, monospace">0%</text>
            <text x={cx + r + 4} y={cy + 22} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="ui-monospace, monospace">100%</text>
          </svg>
          <div className="text-[11px] text-ink-500 mt-1">
            Smoothed across recent windows
            {flagged !== undefined && (
              <>
                {" "}
                · <span className="text-amber-700 font-semibold">flagged @ {flagged.toFixed(1)}s</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          <button
            className="btn-danger justify-center"
            onClick={() =>
              act(
                "freeze_call",
                "Call frozen",
                "All financial actions on this session have been blocked.",
                "danger",
              )
            }
          >
            <PhoneOff className="w-4 h-4" /> Freeze Call
          </button>
          <button
            className="btn-primary justify-center"
            onClick={() =>
              act(
                "send_otp",
                "OTP challenge sent",
                "A one-time code was issued to the customer's registered mobile.",
                "info",
              )
            }
          >
            <KeyRound className="w-4 h-4" /> Send OTP
          </button>
          <button
            className="btn justify-center"
            onClick={() =>
              act(
                "transfer_branch",
                "Routed to branch",
                "Customer will be transferred to in-branch verification.",
                "warn",
              )
            }
          >
            <Building2 className="w-4 h-4" /> Transfer to Branch
          </button>
          <button
            className="btn-success justify-center"
            onClick={() =>
              act(
                "mark_safe",
                "Marked safe",
                "Operator override: voice accepted as authentic.",
                "success",
              )
            }
          >
            <ShieldCheck className="w-4 h-4" /> Mark Safe
          </button>
        </div>

        {sessionId && (
          <div className="text-[10px] text-ink-400 mt-3 font-mono truncate">
            session · {sessionId}
          </div>
        )}
      </div>
    </div>
  );
}
