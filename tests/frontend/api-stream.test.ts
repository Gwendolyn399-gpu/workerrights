import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../frontend/services/api";

function reply(response: Response) {
  vi.stubGlobal("window", { localStorage: { getItem: () => "stream-test-session" } });
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

it("does not abort the transport after a successful done event", async () => {
  const fetcher = reply(new Response('data: {"type":"done","result":{"status":"ready"}}\n\n', {
    headers: { "Content-Type": "text/event-stream" },
  }));
  const result = await api.sendMessageStream("case", "确认", vi.fn());
  expect(result.status).toBe("ready");
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
});

it("reports a truncated stream and releases its transport", async () => {
  const fetcher = reply(new Response('data: {"type":"status","text":"处理中"}\n\n'));
  await expect(api.sendMessageStream("case", "测试", vi.fn())).rejects.toThrow("连接中断");
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});

it("reports an unavailable plain-text proxy response in Chinese", async () => {
  reply(new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } }));
  await expect(api.sendMessageStream("case", "测试", vi.fn())).rejects.toThrow("暂时无法连接");
});

it("resumes the same idempotency key after a transient QCA error event", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "stream-test-session" } });
  const sse = (body: string) => new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(sse('data: {"type":"error","message":"云端咨询暂时不可用，请稍后重试。","code":"qca_unavailable"}\n\n'))
    .mockResolvedValueOnce(sse('data: {"type":"done","result":{"status":"ready"}}\n\n'));
  vi.stubGlobal("fetch", fetcher);
  const result = await api.sendMessageStream("case", "测试", vi.fn());
  expect(result.status).toBe("ready");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const keyOf = (call: any[]) => JSON.parse(call[1].body).idempotency_key;
  expect(keyOf(fetcher.mock.calls[0])).toBe(keyOf(fetcher.mock.calls[1]));
});

it("waits out a lock_busy rejection and resumes with the same key", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "stream-test-session" } });
  const sse = (body: string) => new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(sse('data: {"type":"error","message":"正在进行另一轮处理，请稍后重试。","code":"lock_busy"}\n\n'))
    .mockResolvedValueOnce(sse('data: {"type":"done","result":{"status":"ready"}}\n\n'));
  vi.stubGlobal("fetch", fetcher);
  const result = await api.sendMessageStream("case", "信息无误，生成分析", vi.fn());
  expect(result.status).toBe("ready");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const keyOf = (call: any[]) => JSON.parse(call[1].body).idempotency_key;
  expect(keyOf(fetcher.mock.calls[0])).toBe(keyOf(fetcher.mock.calls[1]));
});

it("does not retry a terminal QCA error event", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "stream-test-session" } });
  const fetcher = vi.fn().mockResolvedValue(new Response('data: {"type":"error","message":"本轮处理失败，未完成的回复不会保存，请重试。","code":"qca_turn_failed"}\n\n', { headers: { "Content-Type": "text/event-stream" } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(api.sendMessageStream("case", "测试", vi.fn())).rejects.toThrow("本轮处理失败");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("resumes the same idempotency key after a dropped transport", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "stream-test-session" } });
  const sse = (body: string) => new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new TypeError("network error"))
    .mockResolvedValueOnce(sse('data: {"type":"done","result":{"status":"ready"}}\n\n'));
  vi.stubGlobal("fetch", fetcher);
  const result = await api.sendMessageStream("case", "测试", vi.fn());
  expect(result.status).toBe("ready");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const keyOf = (call: any[]) => JSON.parse(call[1].body).idempotency_key;
  expect(keyOf(fetcher.mock.calls[0])).toBe(keyOf(fetcher.mock.calls[1]));
});
