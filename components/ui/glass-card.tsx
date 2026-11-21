import type { ComponentProps } from "react";
import { cn } from "./cn";

const VARIANT = {
  /** Frosted glass: light overlay, thin border, blur (see .glass in globals.css). */
  default: "glass",
  /** Filled with the restaurant's accent gradient: use for ONE hero card per page. */
  accent: "glass-accent",
  /** Plain raised surface, no blur: for big lists or cards nested inside glass. */
  flat: "glass-flat",
} as const;

/** The basic box of the glass design: 24px corners, thin border. `lift` raises it slightly on hover. */
export function GlassCard({
  variant = "default",
  lift,
  className,
  ...rest
}: ComponentProps<"section"> & { variant?: keyof typeof VARIANT; lift?: boolean }) {
  return <section className={cn("rounded-card p-5", VARIANT[variant], lift && "lift", className)} {...rest} />;
}
