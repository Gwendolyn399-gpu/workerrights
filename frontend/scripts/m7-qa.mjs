import { chromium, request } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

// Verify both the proxy and isolated backend are mock before any case interaction.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/redesign/m7");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const BACKEND = "http://127.0.0.1:8100/api/v1";
const STALE = "信息已更新，请重新生成";
const REGENERATE = "回到对话核对并重新生成";
const TIMEOUT = 35_000;
const RUN = `m7-${Date.now()}-${randomUUID().slice(0, 8)}`;
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const DERIVED = ["analysis", "action-plan", "form-assistant"];
const ANSWERS = {
  location: "郑州市", district: "金水区", work_type: "钢筋工",
  period: "干了三个月", recruiter: "包工头王老板招我",
  manager: "包工头安排工作和考勤", wage_basis: "一天350元",
  amounts: "应发两万六，还欠两万", paid_amount: "已支付6000元",
  agreed_amount: "应发工资总额26000元", owed_amount: "还欠20000元",
  owed_confirm: "对，还欠20000元", contract: "没签合同",
  evidence: "有微信聊天和转账记录", project_info: "项目叫测试安置房（虚构）",
  prior_report: "没有投诉过",
};
const metrics = {
  script: "frontend/scripts/m7-qa.mjs", run: RUN, startedAt: new Date().toISOString(),
  status: "UNVERIFIED", baseURL: BASE, backend: BACKEND,
  transport: "Normal browser requests through Next /api/py proxy to isolated mock backend; no golden response interception",
  cases: [], checks: [], rows: [], events: [], errors: [],
};
const contexts = [];
const apiContexts = [];
const pending = new Set();
const audits = [];
let browser;
let activePage;
let activeMode = "setup";
let fatal;

