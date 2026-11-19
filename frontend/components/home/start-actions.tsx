"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg";

function useCreate(fn: () => Promise<{ case: { id: string } }>, fallback: string) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fn();
      router.push(`/case/${result.case.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      setLoading(false);
    }
  };
  return { loading, error, run };
}

export function StartCaseButton({
  children = "说说我的情况",
  className,
  variant = "default",
  size = "lg",
  showArrow = true,
}: {
  children?: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
  showArrow?: boolean;
}) {
  const { loading, error, run } = useCreate(() => api.createCase(), "暂时无法创建案件，请稍后再试。");
  return (
    <span className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <Button variant={variant} size={size} disabled={loading} onClick={run}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
        {!loading && showArrow && <ArrowRight className="h-4 w-4" />}
      </Button>
      {error && <span className="text-xs text-signal-deep">{error}</span>}
    </span>
  );
}

export function DemoCaseButton({
  className,
  label = "打开虚构演示案件",
  variant = "outline",
  size = "default",
}: {
  className?: string;
  label?: string;
  variant?: Variant;
  size?: Size;
}) {
  const { loading, error, run } = useCreate(() => api.createDemo(), "暂时无法打开演示案件，请确认后端已启动。");
  return (
    <span className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <Button variant={variant} size={size} disabled={loading} onClick={run}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
      {error && <span className="text-xs text-signal-deep">{error}</span>}
    </span>
  );
}