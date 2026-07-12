interface Props {
  values: number[];
  height?: number;
  stroke?: string;
  fill?: string;
}

/**
 * Tiny inline-SVG sparkline. Pure presentational; expects an array of numeric
 * values and renders them as a smoothed area over a fixed viewBox.  Used by
 * RobustMetricsRow tiles and other compact telemetry displays.
 */
export function Sparkline({ values, height = 28, stroke = "#3a3e45", fill = "rgba(82,87,95,0.18)" }: Props) {
  if (!values || values.length < 2) {
    return <div style={{ height }} className="w-full" />;
  }
  const w = 100;
  const h = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden>
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
