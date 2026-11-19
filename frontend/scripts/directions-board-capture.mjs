import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const board = path.resolve("..", "docs", "redesign", "directions", "index.html");
const outDir = path.resolve("..", "docs", "redesign", "directions", "screens");
const url = new URL(`file:///${board.replaceAll("\\", "/")}`).href;
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, isMobile: name === "mobile", hasTouch: name === "mobile" });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `comparison-board-${name}.png`), fullPage: true });
  results.push(await page.evaluate((name) => ({
    name,
    viewport: [innerWidth, innerHeight],
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    imagesComplete: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  }), name));
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, "board-metrics.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));