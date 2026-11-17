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
});
await context.addInitScript((sid) => localStorage.setItem("workerrights_session_id", sid), SESSION);
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(err.message));

const log = (...args) => console.log(...args);
const clickButton = async (name, exact = true) => {
  const button = page.getByRole("button", { name, exact });
  await button.first().waitFor({ state: "visible", timeout: 15000 });
  await button.first().click();
  await page.waitForTimeout(800);
};
const clickQuick = async (name) => clickButton(name, true);

await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await clickButton("说说我的情况");
await page.waitForURL(/\/case\/[0-9a-f-]+$/);
await page.getByText("AI 劳动权益助手").waitFor();
log("created case", page.url());
await page.screenshot({ path: path.join(OUT, "flow-01-first-question.png"), fullPage: false });

await clickQuick("郑州");
await clickQuick("金水区");
await clickQuick("钢筋工");
await clickQuick("3-6个月左右");
await clickQuick("包工头");
await clickQuick("同一个包工头");
await clickQuick("按天算");

const textarea = page.getByRole("textbox", { name: "输入你的回答" });
await textarea.fill("一共两万六，给了六千，还欠两万");
await textarea.press("Enter");
await page.waitForTimeout(1200);
log("amount answered");
await page.screenshot({ path: path.join(OUT, "flow-02-quick-replies.png"), fullPage: false });

await clickQuick("没签");
await clickQuick("微信聊天记录");
await clickQuick("考勤记录");
await clickQuick("工友证言");
await clickButton(/发送所选/, false);
await clickQuick("不知道");
await clickQuick("没找过");
await page.screenshot({ path: path.join(OUT, "flow-03-before-confirm.png"), fullPage: false });
await clickQuick("信息无误，生成分析");
await page.getByText("案件信息已确认。你可以查看分析，或直接生成行动指南。").waitFor({ timeout: 15000 });
log("intake confirmed");

const analysisLink = page.locator('a[href$="/analysis"]').first();
await analysisLink.click();
await page.getByText("案件分析工作台").waitFor({ timeout: 15000 });
await page.waitForTimeout(1000);
const bodyText = await page.locator("body").innerText();
log("analysis has owed", bodyText.includes("2万元"));
log("analysis has law", bodyText.includes("保障农民工工资支付条例"));

const [docx] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "DOCX" }).click(),
]);
log("docx download", docx.suggestedFilename());
fs.writeFileSync(path.join(OUT, "export.docx"), await docx.path());
const [pdf] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "PDF" }).click(),
]);
log("pdf download", pdf.suggestedFilename());
fs.writeFileSync(path.join(OUT, "export.pdf"), await pdf.path());

await page.locator('a[href$="/action-plan"]').first().click();
await page.getByText("维权行动指南").waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await page.getByRole("button", { name: "标记完成" }).first().click();
await page.getByRole("button", { name: "已完成" }).first().waitFor({ timeout: 15000 });
log("action step persisted");
await page.screenshot({ path: path.join(OUT, "flow-04-action.png"), fullPage: false });

await page.locator('a[href$="/form-assistant"]').first().click();
await page.waitForURL(/form-assistant/);
await page.getByText("逐字段给你解释和参考内容").waitFor({ timeout: 15000 });
await page.getByRole("button", { name: /5 填写欠薪事实/ }).click();
await page.getByText("填写欠薪事实").last().waitFor();
log("form step 5 open");
await page.screenshot({ path: path.join(OUT, "flow-05-form.png"), fullPage: false });

await page.locator('a[href$="/case/' + page.url().split("/case/")[1].split("/")[0] + '"]').first().click();
await page.getByText("AI 劳动权益助手").waitFor();
await page.getByRole("button", { name: "查看相关法律依据" }).first().click();
await page.getByRole("heading", { name: "相关法律依据" }).waitFor({ timeout: 15000 });
await page.getByText("核验状态说明").waitFor();
log("legal modal open");
await page.screenshot({ path: path.join(OUT, "flow-06-legal-modal.png"), fullPage: false });
await page.getByRole("button", { name: "关闭" }).click();

await page.getByRole("button", { name: "修改案件信息" }).first().click();
await page.getByRole("dialog").waitFor();
const owedInput = page.locator("label").filter({ hasText: "拖欠金额（元）" }).locator("input");
await owedInput.fill("19000");
await page.getByRole("button", { name: "保存修改" }).click();
await page.getByText("案件信息已更新").waitFor({ timeout: 15000 });
log("facts editor saved");
await page.waitForTimeout(800);
const afterEdit = await page.locator("body").innerText();
log("updated owed", afterEdit.includes("1.9万元") || afterEdit.includes("19,000"));

await page.screenshot({ path: path.join(OUT, "flow-07-after-edit.png"), fullPage: false });
log("errors", errors.length ? errors : "none");
await browser.close();
