import { useStore } from "../store";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";

export default function Timeline() {
  const wins = useStore((s) => s.windows);
  const stats = useStore((s) => s.stats);
  const streamInfo = useStore((s) => s.streamInfo);
  const prefs = useStore((s) => s.prefs);
  const high = (stats?.high_threshold ?? streamInfo?.high_threshold ?? prefs.highThreshold) * 100;
  const medium = (stats?.medium_threshold ?? streamInfo?.medium_threshold ?? prefs.mediumThreshold) * 100;
  const data = wins.map((w) => ({
    t: +w.t.toFixed(1),
    Forensic: +(w.forensic * 100).toFixed(1),
    NeuralA: w.neural_a == null ? null : +(w.neural_a * 100).toFixed(1),
    NeuralB: w.neural_b == null ? null : +(w.neural_b * 100).toFixed(1),
    Fused: +(w.fused * 100).toFixed(1),
    EMA: +(w.ema * 100).toFixed(1),
  }));
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="label">Score Timeline</div>
          <div className="text-sm text-ink-700">Forensic · Neural-A · Neural-B · Fused · EMA</div>
        </div>
        <div className="flex gap-2.5 text-[10px] flex-wrap">
          <Legend color="#5b6781" label="Forensic" />
          <Legend color="#06b6d4" label="Neural-A" />
          <Legend color="#8b5cf6" label="Neural-B" />
          <Legend color="#f59e0b" label="Fused" />
          <Legend color="#8e2f3d" label="EMA" />
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 14, left: -16, bottom: 0 }}>
            <XAxis dataKey="t" stroke="#5b6781" fontSize={11} unit="s" />
            <YAxis stroke="#5b6781" fontSize={11} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: "#ffffff", border: "1px solid #e6eaf2", borderRadius: 12, boxShadow: "0 8px 24px rgba(11,18,38,0.08)" }}
              labelStyle={{ color: "#5b6781", fontWeight: 600 }}
            />
            <ReferenceLine y={high} stroke="#8e2f3d" strokeDasharray="4 4" label={{ value: `HIGH ${high.toFixed(0)}%`, position: "insideTopRight", fill: "#8e2f3d", fontSize: 10 }} />
            <ReferenceLine y={medium} stroke="#d97706" strokeDasharray="4 4" label={{ value: `WATCH ${medium.toFixed(0)}%`, position: "insideTopRight", fill: "#d97706", fontSize: 10 }} />
            <Line type="monotone" dataKey="Forensic" stroke="#5b6781" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="NeuralA" stroke="#06b6d4" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="NeuralB" stroke="#8b5cf6" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Fused" stroke="#f59e0b" dot={false} strokeWidth={1.8} />
            <Line type="monotone" dataKey="EMA" stroke="#8e2f3d" dot={false} strokeWidth={2.2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-500 font-semibold">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