function save() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(metrics, null, 2));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function planned(size, name, mode = "golden") {
  const item = { size, name, mode, status: "UNVERIFIED", evidence: [], observation: null };
  metrics.checks.push(item);
  return item;
}
async function check(item, work) {
  activeMode = item.mode;
  try {
    item.observation = (await work(item)) ?? null;
    item.status = "PASS";
    save();
    return item.observation;
  } catch (error) {
    item.error = error.message;
    // UNVERIFIED is deliberate: a failed assertion must never turn into PASS.
    throw new Error(`${item.size}/${item.name}: ${error.message}`, { cause: error });
  }
}
function track(work, audit) {
  const task = work.catch((error) => {
    const event = { mode: audit.mode, size: audit.size, kind: "observer", message: error.message };
    audit.errors.push(event);
    metrics.errors.push(event);
  }).finally(() => pending.delete(task));
  pending.add(task);
}
async function drain() {
  while (pending.size) await Promise.all([...pending]);
}
function watch(page, size, mode) {
  const audit = { size, mode, errors: [] };
  audits.push(audit);
  const error = (kind, message, extra = {}) => {
    const event = { size, mode: audit.mode, kind, message, ...extra };
    audit.errors.push(event);
    metrics.errors.push(event);
  };
  // No console.error/pageerror filtering, including developer-tool messages.
  page.on("console", (message) => {
    if (message.type() === "error") error("console.error", message.text());
  });
  page.on("pageerror", (err) => error("pageerror", err.message));
  page.on("requestfailed", (req) => error("requestfailed", req.failure()?.errorText || "unknown", {
    url: req.url(), method: req.method(),
  }));
  page.on("response", (response) => {
    if (response.status() >= 400) error("response", `HTTP ${response.status()}`, { url: response.url() });
    if (response.url().endsWith("/messages/stream") && response.ok()) {
      track((async () => {
        const events = parseSSE(await response.text());
        metrics.events.push({ size, mode: audit.mode, kind: "stream", types: events.map((item) => item.type) });
        assert(!events.some((item) => item.type === "error"), "SSE returned an error event");
        assert(events.some((item) => item.type === "done"), "SSE closed without done");
      })(), audit);
    }
  });
  return audit;
}
function parseSSE(body) {
  return body.replace(/\r\n/g, "\n").split("\n\n").filter((block) => block.trim()).flatMap((block) => {
    const data = block.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    return data ? [JSON.parse(data)] : [];
  });
}
async function newAPI(session) {
  const api = await request.newContext({
    extraHTTPHeaders: session ? { "X-Session-Id": session } : {}, timeout: TIMEOUT,
  });
  apiContexts.push(api);
  return api;
}
async function mockGate(api, prefix = BACKEND) {
  const response = await api.get(`${prefix}/meta`, { maxRedirects: 0 });
  assert(response.ok(), `Mock preflight ${prefix}/meta: ${response.status()}`);
  const meta = await response.json();
  assert(meta.provider?.is_mock === true, `Refusing generation: ${prefix} provider.is_mock is not true`);
  return { is_mock: true, provider_id: meta.provider.provider_id, source: `${prefix}/meta` };
}
async function get(api, suffix) {
  await mockGate(api);
  const response = await api.get(`${BACKEND}${suffix}`, { maxRedirects: 0 });
  assert(response.ok(), `GET ${suffix}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function record(api, id) {
  return (await get(api, `/cases/${id}`)).case;
}
function revision(data) {
  assert(Number.isInteger(data.facts_revision), "case.facts_revision missing/not integer");
  return data.facts_revision;
}
function generated(data) {
  assert(Number.isInteger(data.generated_from_revision), "generated_from_revision missing/not integer");
  return data.generated_from_revision;
}
async function setupContext(size, session, api) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1,
    isMobile: size.name === "mobile", hasTouch: size.name === "mobile",
    acceptDownloads: true, serviceWorkers: "block",
  });
  contexts.push(context);
  context.setDefaultTimeout(TIMEOUT);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
  await context.addInitScript((value) => localStorage.setItem("workerrights_session_id", value), session);
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["http:", "https:"].includes(url.protocol)) return route.continue();
    if (url.origin !== new URL(BASE).origin) {
      metrics.errors.push({ mode: "safety", kind: "blocked-external", url: req.url() });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return context;
}
async function until(test, message) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const value = await test();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}
async function visible(locator) {
  for (let i = 0; i < await locator.count(); i++) if (await locator.nth(i).isVisible()) return locator.nth(i);
  throw new Error(`No visible match: ${locator}`);
}
async function ready(page, surface) {
  await page.locator("main").waitFor();
  if (surface === "chat") await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
  else await page.locator("main h1").waitFor();
  if (surface === "form-assistant") {
    assert(await page.locator("main h1").innerText() === "填报参考", "Unexpected form h1");
    await page.locator("#form-step-heading").waitFor();
  }
  await page.evaluate(async () => { await document.fonts.ready; });
}
async function visit(page, pathname, surface) {
  activePage = page;
  await page.goto(`${BASE}${pathname}`, { waitUntil: "networkidle" });
  await ready(page, surface);
}
async function shot(page, name, fullPage = true) {
  const filename = path.join(OUT, `${RUN}-${name}.png`);
  await page.screenshot({ path: filename, fullPage });
  return filename;
}
async function measure(page, size, surface, api, id, item, extraScreens = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const row = await page.evaluate(() => {
    const root = document.documentElement;
    const buttons = [...document.querySelectorAll("main button")].filter((button) => {
      const style = getComputedStyle(button);
      return button.getClientRects().length && style.visibility !== "hidden" && style.display !== "none";
    });
    return {
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      minHeight: buttons.length ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height)) : null,
      visibleMainButtons: buttons.length,
      h1: document.querySelector("main h1")?.textContent?.trim() || null,
    };
  });
  Object.assign(row, { size: size.name, surface, mode: item.mode, status: "UNVERIFIED",
    caseId: id || null, caseRevision: id ? revision(await record(api, id)) : null, evidence: [] });
  metrics.rows.push(row);
  row.evidence.push(await shot(page, `${size.name}-${surface}`));
  if (extraScreens) {
    row.evidence.push(await shot(page, `${size.name}-${surface}-first-screen`, false));
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    row.evidence.push(await shot(page, `${size.name}-${surface}-second-screen`, false));
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  item.evidence.push(...row.evidence);
  assert(row.horizontalOverflow === 0, `${surface} horizontal overflow ${row.horizontalOverflow}px`);
  row.status = "PASS";
  return row;
}
async function send(page, trigger) {
  const responsePromise = page.waitForResponse((res) => res.url().endsWith("/messages/stream") && res.request().method() === "POST", { timeout: 100_000 });
  const [response] = await Promise.all([responsePromise, trigger()]);
  assert(response.ok(), `Stream HTTP ${response.status()}`);
  const events = parseSSE(await response.text());
  assert(!events.some((event) => event.type === "error"), "Stream contains error event");
  const done = events.find((event) => event.type === "done");
  assert(done?.result?.case, "Stream must contain done.result.case");
  assert(done.result.provider?.is_mock === true, "Stream provider must explicitly be mock");
  await until(async () => await page.getByRole("button", { name: "停止", exact: true }).count() === 0,
    "Sending state did not clear");
  // An empty composer legitimately disables Send. A harmless, UNSENT draft proves
  // that sending=false and the real Send control has recovered after done.
  const input = page.getByRole("textbox", { name: "输入你的回答" });
  await input.fill("QA未发送草稿");
  await until(() => page.getByRole("button", { name: "发送", exact: true }).isEnabled(), "Send never recovered");
  await input.fill("");
  await drain();
  return done.result.case;
}
async function confirm(page, api, id) {
  await mockGate(api);
  await send(page, () => page.getByRole("button", { name: "确认信息，生成分析", exact: true }).click());
  const data = await record(api, id);
  assert(data.intake.confirmed === true, "UI confirmation not persisted");
  return data;
}
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function chooseStep(page, form, index) {
  assert(form.steps[index]?.title, `Missing form step ${index}`);
  const selects = page.locator("main select");
  let dropdown;
  for (let i = 0; i < await selects.count(); i++) if (await selects.nth(i).isVisible()) dropdown = selects.nth(i);
  if (dropdown) await dropdown.selectOption(String(index));
  else await (await visible(page.getByRole("button", { name: new RegExp(escaped(form.steps[index].title)) }))).click();
  await until(async () => (await page.locator("#form-step-heading").innerText()) === form.steps[index].title,
    `Form step ${index + 1} did not activate`);
}
async function copyAndRead(page, button, expected) {
  assert(typeof expected === "string" && expected.length > 0, "Expected clipboard text missing");
  await page.bringToFront();
  await page.evaluate(() => navigator.clipboard.writeText("m7 clipboard sentinel"));
  await button.click();
  await until(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n"),
    "Real clipboard does not match the API reference text after Windows newline normalization");
  return { bytes: Buffer.byteLength(expected), sha256: createHash("sha256").update(expected).digest("hex") };
}
async function download(page, format, size, item) {
  const [file] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: format.toUpperCase(), exact: true }).click(),
  ]);
  assert(!(await file.failure()), `Download failure: ${await file.failure()}`);
  const filename = path.join(ROOT, ".logs", `${RUN}-${size}-${item.name}.${format}`);
  await file.saveAs(filename);
  const bytes = fs.readFileSync(filename);
  const magic = format === "docx" ? "PK" : "%PDF";
  assert(bytes.length > magic.length && bytes.subarray(0, magic.length).toString() === magic,
    `Invalid ${format} signature/empty file`);
  item.evidence.push(filename);
  return { format, bytes: bytes.length, magic, sha256: createHash("sha256").update(bytes).digest("hex"), path: filename };
}
async function progress(api, id, completedKey) {
  const plan = await get(api, `/cases/${id}/action-plan`);
  assert(plan.progress.done === 1 && plan.progress.total === 8, `Expected action progress 1/8, got ${JSON.stringify(plan.progress)}`);
  assert(plan.steps.filter((step) => step.done).length === 1, "More/less than one persisted completed step");
  if (completedKey) assert(plan.steps.find((step) => step.step_key === completedKey)?.done, "Original completed step lost");
  return plan;
}
async function openStatement(page) {
  const summaries = page.locator("main summary").filter({ hasText: /正式事实陈述|展开陈述全文/ });
  for (let i = 0; i < await summaries.count(); i++) {
    const summary = summaries.nth(i);
    if (await summary.isVisible() && !(await summary.evaluate((node) => node.parentElement.open))) await summary.click();
  }
}

async function golden(size, checks) {
  const session = `${RUN}-${size.name}`;
  const api = await newAPI(session);
  await check(checks.preflight, async () => ({
    direct: await mockGate(api), proxy: await mockGate(api, `${BASE}/api/py`),
  }));
  const context = await setupContext(size, session, api);
  const page = await context.newPage();
  activePage = page;
  const audit = watch(page, size.name, "golden");
  let id;
  let form;
  let completedKey;
  await check(checks.home, async (item) => {
    await visit(page, "/", "home");
    return measure(page, size, "home", api, null, item);
  });
  await check(checks.cases, async (item) => {
    await visit(page, "/cases", "cases");
    const list = await get(api, "/cases");
    assert(list.cases.length === 0, "Unique session unexpectedly contains cases");
    return measure(page, size, "cases", api, null, item);
  });
  await check(checks.intake, async (item) => {
    await visit(page, "/", "home");
    const [created] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname === "/api/py/cases" && res.request().method() === "POST"),
      page.getByRole("button", { name: "说说我的情况", exact: true }).first().click(),
    ]);
    assert(created.ok(), `Create case: HTTP ${created.status()}`);
    const payload = await created.json();
    id = payload.case?.id;
    assert(typeof id === "string" && /^[a-zA-Z0-9-]+$/.test(id), "Invalid created case ID");
    metrics.cases.push({ session, id, size: size.name, synthetic: true, createdBy: metrics.script, retained: true });
    save();
    assert(payload.provider?.is_mock === true, "Create provider not mock");
    await page.waitForURL(`${BASE}/case/${id}`);
    await ready(page, "chat");
    assert((await record(api, id)).is_demo === false, "Expected real new synthetic case, not demo");
    const turns = [];
    let data;
    for (let round = 0; round < 30; round++) {
      data = await record(api, id);
      const assistant = [...data.messages].reverse().find((message) => message.role === "assistant");
      const key = assistant?.meta?.question?.key;
      if (key === "confirm") break;
      assert(Object.hasOwn(ANSWERS, key), `Unknown/missing intake question key: ${String(key)}`);
      await mockGate(api);
      await send(page, async () => {
        const input = page.getByRole("textbox", { name: "输入你的回答" });
        await input.fill(ANSWERS[key]);
        await input.press("Enter");
      });
      const latest = await record(api, id);
      turns.push({ round: round + 1, key, caseRevision: revision(latest) });
    }
    data = await record(api, id);
    const last = [...data.messages].reverse().find((message) => message.role === "assistant");
    assert(last?.meta?.question?.key === "confirm", "Intake exceeded 30 rounds without confirmation");
    assert(data.facts.location_city === "郑州市" && data.facts.location_district === "金水区", "Location facts missing");
    assert(data.facts.work_type === "钢筋工" && data.facts.owed_amount === 20000 && data.facts.paid_amount === 6000 && data.facts.agreed_amount === 26000, "Core work/amount facts differ");
    assert(data.facts.project_name?.includes("测试安置房") && data.facts.prior_report === "no", "Optional answers not collected");
    assert(data.facts.has_contract === "no" && data.facts.evidence?.includes("chat") && data.facts.evidence?.includes("transfer"), "Contract/evidence facts missing");
    assert(data.progress.done === data.progress.total && data.progress.unknown_count === 0, "Not all core facts answered");
    assert(Object.keys(data.intake.unknowns || {}).length === 0 && (data.intake.skipped || []).length === 0, "Core path silently skipped a fact");
    await confirm(page, api, id);
    item.evidence.push(await shot(page, `${size.name}-confirmation`));
    return { turns, id, session, confirmed: true };
  });
  await check(checks.chat, (item) => measure(page, size, "chat", api, id, item));
  await check(checks.analysis, async (item) => {
    await page.getByRole("link", { name: "下一步：看案件分析" }).click();
    await page.waitForURL(`${BASE}/case/${id}/analysis`);
    await page.waitForLoadState("networkidle");
    await ready(page, "analysis");
    const data = await get(api, `/cases/${id}/analysis`);
    assert(generated(data) === revision(await record(api, id)), "Initial analysis revision mismatch");
    return measure(page, size, "analysis", api, id, item, true);
  });
  await check(checks.action, async (item) => {
    await visit(page, `/case/${id}/action-plan`, "action-plan");
    const initial = await get(api, `/cases/${id}/action-plan`);
    assert(initial.progress.done === 0 && initial.progress.total === 8, "New action plan not 0/8");
    assert(generated(initial) === revision(await record(api, id)), "Initial action revision mismatch");
    await measure(page, size, "action", api, id, item, true);
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/cases/${id}/action-plan/steps/`) && res.request().method() === "PATCH"),
      (await visible(page.getByRole("button", { name: "标记完成", exact: true }))).click(),
    ]);
    assert(response.ok(), `Complete step: ${response.status()}`);
    const after = await progress(api, id);
    completedKey = after.steps.find((step) => step.done).step_key;
    await page.getByText("办理进度 1/8 步", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("办理进度 1/8 步", { exact: true }).waitFor();
    await progress(api, id, completedKey);
    item.evidence.push(await shot(page, `${size.name}-action-progress-reload`));
    return { done: after.progress.done, total: after.progress.total, completedKey };
  });
  await check(checks["form-first"], async (item) => {
    await visit(page, `/case/${id}/form-assistant`, "form-assistant");
    form = await get(api, `/cases/${id}/form-assistant`);
    assert(form.steps.length > 1, "Form must contain multiple actual steps");
    assert(generated(form) === revision(await record(api, id)), "Initial form revision mismatch");
    await measure(page, size, "form-first", api, id, item);
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await until(async () => (await page.locator("#form-step-heading").innerText()) === form.steps[1].title, "Next failed");
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    assert(await page.locator("#form-step-heading").innerText() === form.steps[0].title, "Previous failed");
    return { actualStepCount: form.steps.length };
  });
  await check(checks.clipboard, async (item) => {
    const all = await copyAndRead(page, page.getByRole("button", { name: "复制全部字段", exact: true }), form.copy_summary);
    let field;
    for (let i = 0; i < form.steps.length && !field; i++) {
      field = form.steps[i].fields.find((candidate) => candidate.status !== "official_only" && candidate.value);
      if (field) await chooseStep(page, form, i);
    }
    assert(field, "No copyable field in actual form steps");
    const article = page.locator("article[data-field-key]").filter({ has: page.getByRole("heading", { name: new RegExp(escaped(field.label)) }) });
    const single = await copyAndRead(page, article.getByRole("button", { name: "复制此字段", exact: true }), field.value);
    await openStatement(page);
    const statement = await copyAndRead(page, page.getByRole("button", { name: "复制陈述", exact: true }), form.formal_statement);
    item.evidence.push(await shot(page, `${size.name}-clipboard-statement`));
    return { all, field: { key: field.key, ...single }, statement };
  });
  await check(checks["form-last"], async (item) => {
    await chooseStep(page, form, form.steps.length - 1);
    await page.getByRole("link", { name: "回到行动步骤", exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "下一步", exact: true }).count() === 0, "Last step still offers Next");
    await measure(page, size, "form-last", api, id, item);
    await page.getByRole("link", { name: "回到行动步骤", exact: true }).click();
    await page.waitForURL(`${BASE}/case/${id}/action-plan`);
    await page.waitForLoadState("networkidle");
    await ready(page, "action-plan");
    await visit(page, `/case/${id}/form-assistant`, "form-assistant");
    return { actualStepCount: form.steps.length, lastTitle: form.steps.at(-1).title };
  });
  await check(checks.downloads, async (item) => {
    const files = [];
    for (const format of ["docx", "pdf"]) files.push(await download(page, format, size.name, item));
    await page.reload({ waitUntil: "networkidle" });
    await ready(page, "form-assistant");
    assert(generated(await get(api, `/cases/${id}/form-assistant`)) === revision(await record(api, id)), "Refresh changed form revision");
    return files;
  });
  const old = {};
  let changedRevision;
  await check(checks["edit-facts"], async (item) => {
    for (const suffix of DERIVED) old[suffix] = await get(api, `/cases/${id}/${suffix}`);
    const before = await record(api, id);
    await visit(page, `/case/${id}`, "chat");
    if (size.name === "mobile") {
      await page.getByRole("button", { name: "案件档案", exact: true }).click();
      await page.getByRole("dialog", { name: "案件档案", exact: true }).getByRole("button", { name: "核对或修改档案", exact: true }).click();
    } else {
      await (await visible(page.getByRole("button", { name: "核对或修改档案", exact: true }))).click();
    }
    // Nested mobile dialogs currently reuse modal-title; scope by the actual
    // heading rather than relying on the duplicate aria-labelledby ID.
    const editor = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "修改案件信息", exact: true }) });
    await editor.getByLabel("拖欠金额（元）", { exact: true }).fill("19000");
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith(`/cases/${id}/facts`) && res.request().method() === "PATCH"),
      editor.getByRole("button", { name: "保存修改", exact: true }).click(),
    ]);
    assert(response.ok(), `UI facts PATCH failed: ${response.status()}`);
    await editor.waitFor({ state: "hidden" });
    const after = await record(api, id);
    changedRevision = revision(after);
    assert(after.id === id && after.facts.owed_amount === 19000, "UI amount edit not persisted to original case");
    assert(changedRevision === revision(before) + 1 && after.intake.confirmed === false, "Edit must increment revision once and revoke confirmation");
    item.evidence.push(await shot(page, `${size.name}-facts-edited`));
    return { before: revision(before), after: changedRevision, owedAmount: after.facts.owed_amount };
  });
  await check(checks.stale, async (item) => {
    const observations = [];
    for (const suffix of DERIVED) {
      for (const refresh of [false, true]) {
        if (refresh) { await page.reload({ waitUntil: "networkidle" }); await ready(page, suffix); }
        else await visit(page, `/case/${id}/${suffix}`, suffix);
        const data = await get(api, `/cases/${id}/${suffix}`);
        assert(generated(data) === generated(old[suffix]) && generated(data) < changedRevision, `${suffix} GET regenerated stale cache`);
        if (old[suffix].generated_at) assert(data.generated_at === old[suffix].generated_at, `${suffix} cache generation timestamp changed`);
        await page.getByText(STALE, { exact: true }).waitFor();
        await page.getByRole("link", { name: REGENERATE, exact: true }).waitFor();
        await measure(page, size, `${suffix}-stale${refresh ? "-reload" : ""}`, api, id, item);
        observations.push({ suffix, refresh, cachedRevision: generated(data), currentRevision: changedRevision });
      }
    }
    for (const format of ["docx", "pdf"]) {
      await mockGate(api);
      const response = await api.get(`${BACKEND}/cases/${id}/export/${format}`, { maxRedirects: 0 });
      const body = await response.json();
      assert(response.status() === 409 && typeof body.detail === "string" && body.detail.includes(STALE), `Stale ${format} export not 409 with Chinese instruction`);
      observations.push({ format, status: response.status(), detail: body.detail, mode: "expected_api_rejection" });
    }
    return observations;
  });
  await check(checks.regenerate, async (item) => {
    await page.getByRole("link", { name: REGENERATE, exact: true }).click();
    await page.waitForURL(`${BASE}/case/${id}`);
    await ready(page, "chat");
    const confirmed = await confirm(page, api, id);
    assert(revision(confirmed) === changedRevision, "Confirmation unexpectedly changed facts revision");
    const observations = [];
    for (const suffix of DERIVED) {
      await visit(page, `/case/${id}/${suffix}`, suffix);
      const data = await get(api, `/cases/${id}/${suffix}`);
      assert(generated(data) === changedRevision, `${suffix} did not regenerate at current revision`);
      assert(await page.getByText(STALE, { exact: true }).count() === 0, `${suffix} stale banner remains`);
      const source = suffix === "analysis" ? data.basic_info.find((entry) => entry.key === "owed")?.value
        : suffix === "action-plan" ? data.formal_statement : data.formal_statement;
      assert(typeof source === "string" && /19[,，]?000|1\.9\s*万|一万九/.test(source), `${suffix} generated content lacks revised amount`);
      if (suffix === "form-assistant") await openStatement(page);
      // API data alone cannot prove the UI updated: read rendered main text too.
      assert(/19[,，]?000|1\.9\s*万|一万九/.test(await page.locator("main").innerText()), `${suffix} UI does not show revised amount`);
      await measure(page, size, `${suffix}-regenerated`, api, id, item);
      observations.push({ suffix, generatedFromRevision: generated(data), owedAmount: 19000 });
    }
    await progress(api, id, completedKey);
    assert((await record(api, id)).id === id, "Regeneration replaced the case");
    return { observations, retainedCompletedKey: completedKey };
  });
  await check(checks.isolation, async () => {
    const other = await newAPI(`${RUN}-foreign-${size.name}`);
    const anonymous = await newAPI();
    const observations = [];
    for (const suffix of ["", "/analysis", "/action-plan", "/form-assistant", "/export/docx", "/export/pdf"]) {
      for (const [label, client] of [["different-session", other], ["no-session", anonymous]]) {
        await mockGate(api);
        const response = await client.get(`${BACKEND}/cases/${id}${suffix}`, { maxRedirects: 0 });
        assert(label === "different-session" ? response.status() === 404 : [400, 401, 403, 404, 422].includes(response.status()), `${label} leaked ${suffix || "case"}: HTTP ${response.status()}`);
        observations.push({ mode: "expected_api_rejection", credentials: label, suffix, status: response.status() });
      }
    }
    return observations;
  });
  await check(checks["golden-errors"], async () => {
    await drain();
    assert(audit.errors.length === 0, `Golden browser errors: ${JSON.stringify(audit.errors)}`);
    return {
      consoleErrors: audit.errors.filter((event) => event.kind === "console.error").length,
      pageErrors: audit.errors.filter((event) => event.kind === "pageerror").length,
      failedRequests: audit.errors.filter((event) => event.kind === "requestfailed").length,
      responseErrors: audit.errors.filter((event) => event.kind === "response").length,
      devNoiseFiltered: false,
    };
  });
  await faults(context, size, api, id, checks.faults);
  await page.close();
}

