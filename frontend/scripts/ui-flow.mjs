import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const TEMP = process.env.TEMP || "C:/Users/Tutul/AppData/Local/Temp";
const OUT = path.join(TEMP, "wr-shots");
fs.mkdirSync(OUT, { recursive: true });
const SESSION = `ui-flow-${Date.now()}`;
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  acceptDownloads: true,
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript((sid) => localStorage.setItem("workerrights_session_id", sid), SESSION);
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(err.message));

const log = (...args) => console.log(...args);
const shot = (name, full = false) => page.screenshot({ path: path.join(OUT, name), fullPage: full });
const assistantBubbles = () => page.locator(".rounded-tl-sm");

// 1. Fresh case: free-text conversation works regardless of provider.
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "说说我的情况" }).first().click();
await page.waitForURL(/\/case\/[0-9a-f-]+$/);
const freshCaseUrl = page.url();
await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
const before = await assistantBubbles().count();
const textarea = page.getByRole("textbox", { name: "输入你的回答" });
await textarea.fill("我在郑州金水区一个工地干了三个月，钢筋工，包工头还欠我两万元。");
await textarea.press("Enter");
await page.waitForFunction(
  (n) => document.querySelectorAll(".rounded-tl-sm").length >= n && !document.querySelector(".animate-pulse-dot"),
  before + 1,
  { timeout: 60000 },
);
log("chat reply rendered, bubbles:", await assistantBubbles().count());
await page.waitForTimeout(400);
await shot("flow-01-chat.png");

// 2. Open the confirmed demo case for the full workbench.
await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "演示案件" }).first().click();
await page.waitForURL(/\/case\/[0-9a-f-]+$/);
const demoUrl = page.url();
const demoId = demoUrl.split("/case/")[1];
await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
log("demo case", demoId);

// 3. Facts panel + legal modal + facts editor.
await page.locator("aside").getByText("2万元").first().waitFor();
await page.getByRole("button", { name: "查看法律依据" }).first().click();
await page.getByRole("heading", { name: "相关法律依据" }).waitFor({ timeout: 15000 });
await page.getByText("附来源与核验状态").waitFor();
await page.waitForTimeout(300);
await shot("flow-02-legal-modal.png");
await page.getByRole("button", { name: "关闭" }).click();
await page.getByRole("button", { name: "修改案件信息" }).first().click();
await page.getByRole("dialog").waitFor();
const owedInput = page.locator("label").filter({ hasText: "拖欠金额（元）" }).locator("input");
await owedInput.fill("19000");
await page.getByRole("button", { name: "保存修改" }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
await page.locator("aside").getByText("1.9万元").first().waitFor({ timeout: 15000 });
log("facts editor saved and panel updated");
await shot("flow-03-after-edit.png");

// 4. Analysis + exports.
await page.goto(`${demoUrl}/analysis`, { waitUntil: "networkidle" });
await page.getByText("信息完整度").waitFor({ timeout: 15000 });
const analysisText = await page.locator("body").innerText();
log("analysis has law:", analysisText.includes("保障农民工工资支付条例"));
await shot("flow-04-analysis.png", true);
const [docx] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "DOCX" }).click(),
]);
fs.writeFileSync(path.join(OUT, "export.docx"), await docx.path());
log("docx download", docx.suggestedFilename());
const [pdf] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "PDF" }).click(),
]);
fs.writeFileSync(path.join(OUT, "export.pdf"), await pdf.path());
log("pdf download", pdf.suggestedFilename());

// 5. Action plan: toggle persists across reload.
await page.goto(`${demoUrl}/action-plan`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "行动指南", exact: true }).waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "标记完成" }).first().click();
await page.getByRole("button", { name: "已完成" }).first().waitFor({ timeout: 15000 });
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "已完成" }).first().waitFor({ timeout: 15000 });
log("action step persisted across reload");
await shot("flow-05-action.png", true);

// 6. Form assistant: step navigation + copy.
await page.goto(`${demoUrl}/form-assistant`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "官方填报辅助" }).waitFor({ timeout: 15000 });
await page.getByRole("button", { name: /填写欠薪事实/ }).first().click();
await page.getByText("来自：").first().waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "复制此字段" }).first().click();
await page.getByRole("button", { name: "已复制" }).first().waitFor({ timeout: 5000 });
log("form step navigation + copy ok");
await shot("flow-06-form.png", true);

// 7. Mobile pass on the demo case + home.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
await mobile.addInitScript((sid) => localStorage.setItem("workerrights_session_id", sid), SESSION);
const mpage = await mobile.newPage();
mpage.on("console", (msg) => {
  if (msg.type() === "error") errors.push("mobile: " + msg.text());
});
mpage.on("pageerror", (err) => errors.push("mobile: " + err.message));
const overflow = async (label) => {
  const bad = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  log(`mobile horizontal overflow ${label}:`, bad);
};
for (const [route, name] of [
  ["/", "mobile-home"],
  [`/case/${demoId}`, "mobile-chat"],
  [`/case/${demoId}/analysis`, "mobile-analysis"],
  [`/case/${demoId}/action-plan`, "mobile-action"],
  [`/case/${demoId}/form-assistant`, "mobile-form"],
]) {
  await mpage.goto(`http://127.0.0.1:3000${route}`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(600);
  await overflow(name);
  await mpage.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}
// mobile bottom nav + info modal
await mpage.goto(`http://127.0.0.1:3000/case/${demoId}`, { waitUntil: "networkidle" });
await mpage.getByRole("button", { name: "案件信息" }).first().click();
await mpage.getByRole("dialog").waitFor();
await mpage.waitForTimeout(350);
await mpage.screenshot({ path: path.join(OUT, "mobile-info-modal.png") });
await mpage.getByRole("button", { name: "关闭" }).click();
await mpage.getByRole("navigation", { name: "案件工作台导航" }).last().getByRole("link", { name: "行动指南" }).click();
await mpage.waitForURL(/action-plan/);
log("mobile bottom nav works");
await mobile.close();

// 8. Delete a case from the list.
await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
const rowsBefore = await page.locator("main ul > li").count();
await page.getByRole("button", { name: /删除案件/ }).first().click();
await page.getByRole("dialog").waitFor();
await page.getByRole("button", { name: "确认删除" }).click();
await page.waitForTimeout(800);
const rowsAfter = await page.locator("main ul > li").count();
log("case deleted, rows:", rowsBefore, "->", rowsAfter);
await shot("flow-07-cases.png", true);

log("console errors:", errors.length ? errors : "none");
await browser.close();