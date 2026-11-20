import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "evidence");
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
  const session = `audit-${size.name}-${Date.now()}`;
  await context.addInitScript((value) => localStorage.setItem("workerrights_session_id", value), session);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${size.name}-home.png`), fullPage: true });
  results.push(await measure(page, size.name, "home"));

  await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `${size.name}-cases-empty.png`), fullPage: true });
  await page.getByRole("button", { name: "演示案件" }).first().click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  await page.getByRole("textbox", { name: "输入你的回答" }).waitFor({ timeout: 10000 }).catch(async (error) => {
    await page.screenshot({ path: path.join(OUT, `${size.name}-chat-error.png`), fullPage: true });
    throw new Error(`${error.message}\nURL: ${page.url()}\nBODY: ${(await page.locator("body").innerText()).slice(0, 2000)}`);
  });

  const base = page.url();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat.png`) });
  results.push(await measure(page, size.name, "chat"));

  for (const [segment, label] of [
    ["/analysis", "analysis"],
    ["/action-plan", "action"],
    ["/form-assistant", "form"],
  ]) {
    await page.goto(base + segment, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${size.name}-${label}.png`), fullPage: true });
    results.push(await measure(page, size.name, label));
  }

  results.push({ size: size.name, consoleErrors });
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "layout-metrics.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

async function measure(page, size, surface) {
  return page.evaluate(
    ({ size, surface }) => {
      const root = document.documentElement;
      const body = document.body;
      const overflow = root.scrollWidth - root.clientWidth;
      const smallText = [...document.querySelectorAll("p,span,a,button,dd,dt,li")]
        .filter((element) => {
          const text = element.textContent?.trim();
          const pixels = Number.parseFloat(getComputedStyle(element).fontSize);
          return text && pixels > 0 && pixels < 12;
        })
        .length;
      const fixed = [...document.querySelectorAll("header,nav")]
        .filter((element) => getComputedStyle(element).position === "fixed" || getComputedStyle(element).position === "sticky")
        .length;
      return {
        size,
        surface,
        title: document.title,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: overflow,
        bodyTextChars: (body.innerText || "").length,
        mainHeadings: [...document.querySelectorAll("h1,h2")].map((element) => element.textContent?.trim()).filter(Boolean).slice(0, 12),
        smallText,
        fixedOrSticky: fixed,
      };
    },
    { size, surface },
  );
}