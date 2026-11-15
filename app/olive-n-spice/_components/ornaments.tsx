import type { SpiceLevel } from "@/data/sites/olive-n-spice/menu";
import { spiceLabels } from "@/data/sites/olive-n-spice/menu";

// Small decorative drawings used all over the site. Everything here is an
// original SVG drawn in code (no downloaded images), coloured with the
// brand colours through `currentColor`.

// ---- Olive branch (botanical line-art) --------------------------------
// The stem is one smooth curve; leaves and olives are placed along it with
// a little maths, so the drawing stays crisp at any size.
const STEM = { p0: [10, 106], p1: [72, 102], p2: [132, 74], p3: [238, 16] } as const;

function stemPoint(t: number): [number, number] {
  const u = 1 - t;
  const x = u * u * u * STEM.p0[0] + 3 * u * u * t * STEM.p1[0] + 3 * u * t * t * STEM.p2[0] + t * t * t * STEM.p3[0];
  const y = u * u * u * STEM.p0[1] + 3 * u * u * t * STEM.p1[1] + 3 * u * t * t * STEM.p2[1] + t * t * t * STEM.p3[1];
  return [x, y];
}

function stemAngle(t: number): number {
  const u = 1 - t;
  const dx = 3 * u * u * (STEM.p1[0] - STEM.p0[0]) + 6 * u * t * (STEM.p2[0] - STEM.p1[0]) + 3 * t * t * (STEM.p3[0] - STEM.p2[0]);
  const dy = 3 * u * u * (STEM.p1[1] - STEM.p0[1]) + 6 * u * t * (STEM.p2[1] - STEM.p1[1]) + 3 * t * t * (STEM.p3[1] - STEM.p2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

const r = (n: number) => Math.round(n * 100) / 100;

/** A slim olive leaf pointing right, `length` long, starting at 0,0. */
function leafPath(length: number): string {
  const w = length * 0.19;
  return `M0 0C${r(length * 0.3)} ${r(-w)} ${r(length * 0.72)} ${r(-w)} ${r(length)} 0C${r(length * 0.72)} ${r(w)} ${r(length * 0.3)} ${r(w)} 0 0Z`;
}

const LEAF_STOPS = [0.12, 0.25, 0.38, 0.51, 0.64, 0.77, 0.9];
const OLIVE_STOPS = [0.31, 0.57];

export function OliveBranch({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 250 124"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `ons-branch ${className}` : "ons-branch"}
    >
      <path d={`M${STEM.p0.join(" ")}C${STEM.p1.join(" ")} ${STEM.p2.join(" ")} ${STEM.p3.join(" ")}`} />
      {LEAF_STOPS.map((t, i) => {
        const [x, y] = stemPoint(t);
        const angle = stemAngle(t);
        const length = 40 - i * 2.6;
        return (
          <g key={t} transform={`translate(${r(x)} ${r(y)})`}>
            <path d={leafPath(length)} transform={`rotate(${r(angle - 40)})`} />
            <path d={leafPath(length * 0.86)} transform={`rotate(${r(angle + 44)})`} />
          </g>
        );
      })}
      {/* The leaf at the very tip. */}
      <path d={leafPath(22)} transform={`translate(${STEM.p3[0]} ${STEM.p3[1]}) rotate(${r(stemAngle(1))})`} />
      {OLIVE_STOPS.map((t) => {
        const [x, y] = stemPoint(t);
        return (
          <g key={t} transform={`translate(${r(x)} ${r(y)})`}>
            <path d="M0 0q3 5 2 10" />
            <ellipse cx="2.5" cy="17" rx="5" ry="7" fill="currentColor" fillOpacity="0.18" />
          </g>
        );
      })}
    </svg>
  );
}

// ---- Divider ------------------------------------------------------------
/** Thin line, small diamond with a leaf, thin line. Purely decorative. */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={className ? `ons-divider ${className}` : "ons-divider"} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
        <path d="M12 7.5c2.6 1.6 2.6 7.4 0 9-2.6-1.6-2.6-7.4 0-9Z" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

// ---- Menu marks ---------------------------------------------------------
function ChilliIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M10.6 4.2c2.2 1.5 2.3 5-0.3 7.7-2.3 2.4-5.9 3-8.6 2.2 3-0.6 5-2.2 5.9-4.6 0.7-1.9 0.8-4.3 3-5.3Z" fill="currentColor" />
      <path d="M10.4 4.4c0.3-1.2 1.2-2.3 2.6-2.6" fill="none" stroke="#556b3f" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** One, two or three small chillies (mild / medium / hot). Shows nothing for level 0. */
export function SpiceMark({ level }: { level: SpiceLevel }) {
  if (level === 0) return null;
  return (
    <span className="ons-spice" role="img" aria-label={`Spice level: ${spiceLabels[level]}`} title={spiceLabels[level]}>
      {Array.from({ length: level }, (_, i) => (
        <ChilliIcon key={i} />
      ))}
    </span>
  );
}

function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M8 1.2l1.9 4.3 4.7 0.5-3.5 3.1 1 4.6L8 11.3l-4.1 2.4 1-4.6L1.4 6l4.7-0.5L8 1.2Z" fill="currentColor" />
    </svg>
  );
}

/** Gold star for a chef's special. */
export function ChefMark({ size }: { size?: number }) {
  return (
    <span className="ons-chef" role="img" aria-label="Chef's special" title="Chef's special">
      <StarIcon size={size} />
    </span>
  );
}
