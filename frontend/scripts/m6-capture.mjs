import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, request } from "playwright-core";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ORIGIN = new URL(BASE_URL).origin;
const OUT = fileURLToPath(new URL("../../docs/redesign/m6/", import.meta.url));
const RUN = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
const RUN_OUT = path.join(OUT, RUN);
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sizes = [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }];
const report = { run: RUN, baseUrl: BASE_URL, startedAt: new Date().toISOString(), status: "running", scenarios: [], errors: [] };
let browser;
let failure;
await fs.mkdir(RUN_OUT, { recursive: true });

try {
  // Check the actual proxied backend before opening a case or triggering any generation.
  const preflight = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "X-Session-Id": `m6-preflight-${randomUUID()}` } });
  try {
    const response = await preflight.get("/api/py/meta");
    assert(response.ok(), `meta failed: ${response.status()} ${await response.text()}`);
    const meta = await response.json();
    report.provider = meta.provider;
    assert.equal(meta.provider.is_mock, true, "Refusing capture: provider.is_mock must be true. No cases were created.");
  } finally {
    await preflight.dispose();
  }
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  for (const size of sizes) await captureSize(size);
  report.status = "passed";
} catch (error) {
  failure = error;
  report.status = "failed";
  report.errors.push(error.stack || String(error));
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) {
      report.errors.push(`Browser cleanup: ${error.stack || error}`);
      failure ||= error;
      report.status = "failed";
    }
  }
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(RUN_OUT, "metrics.json"), JSON.stringify(report, null, 2));
  console.log(`M6 ${report.status}: ${path.join(RUN_OUT, "metrics.json")}`);
}
if (failure) throw failure;

