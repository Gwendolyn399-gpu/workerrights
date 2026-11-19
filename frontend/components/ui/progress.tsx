import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-control bg-sand", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
    >
      <div
        className={cn("h-full rounded-control bg-ink transition-[width] duration-300", barClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}