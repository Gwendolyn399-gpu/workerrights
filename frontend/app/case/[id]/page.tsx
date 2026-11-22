"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Loader2, Mic, MicOff, PencilLine, RefreshCw, Send } from "lucide-react";

import { useCase } from "@/components/case/case-provider";
import { CaseInfoPanel } from "@/components/case/case-info-panel";
import { AssistantBubble, ChatBubble, TypingBubble } from "@/components/case/chat-message";
import { AssistantMessage } from "@/components/case/assistant-message";
import { FactsEditor } from "@/components/case/facts-editor";
import { QuickReplyBar } from "@/components/case/quick-replies";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { locationValue } from "@/lib/facts";
import { cn, formatAmount } from "@/lib/utils";
import { api } from "@/services/api";
import type { ChatMessage, Question } from "@/types/api";

const openingTopics: Question = {
  key: "opening",
  text: "说说你遇到的情况",
  quick_replies: [
    { label: "工资没结清，怎么办？" },
    { label: "我该找谁反映？" },
    { label: "需要准备哪些材料？" },
  ],
};

export default function ChatPage() {
  const { caseId, caseData, meta, setCaseData } = useCase();
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [retryText, setRetryText] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [dossierOpen, setDossierOpen] = React.useState(false);
  const [draftReply, setDraftReply] = React.useState("");
  const [draftCitations, setDraftCitations] = React.useState<Array<Record<string, unknown>>>([]);
  const [streamStatus, setStreamStatus] = React.useState("");
  const [queuedConfirm, setQueuedConfirm] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const streamController = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => streamController.current?.abort(), []);

  const messages = caseData?.messages || [];
  const firstUserIndex = messages.findIndex((message) => message.role === "user");
  const conversation = firstUserIndex < 0 ? [] : messages.slice(firstUserIndex);
  const showOpening = firstUserIndex < 0 && !sending && !retryText;

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending, draftReply]);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const currentQuestion = !sending && lastAssistant?.meta?.question ? lastAssistant.meta.question : null;

  const speech = useSpeechRecognition((text) => setInput(text));

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending || !caseData) return;
    setError("");
    setRetryText("");
    setSending(true);
    setDraftReply("");
    setDraftCitations([]);
    setStreamStatus("正在看你的消息…");
    streamController.current = new AbortController();
    const optimistic: ChatMessage = {
      id: -Date.now(),
      role: "user",
      content,
      meta: {},
      created_at: new Date().toISOString(),
    };
    setCaseData((current) =>
      current ? { ...current, messages: [...current.messages, optimistic] } : current,
    );
    if (input.trim() === content) setInput("");
    try {
      const result = await api.sendMessageStream(
        caseId,
        content,
        (event) => {
          if (event.type === "reply_snapshot") {
            setDraftReply(event.text);
            setDraftCitations(event.citations ?? []);
          }
          if (event.type === "reply_reset") setDraftReply("");
          if (event.type === "status") setStreamStatus(event.text);
          if (event.type === "action") {
            setStreamStatus(event.action === "search_law" ? "已查到资料，正在组织回答…" : "正在整理…");
          }
        },
        streamController.current.signal,
      );
      setCaseData(result.case);
    } catch (err) {
      const aborted = streamController.current?.signal.aborted ?? false;
      setCaseData((current) =>
        current
          ? { ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }
          : current,
      );
      if (!aborted) {
        setError(err instanceof Error ? err.message : "发送失败，请稍后重试。");
        setRetryText(content);
        setInput(content);
      }
    } finally {
      setSending(false);
      streamController.current = null;
      setDraftReply("");
      setStreamStatus("");
    }
  };

  React.useEffect(() => {
    if (!sending && queuedConfirm) {
      setQueuedConfirm(false);
      void send("信息无误，生成分析");
    }
  }, [sending, queuedConfirm]);

  if (!caseData) return null;
  const facts = caseData.facts;
  const awaitingConfirmation =
    !caseData.intake.confirmed &&
    (currentQuestion?.key === "confirm" || caseData.intake.agent_stage === "awaiting_confirmation");
  const isAiGenerated = (lastAssistant?.meta?.provider_is_mock ?? meta?.provider.is_mock) === false;
  const contentLabel = isAiGenerated ? "由 AI 生成" : "内容仅供参考";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-card border border-rule bg-surface px-3 py-2.5 lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-ink">{locationValue(facts)}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <span className={cn(facts.owed_amount && "font-bold text-signal-deep")}>
                {facts.owed_amount
                  ? `欠薪 ${formatAmount(facts.owed_amount, facts.owed_amount_approx)}`
                  : "欠薪金额待核实"}
              </span>
              <span>
                已整理 {caseData.progress.done}/{caseData.progress.total} 项
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 shrink-0"
            onClick={() => setDossierOpen(true)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            案件档案
          </Button>
        </div>

        <div className="flex h-[calc(100dvh-17rem)] min-h-[380px] flex-col overflow-hidden rounded-card border border-rule bg-surface lg:h-[calc(100vh-13rem)]">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            {showOpening && (
              <div className="py-8" data-chat-opening>
                <h2 className="text-xl font-extrabold text-ink">遇到什么难处，慢慢说。</h2>
                <p className="mt-3 max-w-[30em] text-base leading-7 text-muted">工资没结清、不知道找谁，或想准备材料，都可以从这里聊起。</p>
              </div>
            )}
            {conversation.map((message, index) => (
              <ChatBubble key={`${message.id}-${index}`} message={message} />
            ))}
            {sending &&
              (draftReply ? (
                <AssistantBubble>
                  <AssistantMessage content={draftReply} citations={draftCitations} />
                </AssistantBubble>
              ) : (
                <>
                  <TypingBubble />
                  <p className="text-xs text-muted">{streamStatus}</p>
                </>
              ))}
            <div ref={bottomRef} />
          </div>

          {awaitingConfirmation && (
            <div className="border-t border-rule bg-sand px-4 py-3 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-ink">请核对案件档案</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    已整理 {caseData.progress.done}/{caseData.progress.total} 项。确认后，再生成案件分析和行动步骤。
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold text-ink">
                  {caseData.progress.done}/{caseData.progress.total}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => (sending ? setQueuedConfirm(true) : void send("信息无误，生成分析"))}
                  className="h-11"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {queuedConfirm ? "已排队，上一轮结束后自动确认" : "确认信息，生成分析"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                  disabled={sending}
                  className="h-11"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  发现不对，修改档案
                </Button>
              </div>
            </div>
          )}

          {caseData.intake.confirmed && (
            <div className="border-t border-rule bg-field-wash px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-field">信息已确认</p>
                  <p className="mt-1 text-xs leading-5 text-field">
                    下一步：看分析，或直接按行动步骤办理。
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/case/${caseId}/analysis`}
                    className={cn(buttonVariants({ size: "sm" }), "h-11 justify-center")}
                  >
                    下一步：看案件分析
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/case/${caseId}/action-plan`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11 justify-center")}
                  >
                    直接看行动步骤
                  </Link>
                </div>
              </div>
            </div>
          )}

          {showOpening && !awaitingConfirmation && (
            <QuickReplyBar
              question={openingTopics}
              onSend={send}
              onEdit={() => setEditOpen(true)}
              disabled={sending}
            />
          )}

          <div className="shrink-0 border-t border-rule px-4 py-3 sm:px-5">
            {error && (
              <Alert
                variant="danger"
                className="mb-2 py-2 text-xs"
                action={
                  retryText && !sending ? (
                    <button
                      type="button"
                      onClick={() => void send(retryText)}
                      className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-bold underline underline-offset-4"
                    >
                      <RefreshCw className="h-3 w-3" />
                      重试
                    </button>
                  ) : undefined
                }
              >
                {error} 内容已保留在输入框。
              </Alert>
            )}
            {speech.error && (
              <Alert variant="warning" className="mb-2 py-2 text-xs">
                {speech.error}
              </Alert>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2"
            >
              <div className="relative flex-1">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value.slice(0, 2000))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder={showOpening ? "说说你想咨询的事…" : "输入消息…"}
                  className="block min-h-12 max-h-32 resize-none py-3 pr-14 leading-6"
                  aria-label="输入你的回答"
                />
                <button
                  type="button"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  title={speech.supported ? "语音输入" : "当前浏览器不支持语音输入"}
                  className={cn(
                    "absolute bottom-0 right-0 inline-flex h-12 w-12 items-center justify-center rounded-control transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/90",
                    speech.listening
                      ? "bg-signal-wash text-signal-deep"
                      : "text-muted hover:bg-sand hover:text-ink",
                  )}
                  aria-label={speech.listening ? "停止语音输入" : "开始语音输入"}
                >
                  {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="submit"
                size="icon"
                className="h-12 w-12"
                disabled={!input.trim() || sending}
                aria-label="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
              {sending && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  onClick={() => streamController.current?.abort()}
                >
                  停止
                </Button>
              )}
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs leading-5 text-muted">{contentLabel}</p>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex min-h-11 items-center text-xs font-bold text-signal-deep underline-offset-4 hover:underline"
              >
                修改案件信息
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-36 h-[calc(100vh-13rem)]">
          <CaseInfoPanel />
        </div>
      </aside>

      <Modal
        open={dossierOpen}
        onClose={() => setDossierOpen(false)}
        title="案件档案"
        description="确认前先核对；不清楚的项可以留作待核实。"
      >
        <CaseInfoPanel bare />
      </Modal>

      <FactsEditor open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
