import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "m2");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const results = [];

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: size.name === "mobile",
    hasTouch: size.name === "mobile",
  });
  const session = `m2-${size.name}-${Date.now()}`;
  await context.addInitScript((value) => localStorage.setItem("workerrights_session_id", value), session);
  await context.addInitScript(() => {
    const hideDevTools = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head?.appendChild(style);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hideDevTools);
    else hideDevTools();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${size.name}-home.png`), fullPage: true });
  results.push(await measure(page, size.name, "home"));

  await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${size.name}-cases-empty.png`), fullPage: true });
  results.push(await measure(page, size.name, "cases-empty"));

  await page.getByRole("button", { name: "演示案件" }).first().click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
  await page.waitForTimeout(500);
  const base = page.url();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${size.name}-case-shell.png`) });
  results.push(await measure(page, size.name, "case-shell"));

  await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${size.name}-cases-list.png`), fullPage: true });
  results.push(await measure(page, size.name, "cases-list"));

  await page.goto(`${base}/analysis`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${size.name}-analysis-shell.png`) });
  results.push(await measure(page, size.name, "analysis-shell"));

  results.push({ size: size.name, errors });
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

async function measure(page, size, surface) {
  return page.evaluate(
    ({ size, surface }) => {
      const root = document.documentElement;
      const progressLabels = [...document.querySelectorAll("p")]
        .map((element) => element.textContent?.trim())
        .filter((text) => text === "信息完整度" || text === "办理进度");
      const navLabels = [...document.querySelectorAll("nav a")].map((element) => element.textContent?.trim()).filter(Boolean);
      return {
        size,
        surface,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        progressLabels,
        navLabels,
        h1: document.querySelector("h1")?.textContent?.trim(),
      };
    },
    { size, surface },
  );
}