import { ClipboardCheck, HardHat, Info, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";

export function ChatBubble({
  message,
  showProvider = false,
}: {
  message: ChatMessage;
  showProvider?: boolean;
}) {
  const isUser = message.role === "user";
  const isSummary = message.meta?.kind === "summary";
  const isUpdate = message.meta?.kind === "facts_updated";

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5 animate-fade-up">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-900 px-4 py-3 text-sm leading-relaxed text-white shadow-sm sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <UserRound className="h-4 w-4" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 animate-fade-up">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
          isSummary ? "bg-emerald-700" : "bg-brand-900",
        )}
      >
        {isSummary ? <ClipboardCheck className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
      </span>
      <div className="min-w-0 max-w-[88%] sm:max-w-[82%]">
        {showProvider && message.meta?.provider && (
          <p className="mb-1 text-[10px] font-medium text-ink-400">{message.meta.provider}</p>
        )}
        <div
          className={cn(
            "rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed shadow-sm",
            isSummary
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
              : isUpdate
                ? "border-brand-200 bg-brand-50/60 text-ink-700"
                : "border-ink-200 bg-white text-ink-700",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {message.meta?.question?.helper && !isSummary && (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-ink-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {message.meta.question.helper}
          </p>
        )}
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-900 text-white">
        <HardHat className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-ink-200 bg-white px-4 py-4 shadow-sm">
        {[0, 0.18, 0.36].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-400"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
        <span className="ml-1 text-[11px] text-ink-400">正在整理你的回答…</span>
      </div>
    </div>
  );
}
