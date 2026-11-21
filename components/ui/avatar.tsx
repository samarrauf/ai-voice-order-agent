import { cn } from "./cn";

/** First letters of up to two words (or the first two letters of one word), upper case. "napoli-owner" -> "NO". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/** Round initials badge. `online` adds a small green status dot. */
export function Avatar({
  name,
  online,
  size = "md",
  className,
}: {
  name: string;
  online?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-on-brand",
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-14 text-lg",
        className,
      )}
    >
      {initialsOf(name)}
      {online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-canvas bg-success" />}
    </span>
  );
}
