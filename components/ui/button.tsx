import type { ComponentProps } from "react";
import { cn } from "./cn";

const VARIANT = {
  // The one filled, accent-coloured button per area: the main thing to press.
  primary: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
  // Quiet outlined button for secondary actions (Refresh, Export, Log out).
  // Soft glass button: next to a primary one.
  secondary: "border border-line-strong bg-ink/10 text-ink hover:bg-ink/15",
  ghost: "border border-line bg-raised text-ink hover:border-line-strong",
} as const;

const SIZE = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
} as const;

/** Standard button. Always at least 44px tall so it is easy to press on a touch screen. */
export function Button({
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
