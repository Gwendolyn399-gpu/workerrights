import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "m5");
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
  const session = `m5-${size.name}-${Date.now()}`;
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
  await page.goto(`${base}/action-plan`, { waitUntil: "networkidle" });
  await page.locator("main").getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(OUT, `${size.name}-action-initial.png`), fullPage: true });
  if (size.name === "mobile") {
    await page.screenshot({ path: path.join(OUT, "mobile-action-first-screen.png") });
  }
  results.push(await measure(page, size.name, "initial"));

  // Complete the current step, then verify header sync and persistence.
  const firstComplete = page.getByRole("button", { name: "标记完成" }).first();
  await firstComplete.scrollIntoViewIfNeeded();
  await firstComplete.click();
  await page.getByText("办理进度 1/8 步").first().waitFor();
  await page.waitForTimeout(400);
  results.push(await measure(page, size.name, "after-done"));
  if (size.name === "mobile") {
    await page.screenshot({ path: path.join(OUT, "mobile-action-after-done.png") });
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("main").getByRole("heading", { level: 1 }).waitFor();
  await page.getByText("办理进度 1/8 步").first().waitFor();
  await page.waitForTimeout(500);
  results.push(await measure(page, size.name, "after-reload"));
  await page.screenshot({ path: path.join(OUT, `${size.name}-action-after-reload.png`), fullPage: true });

  // Expand the later stage and the first channel step to inspect deadline/risk placement.
  await page.locator("#stage-later > button").click();
  const supervision = page.locator('#stage-later li[data-step-key="labor-supervision"]');
  await supervision.getByRole("button", { name: "看这一步怎么做" }).click();
  await page.waitForTimeout(300);
  await supervision.locator("p", { hasText: "期限：", exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${size.name}-action-later-step.png`) });
  results.push(await measure(page, size.name, "later-step"));

  results.push({ size: size.name, caseUrl: base, errors });
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
      const textList = (selector) =>
        [...document.querySelectorAll(selector)]
          .filter(isVisible)
          .map((element) => element.textContent?.trim() || "")
          .filter(Boolean);

      const pageProgress = textList("main p, main span").find((text) =>
        /^办理进度 \d+\/\d+ 步$/.test(text),
      );
      const headerProgress = textList("header p").find((text) => /^\d+ \/ \d+$/.test(text));

      const stageSections = [...document.querySelectorAll('section[id^="stage-"]')].map((section) => {
        const header = section.querySelector(":scope > button");
        return {
          id: section.id,
          label: header?.querySelector(".text-xl")?.textContent?.trim() || null,
          expanded: header?.getAttribute("aria-expanded") === "true",
          badges: [...(header?.querySelectorAll("span") || [])]
            .map((span) => span.textContent?.trim() || "")
            .filter((text) => text === "当前" || text === "已完成"),
          count: section.querySelectorAll("li[data-step-key]").length,
        };
      });

      const stepItems = [...document.querySelectorAll("li[data-step-key]")];
      const openStep = stepItems.find((item) =>
        [...item.querySelectorAll("button")].some(
          (button) => button.getAttribute("aria-expanded") === "true",
        ),
      );

      const completeButtons = buttons.filter((button) =>
        (button.textContent || "").includes("标记完成"),
      );
      const currentComplete = completeButtons[0] || null;
      const currentCompleteRect = currentComplete?.getBoundingClientRect() || null;
      const bottomNav = [...document.querySelectorAll('nav[aria-label="案件工作台导航"]')].find(
        (nav) => isVisible(nav) && getComputedStyle(nav).position === "fixed",
      );
      const bottomNavTop = bottomNav ? Math.round(bottomNav.getBoundingClientRect().top) : null;

      return {
        size,
        surface,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        h1: document.querySelector("main h1")?.textContent?.trim(),
        pageProgress: pageProgress || null,
        headerProgress: headerProgress || null,
        stageSections,
        openStageCount: stageSections.filter((stage) => stage.expanded).length,
        openStage: stageSections.find((stage) => stage.expanded)?.label || null,
        currentStepKey: openStep?.getAttribute("data-step-key") || null,
        currentStepTitle: openStep?.querySelector("h3")?.textContent?.trim() || null,
        doneSteps: stepItems.filter((item) =>
          [...item.querySelectorAll("button")].some((button) => button.textContent?.trim() === "已完成"),
        ).length,
        bottomNavTop,
        currentCompleteButton: currentComplete
          ? {
              top: Math.round(currentCompleteRect.top + window.scrollY),
              bottom: Math.round(currentCompleteRect.bottom + window.scrollY),
              fullyInFirstScreen: currentCompleteRect.bottom <= window.innerHeight,
              aboveBottomNav: bottomNavTop === null ? null : currentCompleteRect.bottom <= bottomNavTop,
              height: Math.round(currentCompleteRect.height),
            }
          : null,
        currentStepTop: openStep ? Math.round(openStep.getBoundingClientRect().top + window.scrollY) : null,
        deadlineNotes: [...document.querySelectorAll("main p")]
          .filter(isVisible)
          .map((element) => element.textContent?.trim() || "")
          .filter((text) => text.startsWith("期限：") || text.includes(" · "))
          .length,
        riskNotes: [...document.querySelectorAll("main p")]
          .filter(isVisible)
          .map((element) => element.textContent?.trim() || "")
          .filter((text) => text.startsWith("风险：")).length,
        copyButtons: textList("button").filter((text) => text.includes("复制话术")).length,
        routeStations: document.querySelectorAll('[aria-label="行动阶段"] li').length,
        routeCurrent: document.querySelectorAll('[aria-label="行动阶段"] li[aria-current="step"]').length,
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
