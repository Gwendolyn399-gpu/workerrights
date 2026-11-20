import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snap = path.join(root, ".snapshot");
const NAMES = ["case.json", "meta.json", "analysis.json", "action.json", "form.json", "legal.json", "cases.json"];
const complete = NAMES.every((n) => fs.existsSync(path.join(snap, n)));
if (!complete) {
  const API = process.env.BACKEND_URL || "http://127.0.0.1:8000/api/v1";
  const SID = "single-file-build-" + Date.now();
  const headers = { "X-Session-Id": SID, "Content-Type": "application/json" };
  const created = await (await fetch(API + "/cases/demo", { method: "POST", headers })).json();
  const id = created.case.id;
  fs.mkdirSync(snap, { recursive: true });
  const get = async (p) => (await fetch(API + p, { headers })).json();
  fs.writeFileSync(path.join(snap, "case.json"), JSON.stringify({ case: created.case }));
  fs.writeFileSync(path.join(snap, "meta.json"), JSON.stringify(await get("/meta")));
  fs.writeFileSync(path.join(snap, "analysis.json"), JSON.stringify(await get(`/cases/${id}/analysis`)));
  fs.writeFileSync(path.join(snap, "action.json"), JSON.stringify(await get(`/cases/${id}/action-plan`)));
  fs.writeFileSync(path.join(snap, "form.json"), JSON.stringify(await get(`/cases/${id}/form-assistant`)));
  fs.writeFileSync(path.join(snap, "legal.json"), JSON.stringify(await get(`/cases/${id}/legal-basis`)));
  fs.writeFileSync(path.join(snap, "cases.json"), JSON.stringify(await get("/cases")));
  console.log("fetched fresh snapshot for case", id);
}
const read = (n) => JSON.parse(fs.readFileSync(path.join(snap, n), "utf8"));

const CHECK_LABELS = {
  location: "工作地点", work_type: "工种", period: "工作时间", recruiter: "招用主体",
  manager: "日常管理", wage_basis: "工资算法", amounts: "工资金额", owed_amount: "欠薪金额",
  paid_amount: "已支付金额", agreed_amount: "约定总额", contract: "书面合同", evidence: "证据材料",
};

const data = {
  case: read("case.json").case,
  meta: read("meta.json"),
  analysis: read("analysis.json"),
  action: read("action.json"),
  form: read("form.json"),
  legal: read("legal.json"),
  cases: read("cases.json"),
  checkLabels: CHECK_LABELS,
};

const template = fs.readFileSync(path.join(root, "scripts/single-file/template.html"), "utf8");
const json = JSON.stringify(data).replace(/</g, "\\u003c");
if (!template.includes("__DATA__")) throw new Error("template missing __DATA__ placeholder");
const html = template.replace("__DATA__", json);
const out = path.join(root, "workerrights-offline.html");
fs.writeFileSync(out, html);
console.log("wrote", out, (html.length / 1024).toFixed(1) + " KB");