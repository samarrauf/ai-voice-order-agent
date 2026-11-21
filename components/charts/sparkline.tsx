/**
 * A tiny trend line with no axes, for inside a card. `colorIndex` picks --chart-N.
 * The line draws itself with CSS (off for reduced motion / Lite mode).
 */
export function Sparkline({ values, colorIndex = 1, ariaLabel, width = 120, height = 32 }: { values: readonly number[]; colorIndex?: number; ariaLabel: string; width?: number; height?: number }) {
  const pts = values.length >= 2 ? values : [0, values[0] ?? 0];
  const max = Math.max(...pts, 0);
  const pad = 3;
  const x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (max > 0 ? (v / max) * (height - pad * 2) : 0);
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = pts.length - 1;
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="spark" style={{ color: `var(--chart-${colorIndex})` }}>
      <path d={d} pathLength={100} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spark-line" />
      <circle cx={x(last)} cy={y(pts[last])} r="2.6" fill="currentColor" className="spark-dot" />
    </svg>
  );
}