async function faults(context, size, api, id, item) {
  await check(item, async () => {
    // Independent page; no injected failure is counted as a golden-path error.
    const page = await context.newPage();
    activePage = page;
    const audit = watch(page, size.name, "fault_injection");
    const results = [];
    const expected = new Set();
    function acceptExpected(events, kind, endpoint) {
      for (const event of events) {
        const allowed = kind === "truncated-sse"
          ? event.kind === "observer" && event.message === "SSE closed without done"
          : (event.kind === "console.error" && /Failed to load resource|net::ERR_FAILED/.test(event.message))
            || (event.kind === "requestfailed" && kind === "network-abort" && event.url?.endsWith(endpoint))
            || (event.kind === "response" && kind === "export-500" && event.url?.endsWith(endpoint) && event.message === "HTTP 500");
        assert(allowed, `${kind}: unrelated error during injection: ${JSON.stringify(event)}`);
        event.expectedFault = true;
        expected.add(event);
      }
    }
    await visit(page, `/case/${id}`, "chat");
    await drain();
    assert(audit.errors.length === 0, "Fault page failed before injection");
    const stream = `**/api/py/cases/${id}/messages/stream`;
    for (const kind of ["truncated-sse", "network-abort"]) {
      const draft = "测试恢复：需要收费吗？";
      const mark = audit.errors.length;
      const handler = kind === "truncated-sse"
        ? (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"type":"reply_snapshot","text":"模拟截断，未完成"}\n\n' })
        : (route) => route.abort("failed");
      await page.route(stream, handler);
      const input = page.getByRole("textbox", { name: "输入你的回答" });
      await input.fill(draft);
      await input.press("Enter");
      await page.getByRole("button", { name: "重试", exact: true }).waitFor();
      assert(await input.inputValue() === draft, `${kind}: failed message draft was lost`);
      await page.getByText(/内容已保留在输入框/).waitFor();
      assert(await page.getByRole("button", { name: "发送", exact: true }).isEnabled(), `${kind}: Send remains disabled`);
      item.evidence.push(await shot(page, `${size.name}-fault-${kind}`));
      await drain();
      const expectedEvents = audit.errors.slice(mark);
      acceptExpected(expectedEvents, kind, `/cases/${id}/messages/stream`);
      await page.unroute(stream, handler);
      await mockGate(api);
      const recoveryMark = audit.errors.length;
      await send(page, () => page.getByRole("button", { name: "重试", exact: true }).click());
      assert(await input.inputValue() === "", `${kind}: successful retry did not clear draft`);
      assert(await page.getByRole("button", { name: "重试", exact: true }).count() === 0, `${kind}: retry error remains`);
      assert(audit.errors.length === recoveryMark, `${kind}: recovery produced new errors`);
      const data = await record(api, id);
      assert(data.messages.some((message) => message.role === "user" && message.content === draft), `${kind}: retry not persisted`);
      results.push({ kind, draftRetained: true, retryRecovered: true, expectedEvents });
    }
    await visit(page, `/case/${id}/form-assistant`, "form-assistant");
    const exportURL = `**/api/py/cases/${id}/export/docx`;
    const handler = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "测试注入：导出失败，请重试。" }) });
    const mark = audit.errors.length;
    await page.route(exportURL, handler);
    await page.getByRole("button", { name: "DOCX", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "测试注入：导出失败，请重试。" }).first().waitFor();
    await until(() => page.getByRole("button", { name: "DOCX", exact: true }).isEnabled(), "Export button remains disabled");
    item.evidence.push(await shot(page, `${size.name}-fault-export-500`));
    await drain();
    const expectedEvents = audit.errors.slice(mark);
    acceptExpected(expectedEvents, "export-500", `/cases/${id}/export/docx`);
    await page.unroute(exportURL, handler);
    const recoveryMark = audit.errors.length;
    const recovered = await download(page, "docx", size.name, item);
    await drain();
    assert(audit.errors.length === recoveryMark, "Export recovery produced new errors");
    assert(await page.getByText("测试注入：导出失败，请重试。", { exact: false }).count() === 0, "Export failure remains after retry");
    results.push({ kind: "export-500", recovered, expectedEvents });
    await drain();
    assert(audit.errors.every((event) => expected.has(event)), "Fault page contains errors outside the injected requests");
    await page.close();
    return results;
  });
}

