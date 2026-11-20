import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "m1");
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
  const session = `m1-${size.name}-${Date.now()}`;
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
  await page.getByRole("button", { name: "演示案件" }).first().click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
  await page.waitForTimeout(500);
  const base = page.url();
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat.png`) });
  results.push(await measure(page, size.name, "chat"));

  await page.getByRole("button", { name: "修改案件信息" }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${size.name}-facts-modal.png`), fullPage: true });
  results.push(await measure(page, size.name, "facts-modal"));
  await page.getByRole("button", { name: "取消" }).first().click();
  await page.getByRole("dialog").waitFor({ state: "detached" });

  for (const [segment, label] of [
    ["/analysis", "analysis"],
    ["/action-plan", "action"],
    ["/form-assistant", "form"],
  ]) {
    await page.goto(base + segment, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${size.name}-${label}.png`), fullPage: true });
    results.push(await measure(page, size.name, label));
  }

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
      const fixed = [...document.querySelectorAll("header,nav")]
        .filter((element) => getComputedStyle(element).position === "fixed" || getComputedStyle(element).position === "sticky")
        .length;
      return {
        size,
        surface,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        fixedOrSticky: fixed,
      };
    },
    { size, surface },
  );
}