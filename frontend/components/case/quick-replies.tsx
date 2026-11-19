"use client";

import * as React from "react";
import { Check, Send, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Question } from "@/types/api";

export function QuickReplyBar({
  question,
  onSend,
  onEdit,
  disabled,
}: {
  question: Question;
  onSend: (text: string) => void;
  onEdit: () => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [lastKey, setLastKey] = React.useState(question.key);

  if (lastKey !== question.key) {
    setLastKey(question.key);
    setSelected([]);
  }

  const options = question.quick_replies || [];
  const multi = Boolean(question.multi_select);

  const sendSingle = (label: string, value?: string) => {
    if (label === "我要修改信息") {
      onEdit();
      return;
    }
    onSend(value || label);
  };

  const toggle = (label: string) => {
    if (label.includes("都没有")) {
      setSelected((current) => (current.includes(label) ? [] : [label]));
      return;
    }
    setSelected((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current.filter((item) => !item.includes("都没有")), label],
    );
  };

  if (!options.length && !question.optional) return null;

  return (
    <div className="border-t border-rule bg-surface px-4 py-3">
      {(multi || question.optional) && (
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-xs text-muted">{multi ? "可以多选" : ""}</p>
          {question.optional && (
            <button
              type="button"
              onClick={() => onSend("跳过")}
              disabled={disabled}
              className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-muted transition hover:text-ink disabled:opacity-50"
            >
              <SkipForward className="h-3 w-3" />
              跳过
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              disabled={disabled}
              onClick={() => (multi ? toggle(option.label) : sendSingle(option.label, option.value))}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-ink bg-ink text-surface"
                  : "border-rule bg-surface text-ink hover:bg-sand",
              )}
            >
              {multi && active && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
      {multi && (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="h-11"
            disabled={disabled || selected.length === 0}
            onClick={() => onSend(selected.join("、"))}
          >
            <Send className="h-3.5 w-3.5" />
            发送所选{selected.length ? `（${selected.length}）` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