const plans = SIZES.map((size) => ({ size, checks: Object.fromEntries([
  "preflight", "home", "cases", "intake", "chat", "analysis", "action", "form-first", "clipboard",
  "form-last", "downloads", "edit-facts", "stale", "regenerate", "isolation", "golden-errors", "faults",
].map((name) => [name, planned(size.name, name, name === "faults" ? "fault_injection" : "golden")])) }));
const offline = planned("all", "actual-backend-shutdown", "real_offline");
offline.observation = "实际停机单独由 m7-offline.mjs 验证；见 offline-metrics.json。";
const offlinePath = path.join(OUT, "offline-metrics.json");
if (fs.existsSync(offlinePath)) {
  const result = JSON.parse(fs.readFileSync(offlinePath, "utf8"));
  offline.status = result.status;
  offline.evidence = [offlinePath];
  offline.observation = { result, measuredAt: fs.statSync(offlinePath).mtime.toISOString() };
}
const proxyTransport = planned("all", "next-proxy-upstream-binding", "infrastructure");
proxyTransport.observation = "正常UI不拦截响应；通过Next代理创建的案件须可由隔离8100读取。";
const incremental = planned("all", "incremental-stream-timing", "infrastructure");
incremental.observation = "UNVERIFIED: 默认规则模式不测真实模型逐token延迟；正常SSE与截断恢复另有验证。";

