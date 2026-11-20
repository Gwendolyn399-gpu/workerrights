"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type AgentSettings } from "@/services/api";
import type { CaseBrief, CaseRecord } from "@/types/api";
import { AssistantMessage } from "@/components/case/assistant-message";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatAmount } from "@/lib/utils";

const ACTIVE_CASE_KEY = "workerrights_agent_active_case";

export default function AgentLab() {
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [cases, setCases] = useState<CaseBrief[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [draftReply, setDraftReply] = useState("");
  const [draftCitations, setDraftCitations] = useState<Array<Record<string, unknown>>>([]);
  const [pendingText, setPendingText] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const streamController = useRef<AbortController | null>(null);
  useEffect(() => () => streamController.current?.abort(), []);
  useEffect(() => {
    api.getAgentSettings().then(value => {
      setSettings(value); setBaseUrl(value.base_url); setModel(value.model);
    }).catch(err => setError(err instanceof Error ? err.message : "读取模型设置失败"));
  }, []);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const available = (await api.listCases()).cases.filter(item => !item.is_demo);
        if (!active) return;
        setCases(available);
        const saved = localStorage.getItem(ACTIVE_CASE_KEY);
        const id = available.find(item => item.id === saved)?.id ?? available[0]?.id;
        if (id) {
          const result = await api.getCase(id);
          if (active) {
            setRecord(result.case);
            localStorage.setItem(ACTIVE_CASE_KEY, id);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "恢复案件失败");
      } finally { if (active) setRestoring(false); }
    }
    void restore();
    return () => { active = false; };
  }, []);
  async function openCase(id: string) {
    setBusy(true); setError("");
    try {
      setRecord((await api.getCase(id)).case);
      localStorage.setItem(ACTIVE_CASE_KEY, id);
      setText("");
    } catch (err) { setError(err instanceof Error ? err.message : "打开案件失败"); }
    finally { setBusy(false); }
  }
  async function configure(action: "test" | "save" | "disable") {
    setBusy(true); setError(""); setSettingsStatus("");
    const input = { base_url: baseUrl, model, api_key: apiKey };
    try {
      if (action === "test") {
        const result = await api.testAgentSettings(input);
        setSettingsStatus(`${result.note} 用量：${JSON.stringify(result.usage)}`);
      } else {
        const value = action === "save" ? await api.saveAgentSettings(input) : await api.disableAgentModel();
        setSettings(value); setBaseUrl(value.base_url); setModel(value.model); setApiKey("");
        setSettingsStatus(action === "save" ? "真实 AI 已启用，下一条消息即使用新设置。" : "已清除本会话密钥，切回规则模式。");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "设置失败"); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError("");
    try {
      const created = (await api.createCase()).case;
      setRecord(created); setText("");
      localStorage.setItem(ACTIVE_CASE_KEY, created.id);
      setCases((await api.listCases()).cases.filter(item => !item.is_demo));
    }
    catch (err) { setError(err instanceof Error ? err.message : "创建失败"); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!record || !text.trim()) return;
    setBusy(true); setError(""); setDraftReply(""); setDraftCitations([]); setPendingText(text); setStreamStatus("正在看你的消息…");
    streamController.current = new AbortController();
    try {
      const result = await api.sendMessageStream(record.id, text, event => {
        if (event.type === "reply_snapshot") { setDraftReply(event.text); setDraftCitations(event.citations ?? []); }
        if (event.type === "reply_reset") setDraftReply("");
        if (event.type === "status") setStreamStatus(event.text);
        if (event.type === "action") setStreamStatus(event.action === "search_law" ? "已查到资料，正在组织回答…" : "正在整理…");
      }, streamController.current.signal);
      setRecord(result.case); setText("");
    } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); }
    finally { streamController.current = null; setBusy(false); setDraftReply(""); setPendingText(""); setStreamStatus(""); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-ink-900 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent 调试台</h1>
          <p className="mt-1 text-sm text-ink-600">使用虚构案例。真实模型模式会把对话和案件上下文发送至服务端配置的模型服务。</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} aria-controls="agent-settings">
            模型设置
          </Button>
          <Link href="/" className="text-sm text-brand-800 underline-offset-4 hover:underline">返回首页</Link>
        </div>
      </div>

      <p className="rounded-md bg-ink-100 px-3.5 py-2.5 text-sm text-ink-700" role="status">
        {settings ? settings.mode === "ai" ? `当前：真实 AI · ${settings.model}（连接情况以测试结果为准）` : "当前：规则模式，尚未启用真实 AI" : "正在读取模型设置…"}
      </p>

      {settingsOpen && (
        <section id="agent-settings" aria-labelledby="settings-title" className="space-y-4 rounded-lg border border-ink-200 bg-white p-5">
          <h2 id="settings-title" className="text-base font-semibold">模型设置</h2>
          <p className="text-sm leading-6 text-ink-600">填写兼容 OpenAI Chat Completions 的接口。设置和密钥保存在本机配置文件，重启后自动读取，已排除 Git 提交。</p>
          <fieldset disabled={busy || !settings} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-ink-600">API Base URL</span>
              <Input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" autoComplete="off" />
              <span className="mt-1 block text-xs text-ink-500">填 API 基础地址，不是聊天网页地址；/chat/completions 后缀会自动移除。</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-600">模型名</span>
              <Input value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-chat" autoComplete="off" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-600">API Key</span>
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={settings?.key_configured ? "密钥已配置；同一接口留空可沿用" : "在此填写 API Key"} autoComplete="new-password" spellCheck={false} />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button variant="outline" onClick={() => configure("test")}>测试连接</Button>
              <Button onClick={() => configure("save")}>启用真实 AI</Button>
              <Button variant="ghost" onClick={() => configure("disable")}>清除密钥并用规则模式</Button>
            </div>
          </fieldset>
          <p className="text-xs leading-5 text-ink-500">测试连接会发送一条固定测试消息，产生少量 API 用量；启用后咨询消息及案件上下文将发送至你填写的接口。</p>
          {settingsStatus && <p role="status" className="rounded-md bg-brand-50 px-3.5 py-2.5 text-sm text-brand-900">{settingsStatus}</p>}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={start} disabled={busy || restoring}>新建测试案件</Button>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          继续已有案件
          <Select value={record?.id ?? ""} disabled={busy || restoring || !cases.length} onChange={e => openCase(e.target.value)} className="w-64">
            <option value="" disabled>{restoring ? "正在恢复记录…" : "选择案件"}</option>
            {cases.map(item => <option key={item.id} value={item.id}>{item.title} · {item.id.slice(0, 8)}</option>)}
          </Select>
        </label>
      </div>
      <p className="text-xs text-ink-500">刷新后恢复当前案件；新建会开启独立对话，不会自动合并旧案件内容。</p>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3.5 py-3 text-sm text-red-900">{error}</p>}

      {record && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="space-y-3 rounded-lg border border-ink-200 bg-white p-5">
            <p className="text-xs text-ink-500">
              案件 {record.id} · {record.status} ·{" "}
              <Link className="text-brand-800 underline-offset-2 hover:underline" href={`/case/${record.id}`}>正式工作台</Link>
            </p>
            {record.messages.map(message => (
              <article key={message.id} className="rounded-md border border-ink-100 p-3.5">
                <p className="mb-1.5 text-xs font-semibold text-ink-500">{message.role === "user" ? "你" : message.meta.provider || "助手"}</p>
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                ) : (
                  <AssistantMessage content={message.content} citations={message.meta.citations} />
                )}
                {message.meta.agent_trace != null && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-ink-500">动作、用量与引用（不含隐藏思维）</summary>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3">{JSON.stringify({ run_id: message.meta.run_id, stage: message.meta.agent_stage, actions: message.meta.agent_trace, usage: message.meta.usage, citations: message.meta.citations }, null, 2)}</pre>
                  </details>
                )}
              </article>
            ))}
            {pendingText && (
              <article className="rounded-md bg-ink-50 p-3.5">
                <p className="mb-1.5 text-xs font-semibold text-ink-500">你</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{pendingText}</p>
              </article>
            )}
            {pendingText && (
              <article className="rounded-md border border-ink-100 p-3.5">
                <p className="mb-1.5 text-xs font-semibold text-ink-500">工友</p>
                {draftReply ? <AssistantMessage content={draftReply} citations={draftCitations} /> : <p className="text-sm text-ink-600">{streamStatus}</p>}
              </article>
            )}
            <label htmlFor="agent-message" className="block text-xs font-medium text-ink-600">输入消息</label>
            <Textarea
              id="agent-message"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !busy) { e.preventDefault(); void send(); } }}
              maxLength={2000}
              disabled={busy}
              rows={3}
              placeholder="例如：我在郑州干了三个月，包工头把我拉黑了，怎么办？（Enter 发送，Shift+Enter 换行）"
            />
            <div className="flex gap-2">
              <Button onClick={send} disabled={busy || !text.trim()}>{busy ? "处理中…" : "发送"}</Button>
              {pendingText && <Button variant="outline" onClick={() => streamController.current?.abort()}>停止生成</Button>}
            </div>
          </section>
          <aside className="space-y-2 rounded-lg border border-ink-200 bg-white p-5">
            <h2 className="text-base font-semibold">我记下的情况</h2>
            <p className="text-sm text-ink-700">目前还差：{record.facts.owed_amount != null ? formatAmount(record.facts.owed_amount, record.facts.owed_amount_approx) : "还没说清"}</p>
            <p className="text-sm text-ink-700">已经收到：{record.facts.paid_amount != null ? formatAmount(record.facts.paid_amount) : "还没说清"}</p>
            {typeof record.intake.agent_memory?.goal === "string" && <p className="text-sm text-ink-700">你想先做的：{record.intake.agent_memory.goal}</p>}
            <p className="text-xs text-ink-500">这些按你说的记，哪里不对直接告诉我改。</p>
            <details className="text-xs text-ink-500">
              <summary className="cursor-pointer">查看调试数据</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3">{JSON.stringify({ facts: record.facts, intake: record.intake }, null, 2)}</pre>
            </details>
          </aside>
        </div>
      )}
    </main>
  );
}