import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const TEMP = process.env.TEMP || "C:/Users/Tutul/AppData/Local/Temp";
const OUT = path.join(TEMP, "wr-shots");
fs.mkdirSync(OUT, { recursive: true });
const SESSION = "visual-check-session-001";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const demoResponse = await fetch("http://127.0.0.1:8000/api/v1/cases/demo", {
  method: "POST",
  headers: { "X-Session-Id": SESSION },
});
const demo = await demoResponse.json();
const caseId = demo.case.id;
console.log("demo case", caseId);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript((sid) => localStorage.setItem("workerrights_session_id", sid), SESSION);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return { context, page };
}

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log("shot", name);
}

const desktop = await newPage({ width: 1440, height: 1000 });
await desktop.page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-home.png", false);
await desktop.page.screenshot({ path: path.join(OUT, "desktop-home-full.png"), fullPage: true });

await desktop.page.goto(`http://127.0.0.1:3000/case/${caseId}`, { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-chat.png", false);

await desktop.page.goto(`http://127.0.0.1:3000/case/${caseId}/analysis`, { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-analysis.png", false);

await desktop.page.goto(`http://127.0.0.1:3000/case/${caseId}/action-plan`, { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-action.png", false);
const markButton = desktop.page.getByRole("button", { name: "标记完成" }).first();
if (await markButton.count()) {
  await markButton.click();
  await desktop.page.waitForTimeout(900);
  const done = await desktop.page.getByRole("button", { name: "已完成" }).count();
  console.log("step toggle done count", done);
  await shot(desktop.page, "desktop-action-checked.png", false);
}

await desktop.page.goto(`http://127.0.0.1:3000/case/${caseId}/form-assistant`, { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-form.png", false);
await desktop.page.getByRole("button", { name: /5 填写欠薪事实/ }).click();
await shot(desktop.page, "desktop-form-step5.png", false);

await desktop.page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
await shot(desktop.page, "desktop-cases.png", false);
await desktop.context.close();

const mobile = await newPage({ width: 390, height: 844 });
await mobile.page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await shot(mobile.page, "mobile-home.png", false);
await mobile.page.goto(`http://127.0.0.1:3000/case/${caseId}`, { waitUntil: "networkidle" });
await shot(mobile.page, "mobile-chat.png", false);
await mobile.page.goto(`http://127.0.0.1:3000/case/${caseId}/analysis`, { waitUntil: "networkidle" });
await shot(mobile.page, "mobile-analysis.png", false);
await mobile.page.goto(`http://127.0.0.1:3000/case/${caseId}/form-assistant`, { waitUntil: "networkidle" });
await shot(mobile.page, "mobile-form.png", false);
await mobile.context.close();

await browser.close();
console.log("console errors:", errors.length ? errors : "none");
console.log("screenshots:", OUT);
