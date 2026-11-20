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