async function captureSize(size) {
  const session = `m6-${size.name}-${randomUUID()}`;
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: size.name === "mobile",
    hasTouch: size.name === "mobile",
    acceptDownloads: true,
    extraHTTPHeaders: { "X-Session-Id": session },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await context.addInitScript((value) => localStorage.setItem("workerrights_session_id", value), session);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const owned = new Set();
  const result = { size: size.name, session, cases: [], measurements: [], clipboard: [], downloads: [], errors: [], navigationCancellations: [], cleanup: [] };
  report.scenarios.push(result);
  page.on("pageerror", (error) => result.errors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") result.errors.push({ type: "console", message: message.text() }); });
  page.on("response", (response) => {
    if (response.status() >= 400) result.errors.push({ type: "http", status: response.status(), url: response.url() });
  });
  page.on("requestfailed", (req) => {
    const event = { type: "network", url: req.url(), message: req.failure()?.errorText };
    if (new URL(req.url()).pathname === "/icon.svg" && event.message === "net::ERR_ABORTED") result.navigationCancellations.push(event);
    else result.errors.push(event);
  });

  const api = async (endpoint, method = "GET", data) => {
    const response = await context.request.fetch(`/api/py${endpoint}`, { method, data });
    assert(response.ok(), `${method} ${endpoint}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const remember = (record, kind) => {
    owned.add(record.id);
    result.cases.push({ id: record.id, kind });
    return record.id;
  };

  try {
    const meta = await api("/meta");
    assert.equal(meta.provider.is_mock, true, "Session provider must also be mock");
    await page.goto("/cases", { waitUntil: "networkidle" });
    const [response] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/py/cases/demo" && response.request().method() === "POST"),
      page.getByRole("button", { name: "先看演示案件", exact: true }).first().click(),
    ]);
    assert(response.ok(), `Demo creation failed: ${response.status()}`);
    const demo = remember((await response.json()).case, "demo-via-cases-ui");
    await page.waitForURL(`**/case/${demo}`);
    await page.waitForLoadState("networkidle");
    const data = await openForm(page, demo);
    assert.equal(data.preliminary, false, "Demo is the confirmed baseline");
    await inspectCase(page, data, size, "demo", result);

    await copyAndCompare(page, page.getByRole("button", { name: "复制全部字段", exact: true }), data.copy_summary, "demo-all-fields", result);
    await page.getByText("展开陈述全文", { exact: true }).click();
    assert.equal(await page.locator("[data-formal-statement]").textContent(), data.formal_statement);
    await copyAndCompare(page, page.getByRole("button", { name: "复制陈述", exact: true }), data.formal_statement, "demo-statement", result);
    for (const format of ["docx", "pdf"]) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: format.toUpperCase(), exact: true }).click(),
      ]);
      assert.equal(await download.failure(), null, `${format} download failed`);
      const stream = await download.createReadStream();
      assert(stream, `No ${format} download stream`);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const signature = format === "docx" ? Buffer.from([0x50, 0x4b, 0x03, 0x04]) : Buffer.from("%PDF-");
      result.downloads.push({ format, bytes: bytes.length, signatureHex: bytes.subarray(0, signature.length).toString("hex"), filename: download.suggestedFilename() });
      assert(bytes.length > signature.length, `${format} is empty`);
      assert(bytes.subarray(0, signature.length).equals(signature), `Invalid ${format} header`);
    }

    const refreshed = await openForm(page, demo, true);
    assert.equal(refreshed.copy_summary, data.copy_summary, "Reference changed after refresh");
    assert.equal(refreshed.formal_statement, data.formal_statement, "Statement changed after refresh");
    assert.deepEqual(refreshed.steps, data.steps, "Fields changed after refresh");
    await assertStep(page, refreshed, 0, false);
    await record(page, result, "demo-after-refresh");
    await screenshot(page, `${size.name}-after-refresh`);
    await selectStep(page, refreshed, refreshed.steps.length - 1, size);
    await page.locator("[data-primary-action]").click();
    await page.waitForURL(`**/case/${demo}/action-plan`);
    await page.waitForLoadState("networkidle");
    await page.locator("main h1").waitFor();
    result.returnToActionPlan = true;

    // Independent fixtures; never patch the demo or enumerate/delete other sessions' cases.
    const empty = remember((await api("/cases", "POST", { scene: "construction_wage_arrears" })).case, "empty");
    const emptyData = await openForm(page, empty);
    assert.equal(emptyData.preliminary, true);
    assert(emptyData.steps.flatMap((step) => step.fields).some((field) => field.status === "missing"));
    await inspectCase(page, emptyData, size, "empty", result);

    const synthetic = remember((await api("/cases", "POST", { scene: "construction_wage_arrears" })).case, "verify-duration-privacy");
    const duration = "三个多月";
    await api(`/cases/${synthetic}/facts`, "PATCH", { facts: {
      location_city: "郑州市", location_district: null,
      project_name: "M6独立合成项目（虚构）", work_type: "钢筋工",
      owed_amount: 20000, owed_amount_approx: true,
      work_start: null, work_end: null, duration_text: duration,
    } });
    const syntheticData = await openForm(page, synthetic);
    assert.equal(syntheticData.preliminary, true);
    const syntheticFields = syntheticData.steps.flatMap((step) => step.fields);
    assert.equal(syntheticFields.find((field) => field.key === "owed_amount")?.status, "verify");
    const period = syntheticFields.find((field) => field.key === "work_period");
    assert(period, "Missing work_period field");
    assert.equal(period.label, "工作时长");
    assert.equal(period.value, duration, "Duration-only must not invent dates");
    assert.equal(period.status, "verify");
    await inspectCase(page, syntheticData, size, "verify-duration-privacy", result);
    await copyAndCompare(page, page.getByRole("button", { name: "复制全部字段", exact: true }), syntheticData.copy_summary, "synthetic-all-fields", result);
    await copyAndCompare(page, page.getByRole("button", { name: "复制陈述", exact: true }), syntheticData.formal_statement, "synthetic-statement", result);
    if (result.navigationCancellations.length) {
      const icon = await context.request.get("/icon.svg");
      assert(icon.ok() && (await icon.text()).includes("<svg"), "Cancelled favicon must remain available as valid SVG");
      result.faviconRecheck = { status: icon.status(), validSVG: true };
    }
    assert.deepEqual(result.errors, [], "Browser, console or network errors occurred");
  } catch (error) {
    result.failure = error.stack || String(error);
    // Preserve measurements and a visible failure screenshot before propagating the assertion.
    try { result.measurements.push(await measure(page, "failure")); } catch (measurementError) { result.errors.push({ type: "measurement", message: String(measurementError) }); }
    try { await screenshot(page, `${size.name}-failure`); } catch (screenshotError) { result.errors.push({ type: "screenshot", message: String(screenshotError) }); }
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const id of owned) {
      try {
        const deleted = await api(`/cases/${id}`, "DELETE");
        assert.equal(deleted.deleted, true);
        result.cleanup.push({ id, deleted: true });
      } catch (error) {
        cleanupErrors.push(error);
        result.cleanup.push({ id, deleted: false, error: String(error) });
      }
    }
    await context.close();
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "M6 case cleanup failed; inspect metrics for owned case IDs");
  }
}

async function openForm(page, id, reload = false) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === `/api/py/cases/${id}/form-assistant` && response.request().method() === "GET"),
    reload ? page.reload({ waitUntil: "networkidle" }) : page.goto(`/case/${id}/form-assistant`, { waitUntil: "networkidle" }),
  ]);
  assert(response.ok(), `Form API failed: ${response.status()}`);
  const data = await response.json();
  await page.locator("[data-form-assistant]").waitFor();
  await page.locator("#form-step-heading").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return data;
}

async function inspectCase(page, data, size, kind, result) {
  const fields = data.steps.flatMap((step) => step.fields);
  assert(data.steps.length > 0, "No steps supplied by API");
  assert.equal(data.progress.total, fields.length, "Field totals must come from schema");
  assert.equal(await page.locator("main h1").textContent(), "填报参考");
  const introduction = page.locator("[data-form-assistant] > header > p");
  assert.equal(await introduction.nth(0).textContent(), "本人去官方平台填写，本产品不登录、不代填、不自动提交。");
  assert.equal(await introduction.nth(1).textContent(), "参考常见填报顺序整理，具体以官方页面为准");
  assert.equal(data.platform.verification_status, "pending", "An unverified institutional homepage must not become verified");
  assert.equal(await page.locator("[data-verification-status]").getAttribute("data-verification-status"), "pending");
  const entry = page.locator("[data-official-entry]");
  assert.equal(await entry.getByRole("link", { name: "去官方平台（本人提交）", exact: true }).getAttribute("href"), data.platform.official_url);
  const entryText = await entry.textContent();
  for (const text of [data.platform.access_note, data.platform.source_note, "当前链接为人社部机构首页，不是核验过的直接办理页。"]) assert(entryText.includes(text));
  assert(await page.locator("[data-privacy-notice]").isVisible(), "Privacy must not be desktop-only or collapsed");
  assert((await page.locator("[data-privacy-notice]").textContent()).includes(data.privacy_notice));
  assert((await page.locator("[data-privacy-notice]").textContent()).includes("上传由本人操作，产品不保存截图或证件照片"));
  if (data.preliminary) assert(await page.getByText("案件信息尚未确认", { exact: true }).isVisible());
  assert.equal(await page.getByText("展开陈述全文", { exact: true }).locator("..").getAttribute("open"), null, "Statement should initially be collapsed");
  if (size.name === "mobile") {
    assert.equal(await page.locator("#form-step-select option").count(), data.steps.length);
    assert((await page.locator("#form-step-select").boundingBox()).height >= 44);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await record(page, result, `${kind}-first`);
  await screenshot(page, `${size.name}-${kind}-first`);

  const visited = [];
  let missingCaptured = false;
  for (let index = 0; index < data.steps.length; index++) {
    if (index) await page.getByRole("button", { name: "下一步", exact: true }).click();
    await assertStep(page, data, index, index > 0);
    visited.push(data.steps[index].id);
    const stepFields = data.steps[index].fields;
    if (kind === "empty" && !missingCaptured && stepFields.some((field) => field.status === "missing")) {
      await screenshot(page, `${size.name}-empty-missing-fields`);
      missingCaptured = true;
    }
    if (kind === "verify-duration-privacy" && stepFields.some((field) => field.status === "official_only" || field.key === "work_period")) {
      await screenshot(page, `${size.name}-${kind}-step-${index + 1}`);
    }
    for (const field of data.steps[index].fields) {
      const card = page.locator(`[data-field-key="${field.key}"]`);
      assert.equal(await card.getAttribute("data-field-status"), field.status);
      assert((await card.textContent()).includes(field.label));
      assert((await card.textContent()).includes("来源事实："));
      if (field.status === "official_only") {
        assert.equal(await card.locator("[data-field-value]").count(), 0);
        assert.equal(await card.getByRole("button").count(), 0);
        assert((await card.textContent()).includes("由本人在官方平台填写，本产品不收集此字段。"));
      } else if (field.value) {
        assert.equal(await card.locator("[data-field-value]").textContent(), field.value);
        await copyAndCompare(page, card.getByRole("button", { name: "复制此字段", exact: true }), field.value, `${kind}-${field.key}`, result);
      } else {
        assert((await card.textContent()).includes("补充后生成参考内容"));
        assert.equal(await card.getByRole("button").count(), 0);
      }
    }
    await page.locator("[data-primary-action]").evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await record(page, result, `${kind}-step-${index + 1}-actions`, true);
  }
  assert.equal(new Set(visited).size, data.steps.length);
  result.measurements.push({ surface: `${kind}-reachability`, visited, stepCount: data.steps.length, fieldCount: fields.length });
  for (const key of ["reporter_name", "reporter_phone", "reporter_id"]) {
    const field = fields.find((item) => item.key === key);
    assert(field, `Missing privacy field: ${key}`);
    assert.equal(field.status, "official_only");
    assert.equal(field.value, null, `${key} must not contain a user value`);
    assert(field.copy_text.includes("本产品不收集"));
    assert(data.copy_summary.includes(`${field.label}：${field.copy_text}`));
  }
  assert(await page.getByRole("heading", { name: "提交前最后核对", exact: true }).isVisible());
  await page.locator("#form-step-heading").evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await screenshot(page, `${size.name}-${kind}-last`);
  await record(page, result, `${kind}-last`);
  if (data.steps.length > 1) {
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await assertStep(page, data, data.steps.length - 2, true);
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await assertStep(page, data, data.steps.length - 1, true);
  }
  // Exercise arbitrary selection, not only the sequential next/previous buttons.
  for (let index = data.steps.length - 2; index >= 0; index--) await selectStep(page, data, index, size);
  await selectStep(page, data, data.steps.length - 1, size);
  const evidence = page.locator("[data-evidence-directory]");
  await evidence.scrollIntoViewIfNeeded();
  await record(page, result, `${kind}-evidence`);
  await screenshot(page, `${size.name}-${kind}-evidence`);
}

async function selectStep(page, data, index, size) {
  const previous = Number(await page.locator("[data-current-step]").getAttribute("data-current-step")) - 1;
  if (size.name === "mobile") await page.locator("#form-step-select").selectOption(String(index));
  else await page.locator(`[data-step-index="${index}"]`).click();
  await assertStep(page, data, index, previous !== index);
}

async function assertStep(page, data, index, focused) {
  await page.waitForFunction(({ current, title }) => {
    const section = document.querySelector("[data-current-step]");
    return Number(section?.getAttribute("data-current-step")) === current && document.querySelector("#form-step-heading")?.textContent === title;
  }, { current: index + 1, title: data.steps[index].title });
  assert.equal(await page.locator("[data-step-count]").getAttribute("data-step-count"), String(data.steps.length));
  assert.equal((await page.locator("[data-step-progress]").textContent()).trim(), `第 ${index + 1} 步 / 共 ${data.steps.length} 步`);
  if (focused) {
    await page.waitForFunction(() => document.activeElement?.id === "form-step-heading");
    const position = await page.evaluate(() => ({
      top: document.querySelector("#form-step-heading").getBoundingClientRect().top,
      headerBottom: Math.max(0, ...[...document.querySelectorAll("header")].filter((item) => getComputedStyle(item).position === "sticky").map((item) => item.getBoundingClientRect().bottom)),
    }));
    assert(position.top >= position.headerBottom, `Step heading hidden under sticky header: ${JSON.stringify(position)}`);
  }
}

async function copyAndCompare(page, button, text, label, result) {
  // Sentinel prevents a previous successful copy from passing a broken button.
  await page.evaluate((value) => navigator.clipboard.writeText(value), `m6-sentinel-${randomUUID()}`);
  await button.click();
  await page.waitForFunction(async (expected) => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n"), text);
  const actual = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(actual.replace(/\r\n/g, "\n"), text.replace(/\r\n/g, "\n"), `${label} clipboard mismatch`);
  result.clipboard.push({ label, matched: true, normalizedWindowsNewlines: true, characters: actual.length });
}

async function screenshot(page, name) {
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.screenshot({ path: path.join(RUN_OUT, `${name}-viewport.png`) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(RUN_OUT, `${name}.png`), fullPage: true });
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
}

async function record(page, result, surface, checkAction = false) {
  const metrics = await measure(page, surface);
  result.measurements.push(metrics); // Persist evidence even when an assertion below fails.
  assert.equal(metrics.horizontalOverflow, 0, `${surface}: page overflows horizontally`);
  assert.deepEqual(metrics.sub44Controls, [], `${surface}: main contains targets shorter than 44px`);
  assert.deepEqual(metrics.evidenceOverflow, [], `${surface}: evidence cards overflow`);
  if (checkAction) {
    assert(metrics.primaryAction?.fullyVisible, `${surface}: primary action is not fully visible after scrolling`);
    assert.equal(metrics.primaryAction?.coveredByBottomTab, false, `${surface}: bottom tab covers primary action`);
  }
}

async function measure(page, surface) {
  return page.evaluate((surface) => {
    const root = document.documentElement;
    const visible = (element) => element.checkVisibility();
    const controls = [...document.querySelectorAll("main button, main select, main summary, main a")].filter(visible);
    const heights = controls.map((element) => element.getBoundingClientRect().height);
    const bottomNav = [...document.querySelectorAll('nav[aria-label="案件工作台导航"]')].find((element) => visible(element) && getComputedStyle(element).position === "fixed");
    const bottomTop = bottomNav?.getBoundingClientRect().top ?? window.innerHeight;
    const stickyBottom = Math.max(0, ...[...document.querySelectorAll("header")].filter((element) => getComputedStyle(element).position === "sticky").map((element) => element.getBoundingClientRect().bottom));
    const action = document.querySelector("[data-primary-action]");
    const rect = action?.getBoundingClientRect();
    const section = document.querySelector("[data-current-step]");
    return {
      surface, viewport: [window.innerWidth, window.innerHeight], scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight,
      scrollY: window.scrollY, horizontalOverflow: root.scrollWidth - root.clientWidth,
      currentStep: Number(section?.getAttribute("data-current-step")), stepCount: Number(section?.getAttribute("data-step-count")),
      stepTitle: document.querySelector("#form-step-heading")?.textContent, focusedId: document.activeElement?.id,
      minMainButtonHeight: controls.some((element) => element.tagName === "BUTTON") ? Math.min(...controls.filter((element) => element.tagName === "BUTTON").map((element) => element.getBoundingClientRect().height)) : null,
      minMainControlHeight: heights.length ? Math.min(...heights) : null,
      sub44Controls: controls.filter((element) => element.getBoundingClientRect().height < 44).map((element) => ({ label: element.textContent?.trim(), tag: element.tagName, height: element.getBoundingClientRect().height })),
      evidenceCardCount: document.querySelectorAll("[data-evidence-card]").length,
      evidenceOverflow: [...document.querySelectorAll("[data-evidence-directory], [data-evidence-card]")].filter((element) => element.scrollWidth > element.clientWidth || element.getBoundingClientRect().right > root.clientWidth).map((element) => ({ text: element.textContent?.slice(0, 60), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })),
      privacyVisible: document.querySelector("[data-privacy-notice]")?.checkVisibility(),
      stickyHeaderBottom: stickyBottom, bottomTabTop: bottomTop,
      primaryAction: rect ? { label: action.textContent, top: rect.top, bottom: rect.bottom, height: rect.height,
        fullyVisible: rect.top >= stickyBottom && rect.bottom <= window.innerHeight,
        coveredByBottomTab: Boolean(bottomNav) && rect.bottom > bottomTop && rect.top < window.innerHeight,
      } : null,
    };
  }, surface);
}
