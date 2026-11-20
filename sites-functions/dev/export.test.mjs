import assert from "node:assert/strict";
import test from "node:test";
import { createDemoCase } from "../app/core/demo.ts";
import { runCaseAnalysis } from "../app/core/analysis.ts";
import { ensureActionPlan } from "../app/core/action_plan.ts";
import { buildPlainText, toDocx, toPdf } from "../app/core/export.ts";
import { LegalRetriever } from "../app/core/retriever.ts";
import { createFakeDb } from "./fake-db.mjs";

function zipNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    names.push(decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen)));
    offset += 30 + nameLen + extraLen + compSize;
  }
  return names;
}

function hasSignature(bytes, signature) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 4 <= bytes.length; offset++) {
    if (view.getUint32(offset, true) === signature) return true;
  }
  return false;
}

async function demoMaterials() {
  const db = createFakeDb();
  const retriever = new LegalRetriever();
  const caseRow = await createDemoCase(db, "owner-export", retriever);
  const analysis = runCaseAnalysis(caseRow, retriever);
  const plan = ensureActionPlan(caseRow, retriever);
  return { caseRow, analysis, plan };
}

test("plain text export contains all sections", async () => {
  const { caseRow, analysis, plan } = await demoMaterials();
  const text = buildPlainText(caseRow, analysis, plan);
  assert.ok(text.startsWith(caseRow.title));
  for (const heading of ["案件基本情况", "事实陈述（正式参考稿）", "证据目录", "可能适用的法律依据", "维权行动步骤", "推荐渠道", "风险与时效提示", "免责声明"]) {
    assert.ok(text.includes(heading), `missing ${heading}`);
  }
  assert.ok(text.includes("虚构演示"));
});

test("docx export is a valid OOXML zip with content", async () => {
  const { caseRow, analysis, plan } = await demoMaterials();
  const bytes = toDocx(caseRow, analysis, plan);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const names = zipNames(bytes);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"]) {
    assert.ok(names.includes(part), `missing part ${part}`);
  }
  assert.ok(hasSignature(bytes, 0x06054b50), "missing EOCD");
  const full = new TextDecoder().decode(bytes);
  assert.ok(full.includes("免责声明"));
  assert.ok(full.includes("w:document"));
});

test("pdf export has valid structure and CJK text objects", async () => {
  const { caseRow, analysis, plan } = await demoMaterials();
  const bytes = toPdf(caseRow, analysis, plan);
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  assert.ok(head.startsWith("%PDF-1.4"));
  const full = new TextDecoder().decode(bytes);
  assert.ok(full.includes("%%EOF"));
  assert.ok(full.includes("/Type /Catalog"));
  assert.ok(full.includes("/BaseFont /STSong-Light"));
  assert.ok(full.includes("/UniGB-UCS2-H"));
  const countMatch = /\/Count (\d+)/.exec(full);
  assert.ok(countMatch && Number(countMatch[1]) > 0);
  assert.ok(full.includes("startxref"));
});