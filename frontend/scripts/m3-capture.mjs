import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("..", "docs", "redesign", "m3");
fs.mkdirSync(OUT, { recursive: true });

const FACT_PATCH = {
  location_city: "郑州市",
  location_district: "金水区",
  location_detail: "某安置房二期工地",
  project_name: "金水区某安置房项目",
  contractor_name: "示例建设工程有限公司",
  subcontractor_name: "示例劳务有限公司",
  work_type: "钢筋工",
  work_start: "2026-06",
  work_end: "2026-09",
  duration_text: "3个月",
  recruiter_type: "包工头",
  recruiter_name: "王老板",
  manager_role: "包工头",
  wage_basis: "按天",
  daily_wage: 350,
  agreed_amount: 25000,
  paid_amount: 5000,
  owed_amount: 20000,
  has_contract: "no",
  evidence: ["chat", "attendance", "transfer", "photos", "witness"],
  project_info_status: "知道项目名称和总包",
  prior_report: "no",
  notes: "考勤和工资记录在包工头手里，本人有微信聊天和转账记录。",
};

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
  const session = `m3-${size.name}-${Date.now()}`;
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
  // Keep this evidence run on the deterministic local rule engine.
  await page.evaluate(async () => {
    await fetch("/api/py/agent/settings", {
      method: "DELETE",
      headers: { "X-Session-Id": localStorage.getItem("workerrights_session_id") },
    });
  });
  await page.reload({ waitUntil: "networkidle" });

  await page.getByRole("button", { name: /说说我的情况/ }).click();
  await page.waitForURL(/\/case\/[0-9a-f-]+$/);
  await page.getByRole("textbox", { name: "输入你的回答" }).waitFor();
  const caseUrl = page.url();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat-new.png`), fullPage: size.name === "mobile" });
  results.push(await measure(page, size.name, "chat-new"));

  await page.getByRole("button", { name: "郑州", exact: true }).click();
  await page.getByText(/具体在郑州市哪个区/).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat-answer.png`), fullPage: size.name === "mobile" });
  results.push(await measure(page, size.name, "chat-answer"));

  await page.evaluate(async (facts) => {
    const caseId = location.pathname.split("/").pop();
    const response = await fetch(`/api/py/cases/${caseId}/facts`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": localStorage.getItem("workerrights_session_id"),
      },
      body: JSON.stringify({ facts }),
    });
    if (!response.ok) throw new Error(`facts patch failed: ${response.status}`);
  }, FACT_PATCH);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /确认信息，生成分析/ }).waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat-confirm.png`), fullPage: size.name === "mobile" });
  results.push(await measure(page, size.name, "chat-confirm"));

  if (size.name === "mobile") {
    await page.getByRole("button", { name: "案件档案" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${size.name}-dossier-facts.png`) });
    results.push(await measure(page, size.name, "dossier-facts"));
    await page.getByRole("dialog").getByRole("tab", { name: "法律依据" }).click();
    await page.getByText(/共 \d+ 条/).waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${size.name}-dossier-legal.png`) });
    results.push(await measure(page, size.name, "dossier-legal"));
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();
  } else {
    await page.locator("aside").getByRole("tab", { name: "法律依据" }).click();
    await page.getByText(/共 \d+ 条/).waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${size.name}-dossier-legal.png`) });
    results.push(await measure(page, size.name, "dossier-legal"));
  }

  await page.getByRole("button", { name: /确认信息，生成分析/ }).click();
  await page.getByText("信息已确认").first().waitFor();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `${size.name}-chat-confirmed.png`), fullPage: size.name === "mobile" });
  results.push(await measure(page, size.name, "chat-confirmed"));

  results.push({ size: size.name, caseUrl, errors });
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
      const visibleButtons = [...document.querySelectorAll("button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const heights = visibleButtons.map((button) => Math.round(button.getBoundingClientRect().height));
      return {
        size,
        surface,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [root.scrollWidth, root.scrollHeight],
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        h1: document.querySelector("h1")?.textContent?.trim(),
        tabs: [...document.querySelectorAll('[role="tab"]')]
          .filter(isVisible)
          .map((tab) => tab.textContent?.trim())
          .filter(Boolean),
        stamps: [...document.querySelectorAll("span")]
          .filter(isVisible)
          .map((element) => element.textContent?.trim())
          .filter((text) => text === "已核对" || text === "待核对"),
        confirmVisible: document.body.innerText.includes("确认信息，生成分析"),
        confirmedVisible: document.body.innerText.includes("信息已确认"),
        assistantLabels: [...document.querySelectorAll("p")]
          .filter(isVisible)
          .filter((p) => p.textContent?.trim() === "助手").length,
        minButtonHeight: heights.length ? Math.min(...heights) : null,
        sub44Buttons: visibleButtons
          .filter((button) => button.getBoundingClientRect().height < 44)
          .map((button) => (button.textContent || button.getAttribute("aria-label") || "").trim())
          .filter(Boolean),
      };
    },
    { size, surface },
  );
}
