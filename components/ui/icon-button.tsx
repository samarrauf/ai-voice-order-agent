import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Round icon-only button. `label` is required: it is the accessible name (and what a Tooltip shows). Always 44px or more. */
export function IconButton({
  label,
  active,
  className,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "aria-label"> & { label: string; active?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-ink-muted transition duration-200 hover:border-line-strong hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
        active && "border-transparent bg-ink text-canvas hover:text-canvas",
        className,
      )}
      {...rest}
    />
  );
}
