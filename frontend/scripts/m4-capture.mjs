import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "m4");
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
  const session = `m4-${size.name}-${Date.now()}`;
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

  await page.goto("http://127.0.0.1:3000/cases", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "先看演示案件" }).first().click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  const base = page.url();
  await page.goto(`${base}/analysis`, { waitUntil: "networkidle" });
  await page.locator("main").getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(OUT, `${size.name}-analysis.png`), fullPage: true });
  if (size.name === "mobile") {
    await page.screenshot({ path: path.join(OUT, "mobile-analysis-top.png") });
  }
  results.push(await measure(page, size.name, "analysis"));

  if (size.name === "desktop") {
    await page.locator("#legal details").first().locator("summary").click();
    await page.locator("#legal details").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, "desktop-analysis-legal-open.png") });
    results.push(await measure(page, size.name, "legal-open"));

    await page.getByRole("button", { name: /展开全部/ }).click();
    await page.waitForTimeout(250);
    results.push(await measure(page, size.name, "legal-expanded"));
  } else {
    await page.locator("#legal details").first().locator("summary").click();
    await page.locator("#legal details").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, "mobile-analysis-legal-open.png") });
    results.push(await measure(page, size.name, "legal-open"));

    await page.locator("#channels").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, "mobile-analysis-channels.png") });
    results.push(await measure(page, size.name, "channels"));
  }

  results.push({ size: size.name, caseUrl: base, errors });

  const newCaseId = await page.evaluate(async () => {
    const response = await fetch("/api/py/cases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": localStorage.getItem("workerrights_session_id"),
      },
      body: JSON.stringify({ scene: "construction_wage_arrears" }),
    });
    const data = await response.json();
    return data.case.id;
  });
  await page.goto(`http://127.0.0.1:3000/case/${newCaseId}/analysis`, { waitUntil: "networkidle" });
  await page.getByText("这份分析基于尚未确认的档案").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${size.name}-analysis-preliminary.png`), fullPage: true });
  results.push(await measure(page, size.name, "preliminary"));

  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

async function measure(page, size, surface) {
  return page.evaluate(
    ({ size, surface }) => {
      const root = document.documentElement;
      const isVisible = (element) => element.getClientRects().length > 0;
      const buttons = [...document.querySelectorAll("button")].filter(isVisible);
      const heights = buttons.map((button) => Math.round(button.getBoundingClientRect().height));
      const conclusionItems = [...document.querySelectorAll("#conclusions li")];
      const thirdBottom =
        conclusionItems[2]?.getBoundingClientRect().bottom + window.scrollY || null;
      return {
        size,
        surface,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        h1: document.querySelector("main h1")?.textContent?.trim(),
        progressLabels: [...document.querySelectorAll("p")]
          .filter(isVisible)
          .map((element) => element.textContent?.trim())
          .filter((text) => text === "信息完整度" || text === "办理进度"),
        conclusionCount: conclusionItems.length,
        thirdConclusionBottom: thirdBottom === null ? null : Math.round(thirdBottom),
        conclusionsWithinTwoScreens: thirdBottom === null ? null : thirdBottom <= window.innerHeight * 2,
        hasBasicInfoTable: document.body.innerText.includes("基本情况"),
        preliminaryAlert: document.body.innerText.includes("尚未确认的档案"),
        legalEntries: document.querySelectorAll("#legal details").length,
        legalOpen: document.querySelectorAll("#legal details[open]").length,
        nextStepLinks: [...document.querySelectorAll("a")]
          .filter(isVisible)
          .map((link) => link.textContent?.trim() || "")
          .filter((text) => text.includes("行动步骤")).length,
        minButtonHeight: heights.length ? Math.min(...heights) : null,
        sub44Buttons: buttons
          .filter((button) => button.getBoundingClientRect().height < 44)
          .map((button) => (button.textContent || button.getAttribute("aria-label") || "").trim())
          .filter(Boolean),
      };
    },
    { size, surface },
  );
}
