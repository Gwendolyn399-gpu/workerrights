"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  const focused = document.activeElement;
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("复制不可用");
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

export function CopyButton({ text, label = "复制", copiedLabel = "已复制", className, compact = false }: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState("");
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <div className="min-w-0">
      <button type="button" aria-label={label} disabled={!text}
        onClick={async () => {
          setError("");
          setCopied(false);
          try {
            await copyToClipboard(text);
            setCopied(true);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
          } catch {
            setError("复制失败，请重试，或展开内容后长按选中文字复制。");
          }
        }}
        className={cn(
          "fusion-press inline-flex min-h-11 items-center gap-1.5 rounded-control border border-rule bg-surface font-bold text-muted transition hover:bg-sand hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-[3px] focus-visible:ring-offset-paper disabled:opacity-50",
          compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm", className,
        )}>
        {copied ? <Check aria-hidden="true" className="fusion-draw-check h-3.5 w-3.5 text-field" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      </button>
      {error && <p role="alert" className="mt-2 max-w-[36em] text-base text-signal-deep">{error}</p>}
    </div>
  );
}
