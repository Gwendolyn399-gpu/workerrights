"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/services/api";

export function HomeComposer() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const draftCase = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");

    try {
      let caseId = draftCase.current;
      if (caseId) {
        const { case: saved } = await api.getCase(caseId);
        if (saved.messages.some((message) => message.role === "user")) {
          router.push(`/case/${caseId}`);
          return;
        }
      } else {
        const result = await api.createCase();
        caseId = result.case.id;
        draftCase.current = caseId;
      }
      await api.sendMessageStream(caseId, content, () => {});
      router.push(`/case/${caseId}`);
    } catch {
      setError("这句话还在。暂时没能打开对话，可以再试一次。");
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-w-0 rounded-card border border-rule bg-surface p-4 sm:p-5">
      <label htmlFor="home-case-message" className="sr-only">你的情况</label>
      <textarea
        id="home-case-message"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        disabled={pending}
        maxLength={2000}
        rows={4}
        placeholder="在哪儿干活、工资怎么说的、现在还差多少？先说你记得的就行。"
        className="block w-full resize-none rounded-control border border-rule bg-surface p-3 text-base leading-7 text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-70"
        aria-describedby="home-case-hint"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p id="home-case-hint" className="text-xs leading-6 text-muted">请勿填写身份证号、银行卡号。</p>
        <Button type="submit" disabled={pending || !input.trim()}>
          {pending ? "正在打开对话" : "发送"}
          {pending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm leading-6 text-signal-deep">{error}</p>}
    </form>
  );
}
