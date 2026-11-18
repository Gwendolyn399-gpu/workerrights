"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type AgentSettings } from "@/services/api";
import type { CaseBrief, CaseRecord } from "@/types/api";
import { AssistantMessage } from "@/components/case/assistant-message";
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
    const input = {base_url: baseUrl, model, api_key: apiKey};
    try {
      if (action === "test") {
        const result = await api.testAgentSettings(input);
        setSettingsStatus(`${result.note} 用量：${JSON.stringify(result.usage)}`);
      } else {
        const value = action === "save" ? await api.saveAgentSettings(input) : await api.disableAgentModel();
        setSettings(value); setBaseUrl(value.base_url); setModel(value.model); setApiKey("");
        setSettingsStatus(action === "save" ? "真实 AI 已启用，下一条消息即使用新设置；也可新建测试案件。" : "已清除本会话密钥，切回规则模式。");
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
    setBusy(true); setError(""); setDraftReply(""); setDraftCitations([]); setPendingText(text); setStreamStatus("工友正在看你的消息…");
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
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 text-ink-900">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">工友 Agent v1 · 调试台</h1>
        <p className="mt-2 text-sm text-ink-600">使用虚构案例。真实模型模式会把对话和案件上下文发送至服务端配置的模型服务。</p></div>
      <div className="flex items-center gap-4"><button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen} aria-controls="agent-settings" className="rounded-lg border bg-white px-4 py-2">模型设置</button><Link href="/" className="underline">返回首页</Link></div>
    </div>
    <p className="rounded-lg border bg-white p-3 text-sm" role="status">{settings ? settings.mode === "ai" ? `当前：真实 AI · ${settings.model}（已配置，连接情况以测试结果为准）` : "当前：规则模式，尚未启用真实 AI" : "正在读取模型设置…"}</p>
    {settingsOpen && <section id="agent-settings" aria-labelledby="settings-title" className="space-y-4 rounded-xl border bg-white p-5">
      <h2 id="settings-title" className="text-lg font-bold">模型设置</h2>
      <p className="text-sm text-ink-600">填写兼容 OpenAI Chat Completions 的接口。设置和密钥保存在本机配置文件中，重启后自动读取，已排除 Git 提交。</p>
      <fieldset disabled={busy || !settings} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2"><span className="block font-medium">API URL / Base URL</span><input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com/v1" autoComplete="off" className="w-full rounded-lg border px-3 py-3" /><span className="block text-xs text-ink-600">填写 API 基础地址，不是聊天网页地址；粘贴的 /chat/completions 后缀会自动移除。</span></label>
        <label className="space-y-2"><span className="block font-medium">模型名</span><input value={model} onChange={event => setModel(event.target.value)} placeholder="deepseek-flash" autoComplete="off" className="w-full rounded-lg border px-3 py-3" /></label>
        <label className="space-y-2"><span className="block font-medium">API Key</span><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings?.key_configured ? "密钥已配置；同一接口留空可沿用" : "在此填写 API Key"} autoComplete="new-password" spellCheck={false} className="w-full rounded-lg border px-3 py-3" /></label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button type="button" onClick={() => configure("test")} className="rounded-lg border px-4 py-3">测试连接</button>
          <button type="button" onClick={() => configure("save")} className="rounded-lg bg-brand-900 px-4 py-3 text-white">启用真实 AI</button>
          <button type="button" onClick={() => configure("disable")} className="rounded-lg border px-4 py-3">清除密钥并使用规则模式</button>
        </div>
      </fieldset>
      <p className="text-sm text-ink-600">测试连接会发送一条固定测试消息，产生少量 API 用量；启用后，咨询消息及案件上下文将发送至你填写的接口。</p>
      {settingsStatus && <p role="status" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{settingsStatus}</p>}
    </section>}
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={start} disabled={busy || restoring} className="rounded-lg bg-brand-900 px-5 py-3 text-white disabled:opacity-50">新建测试案件</button>
      <label className="flex items-center gap-2">继续已有案件
        <select value={record?.id ?? ""} disabled={busy || restoring || !cases.length} onChange={event => openCase(event.target.value)} className="max-w-sm rounded-lg border bg-white p-3">
          <option value="" disabled>{restoring ? "正在恢复记录…" : "选择案件"}</option>
          {cases.map(item => <option key={item.id} value={item.id}>{item.title} · {item.id.slice(0, 8)}</option>)}
        </select>
      </label>
    </div>
    <p className="text-sm text-ink-600">刷新后恢复当前案件；新建会开启独立对话。之前聊过的内容请在原案件继续，不会自动合并到新案件。</p>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}
    {record && <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <p className="text-sm">案件 {record.id} · {record.status} · <Link className="underline" href={`/case/${record.id}`}>正式工作台</Link></p>
        {record.messages.map(message => <article key={message.id} className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-semibold">{message.role === "user" ? "你" : message.meta.provider || "助手"}</p>
          {message.role === "user" ? <p className="whitespace-pre-wrap leading-7">{message.content}</p> :
            <AssistantMessage content={message.content} citations={message.meta.citations} />}
          {message.meta.agent_trace != null && <details className="mt-3 text-sm"><summary className="cursor-pointer">动作、用量与引用（不含隐藏思维）</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-3">{JSON.stringify({run_id: message.meta.run_id, stage: message.meta.agent_stage, actions: message.meta.agent_trace, usage: message.meta.usage, citations: message.meta.citations}, null, 2)}</pre>
          </details>}
        </article>)}
        {pendingText && <article className="rounded-lg border bg-ink-50 p-4"><p className="mb-2 font-semibold">你</p><p className="whitespace-pre-wrap">{pendingText}</p></article>}
        {pendingText && <article className="rounded-lg border p-4"><p className="mb-2 font-semibold">工友</p>{draftReply ? <AssistantMessage content={draftReply} citations={draftCitations} /> : <p>{streamStatus}</p>}<p className="mt-2 text-xs text-ink-500">正在生成，完成后保存</p></article>}
        <label htmlFor="agent-message" className="block font-medium">输入消息</label>
        <textarea id="agent-message" value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={busy} rows={4} className="w-full rounded-lg border p-3" placeholder="例如：我在郑州干了三个月，包工头把我拉黑了，怎么办？" />
        <button onClick={send} disabled={busy || !text.trim()} className="rounded-lg bg-brand-900 px-5 py-3 text-white disabled:opacity-50">{busy ? "处理中…" : "发送"}</button>
        {pendingText && <button onClick={() => streamController.current?.abort()} className="ml-3 rounded-lg border px-5 py-3">停止生成</button>}
      </section>
      <aside className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">我记下的情况</h2>
        <p>目前还差：{record.facts.owed_amount != null ? formatAmount(record.facts.owed_amount, record.facts.owed_amount_approx) : "还没说清"}</p>
        <p>已经收到：{record.facts.paid_amount != null ? formatAmount(record.facts.paid_amount) : "还没说清"}</p>
        {typeof record.intake.agent_memory?.goal === "string" && <p>你想先做的：{record.intake.agent_memory.goal}</p>}
        <p className="text-sm text-ink-600">这些按你说的记，哪里不对，直接告诉我改。</p>
        <details className="text-sm text-ink-600"><summary className="cursor-pointer">查看调试数据</summary>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap">{JSON.stringify({facts: record.facts, intake: record.intake}, null, 2)}</pre>
        </details>
      </aside>
    </div>}
  </main>;
}
