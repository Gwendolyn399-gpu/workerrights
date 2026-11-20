import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type RouteStageState = "done" | "current" | "upcoming";

export interface RouteStageView {
  key: string;
  label: string;
  state: RouteStageState;
  done: number;
  total: number;
}

export function RouteRail({ stages }: { stages: RouteStageView[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-muted">办理路线</p>
      <ol className="relative mt-2 grid grid-cols-3" aria-label="行动阶段">
        <span
          aria-hidden="true"
          className="absolute left-[16.66%] right-[16.66%] top-4 h-px bg-route/40"
        />
        {stages.map((stage, index) => {
          const current = stage.state === "current";
          return (
            <li
              key={stage.key}
              className="relative z-10 flex flex-col items-center text-center"
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-extrabold",
                  stage.state === "done"
                    ? "border-field bg-field text-surface"
                    : current
                      ? "border-signal bg-signal text-surface"
                      : "border-route bg-surface text-route",
                )}
              >
                {stage.state === "done" ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <p
                className={cn(
                  "mt-1.5 text-xs font-bold",
                  stage.state === "done"
                    ? "text-field"
                    : current
                      ? "text-signal-deep"
                      : "text-route",
                )}
              >
                {stage.label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {stage.done}/{stage.total}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
