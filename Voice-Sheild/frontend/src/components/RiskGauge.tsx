import { useStore } from "../store";
import clsx from "clsx";

export default function RiskGauge() {
  const ema = useStore((s) => s.ema);
  const risk = useStore((s) => s.risk);
  const flagged = useStore((s) => s.flaggedAtSec);
  const pct = Math.min(100, Math.max(0, ema * 100));

  const color =
    risk === "high" ? "#8e2f3d" : risk === "medium" ? "#a06a2a" : "#3f7a5e";

  // SVG arc gauge (semi-circle)
  const r = 80;
  const cx = 100, cy = 100;
  const theta = Math.PI * (pct / 100);
  const x = cx - r * Math.cos(theta);
  const y = cy - r * Math.sin(theta);
  const large = 0;
  const sweep = 1;

  return (
    <div
      className={clsx(
        "glass p-5 flex flex-col items-center justify-center relative",
        risk === "high" && "risk-pulse shadow-glowred",
      )}
    >
      <div className="label mb-2">Synthetic Voice Probability</div>
      <svg viewBox="0 0 200 140" className="w-64 h-40">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} ${sweep} ${cx + r} ${cy}`}
          stroke="#1f2a44"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} ${sweep} ${x} ${y}`}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontWeight={800}
          fontSize="34"
          fill={color}
        >
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="tag"
          style={{ borderColor: color, color }}
        >
          {risk.toUpperCase()} RISK
        </span>
        {flagged !== undefined && (
          <span className="tag border-amber-400 text-amber-300">
            Flagged @ {flagged.toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}
