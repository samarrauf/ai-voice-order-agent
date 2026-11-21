import type { ComponentProps } from "react";
import { Search } from "lucide-react";
import { cn } from "./cn";

/** Rounded search field with a magnifier. Pass `label` (accessible name); the rest is a normal <input>. */
export function SearchInput({ label, className, ...rest }: Omit<ComponentProps<"input">, "aria-label"> & { label: string }) {
  return (
    <span className={cn("relative block", className)}>
      <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        aria-label={label}
        className="min-h-11 w-full rounded-full border border-line bg-raised pl-11 pr-4 text-sm transition-colors duration-200 placeholder:text-ink-faint hover:border-line-strong focus:border-brand-line [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
    </span>
  );
}
