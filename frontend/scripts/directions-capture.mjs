import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("..", "docs", "redesign", "directions");
const out = path.join(root, "screens");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const directions = [
  ["dossier", "01-dossier.html"],
  ["primer", "02-primer.html"],
  ["route", "03-route.html"],
  ["hybrid", "04-hybrid.html"],
];

const sizes = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];
const results = [];

for (const [key, file] of directions) {
  const url = new URL(file, `file:///${root.replaceAll("\\", "/")}/`).href;
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      isMobile: size.mobile,
      hasTouch: size.mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    await page.screenshot({ path: path.join(out, `${key}-${size.name}-workspace.png`) });
    await page.locator("#home").scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      for (const selector of [".app-header", ".mobile-bottom"]) {
        const element = document.querySelector(selector);
        if (element) element.style.visibility = "hidden";
      }
    });
    await page.locator("#home").screenshot({ path: path.join(out, `${key}-${size.name}-home.png`) });
    await page.evaluate(() => {
      for (const selector of [".app-header", ".mobile-bottom"]) {
        const element = document.querySelector(selector);
        if (element) element.style.visibility = "";
      }
    });
    await page.screenshot({ path: path.join(out, `${key}-${size.name}-full.png`), fullPage: true });

    const metrics = await page.evaluate(() => ({
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      viewport: [window.innerWidth, window.innerHeight],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim(),
      homeTitle: document.querySelector("#home .home-title")?.textContent?.trim(),
    }));
    results.push({ direction: key, size: size.name, errors, ...metrics });
    await context.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(out, "metrics.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));