try {
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname), "BASE_URL must be loopback; remote services forbidden");
  fs.mkdirSync(OUT, { recursive: true });
  save();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: process.env.QA_HEADFUL !== "1",
  });
  for (const { size, checks } of plans) await golden(size, checks);
  await drain();
  const unexpected = metrics.errors.filter((event) => event.expectedFault !== true);
  assert(unexpected.length === 0, `Unexpected non-injection errors: ${JSON.stringify(unexpected)}`);
  metrics.goldenStatus = "PASS";
  proxyTransport.status = "PASS";
  metrics.faultInjectionStatus = "PASS";
  // Overall remains UNVERIFIED while explicitly unperformed checks remain.
  metrics.status = metrics.checks.every((item) => item.status === "PASS") ? "PASS" : "UNVERIFIED";
} catch (error) {
  fatal = error;
  metrics.status = "UNVERIFIED";
  metrics.errors.push({ mode: activeMode, kind: "fatal", message: error.message, stack: error.stack });
  if (activePage && !activePage.isClosed()) {
    try { metrics.failedScreenshot = await shot(activePage, "failed"); }
    catch (captureError) { metrics.errors.push({ mode: "cleanup", kind: "failed-screenshot", message: captureError.message }); }
  }
} finally {
    // Cleanup is limited to exact case/session pairs created in this run.
    if (process.env.QA_CLEANUP === "1") {
      for (const owned of metrics.cases) {
        try {
          assert(owned.createdBy === metrics.script && owned.session.startsWith(`${RUN}-`), "Refusing cleanup of foreign case");
          const api = await newAPI(owned.session);
          const response = await api.delete(`${BACKEND}/cases/${owned.id}`, { maxRedirects: 0 });
          assert(response.ok(), `Owned case cleanup failed: ${response.status()}`);
          assert((await response.json()).deleted === true, "Delete response not confirmed");
          owned.retained = false;
        } catch (error) {
          metrics.errors.push({ mode: "cleanup", kind: "delete", id: owned.id, message: error.message });
          fatal ||= error;
        }
      }
    }
    for (const context of contexts) {
      try { await context.close(); } catch (error) { metrics.errors.push({ mode: "cleanup", message: error.message }); fatal ||= error; }
    }
    if (browser) {
      try { await browser.close(); } catch (error) { metrics.errors.push({ mode: "cleanup", message: error.message }); fatal ||= error; }
    }
    await drain();
    for (const api of apiContexts) {
      try { await api.dispose(); } catch (error) { metrics.errors.push({ mode: "cleanup", message: error.message }); fatal ||= error; }
    }
    const lateErrors = metrics.errors.filter((event) => event.expectedFault !== true);
    if (lateErrors.length) {
      fatal ||= new Error(`Unexpected errors recorded (including teardown): ${lateErrors.length}`);
      metrics.goldenStatus = "UNVERIFIED";
      for (const { checks, size } of plans) {
        if (audits.some((audit) => audit.size === size.name && audit.mode === "golden" && audit.errors.length)) {
          checks["golden-errors"].status = "UNVERIFIED";
        }
      }
    }
    metrics.finishedAt = new Date().toISOString();
    if (fatal) metrics.status = "UNVERIFIED";
    save();
    fs.writeFileSync(path.join(OUT, `metrics-${RUN}.json`), JSON.stringify(metrics, null, 2));
}
if (fatal) throw fatal;
console.log(JSON.stringify({ metrics: path.join(OUT, "metrics.json"), status: metrics.status, run: RUN }));
