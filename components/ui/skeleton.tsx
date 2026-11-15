import { cn } from "./cn";

/** A grey shimmering block that stands in for content while it loads. Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** A whole card-shaped placeholder: a heading line, a few text lines and a button-sized bar. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-2xl border border-line bg-surface p-5", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-4 w-4/5" />
      <Skeleton className="mt-2 h-4 w-3/5" />
      <Skeleton className="mt-6 h-12 w-full rounded-xl" />
    </div>
  );
}
