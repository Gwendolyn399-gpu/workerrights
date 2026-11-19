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
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function CopyButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
  className,
  compact = false,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await copyToClipboard(text);
          setCopied(true);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-rule bg-surface font-bold text-muted transition hover:bg-sand hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-[3px] focus-visible:ring-offset-paper",
        compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-field" /> : <Copy className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}