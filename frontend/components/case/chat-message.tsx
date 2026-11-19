import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";
import { AssistantMessage } from "./assistant-message";

type AssistantTone = "default" | "summary" | "update";

export function AssistantBubble({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: AssistantTone;
}) {
  return (
    <div className="flex justify-start animate-fade-up">
      <div className="min-w-0 max-w-[92%] sm:max-w-[85%]">
        <p className="mb-1.5 text-[11px] font-bold text-muted">助手</p>
        <div
          className={cn(
            "rounded-card border px-3.5 py-3 text-base leading-7",
            tone === "summary"
              ? "border-field/40 bg-field-wash text-ink"
              : tone === "update"
                ? "border-rule bg-sand text-ink"
                : "border-rule bg-paper text-ink",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSummary = message.meta?.kind === "summary";
  const isUpdate = message.meta?.kind === "facts_updated";

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] rounded-card bg-ink px-3.5 py-3 text-base leading-7 text-surface sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <AssistantBubble tone={isSummary ? "summary" : isUpdate ? "update" : "default"}>
      <AssistantMessage content={message.content} citations={message.meta?.citations} />
      {message.meta?.question?.helper && !isSummary && (
        <p className="mt-2 text-xs leading-5 text-muted">{message.meta.question.helper}</p>
      )}
    </AssistantBubble>
  );
}

export function TypingBubble() {
  return (
    <AssistantBubble>
      <div className="flex items-center gap-1.5 py-1">
        {[0, 0.18, 0.36].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </AssistantBubble>
  );
}
