import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve("..");
const out = path.join(root, "docs/redesign/m7");
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const session = `m7-offline-${Date.now()}`;
const env = { ...process.env, LLM_PROVIDER: "mock", LLM_API_KEY: "", AGENT_SETTINGS_FILE: path.join(root, ".logs/m6-m7-isolated-settings.json"), DATABASE_URL: `sqlite:///${path.join(root, ".logs/m6-m7-isolated.db").replaceAll("\\", "/")}` };
let server;
let serverPid;
let browser;
let caseId;
let page;
const evidence = { mode: "isolated mock; actual backend process stopped", status: "UNVERIFIED", observations: [] };

async function startBackend() {
  serverPid = null;
  await new Promise((resolve, reject) => {
    server = spawn(path.join(root, ".venv/Scripts/python.exe"), ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8100"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => reject(new Error("Isolated backend startup timed out")), 20000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => { clearTimeout(timer); if (code) reject(new Error(`Backend exited ${code}`)); });
    server.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/Started server process \[(\d+)\]/);
      if (match) serverPid = Number(match[1]);
      if (text.includes("Uvicorn running on")) { clearTimeout(timer); resolve(); }
      if (text.includes("error while attempting to bind")) { clearTimeout(timer); reject(new Error("Port 8100 is occupied; do not kill an unknown process")); }
    });
  });
  const response = await fetch(`${base}/api/py/health`);
  assert.equal((await response.json()).provider.is_mock, true);
}

async function stopBackend() {
  if (!serverPid) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  process.kill(serverPid);
  serverPid = null;
  await exited;
}

try {
  await startBackend();
  browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((value) => localStorage.setItem("workerrights_session_id", value), session);
  page = await context.newPage();
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "说说我的情况", exact: true }).first().click();
  await page.getByRole("textbox", { name: "你的情况", exact: true }).fill("我有笔工地工资还没拿到，想先把情况理清楚。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  caseId = page.url().split("/").pop();
  const input = page.getByRole("textbox", { name: "输入你的回答" });
  await input.waitFor();
  await stopBackend();
  const text = "我在郑州市金水区的虚构测试工地干活";
  await input.fill(text);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("button", { name: /重试/ }).waitFor();
  assert.equal(await input.inputValue(), text);
  await page.screenshot({ path: path.join(out, "mobile-backend-stopped-input-preserved.png"), fullPage: true });
  evidence.observations.push("Stopped the backend process launched by this script; sending failed visibly and input was preserved");
  const unavailable = await context.newPage();
  await unavailable.goto(`${base}/case/${caseId}`);
  await unavailable.getByRole("heading", { name: "无法打开这个案件" }).waitFor();
  await unavailable.screenshot({ path: path.join(out, "mobile-backend-stopped-reload.png"), fullPage: true });
  evidence.observations.push("Reload while backend was stopped showed the unavailable case screen");
  await startBackend();
  const response = page.waitForResponse((r) => r.url().endsWith("/messages/stream") && r.request().method() === "POST");
  await page.getByRole("button", { name: /重试/ }).click();
  await (await response).finished();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="输入你的回答"]')?.value === "");
  await page.screenshot({ path: path.join(out, "mobile-backend-restored-retry.png"), fullPage: true });
  evidence.observations.push("Restarted the isolated backend; clicking retry completed the original message");
  evidence.status = "PASS";
} catch (error) {
  evidence.error = error.message;
  if (page) await page.screenshot({ path: path.join(out, "offline-failed.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  fs.writeFileSync(path.join(out, "offline-metrics.json"), JSON.stringify(evidence, null, 2));
  if (serverPid && caseId) await fetch(`${base}/api/py/cases/${caseId}`, { method: "DELETE", headers: { "X-Session-Id": session } });
  if (browser) await browser.close();
  await stopBackend();
}
console.log(JSON.stringify(evidence, null, 2));
