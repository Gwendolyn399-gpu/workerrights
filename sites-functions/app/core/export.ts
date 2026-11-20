import type { CaseRow } from "./types.ts";

type Section = Record<string, any>;

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function buildExportSections(caseRow: CaseRow, analysis: Record<string, any>, plan: Record<string, any>): Section[] {
  const basicRows: Array<[string, string]> = (analysis.basic_info ?? []).map((item: any) => [item.label, item.value]);
  const legalItems = (analysis.legal_analysis ?? []).map((item: any) => {
    const source = item.document_title ?? "";
    return {
      title: `${source} ${item.article ?? ""} ${item.heading ?? ""}`.trim(),
      text: item.text ?? "",
      applicability: item.applicability ?? "",
      pending: item.pending_verification ?? [],
      source: `${item.issuing_authority ?? ""}｜核验状态：${item.verification_label ?? ""}｜${item.official_source_name ?? ""} ${item.official_url ?? ""}`.trim(),
    };
  });
  const steps = (plan.steps ?? []).map((step: any) => ({
    position: step.position,
    title: step.title,
    why: step.why,
    prepare: step.prepare,
    deadline: step.deadline_note ?? null,
    risk: step.risk_note ?? null,
    done: step.done ?? null,
  }));
  const channels = (plan.channels ?? [])
    .filter((channel: any) => channel.recommended || ["henan-12333", "labor-arbitration", "legal-aid-12348"].includes(channel.id))
    .map((channel: any) => ({
      name: channel.name,
      reason: channel.reason ?? "",
      url: channel.official_url ?? "",
      access: channel.access_note ?? "",
      verification: channel.verification_status ?? "",
    }));
  return [
    {
      title: "案件基本情况",
      rows: basicRows,
      note: caseRow.is_demo
        ? "本文件为虚构演示案例，人物、项目、公司名称均为虚构。"
        : "以下信息来自你在对话中的陈述，未知信息保留为“待核实”。",
    },
    {
      title: "事实陈述（正式参考稿）",
      paragraphs: [plan.formal_statement ?? ""],
      note: "提交前请核对姓名、日期、金额和项目信息；本产品不代替你向官方平台提交。",
    },
    { title: "证据目录", evidence: plan.evidence_directory ?? [] },
    {
      title: "可能适用的法律依据",
      legal_items: legalItems,
      note: (analysis.legal_sources ?? {}).disclaimer ?? "",
    },
    { title: "维权行动步骤", steps },
    { title: "推荐渠道", channels },
    {
      title: "风险与时效提示",
      bullets: [
        ...(plan.risks ?? []),
        ...(analysis.risk_flags ?? []).filter((item: any) => item.level === "attention").map((item: any) => item.detail),
      ],
    },
    { title: "免责声明", paragraphs: [analysis.disclaimer ?? "", plan.disclaimer ?? ""] },
  ];
}

export function buildPlainText(caseRow: CaseRow, analysis: Record<string, any>, plan: Record<string, any>): string {
  const sections = buildExportSections(caseRow, analysis, plan);
  const lines: string[] = [
    caseRow.title,
    `案件编号：${caseRow.id}`,
    `生成日期：${localDate()}`,
    caseRow.is_demo ? "本文件由工友权益助手本地演示版生成，不构成正式法律意见。" : "",
    "",
  ];
  for (const section of sections) {
    lines.push(section.title);
    lines.push("=".repeat(40));
    for (const [label, value] of section.rows ?? []) lines.push(`${label}：${value}`);
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph || "");
    for (const item of section.evidence ?? []) lines.push(`- ${item.label}（${item.status}）：${item.proves}`);
    for (const item of section.legal_items ?? []) {
      lines.push(`- ${item.title}`);
      lines.push(`  ${item.text}`);
      lines.push(`  适用判断：${item.applicability}`);
      if (item.pending?.length) lines.push(`  待核实：${item.pending.join("；")}`);
      lines.push(`  来源：${item.source}`);
    }
    for (const step of section.steps ?? []) {
      const mark = step.done ? "已完成" : "待完成";
      lines.push(`${step.position}. ${step.title}（${mark}）`);
      lines.push(`   为什么：${step.why}`);
      for (const prepare of step.prepare ?? []) lines.push(`   - ${prepare}`);
      if (step.deadline) lines.push(`   时效：${step.deadline}`);
      if (step.risk) lines.push(`   注意：${step.risk}`);
    }
    for (const channel of section.channels ?? []) {
      lines.push(`- ${channel.name}：${channel.reason}`);
      if (channel.url) lines.push(`  入口：${channel.url}`);
    }
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`);
    if (section.note) lines.push(`说明：${section.note}`);
    lines.push("");
  }
  return lines.join("\n");
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer using stored (uncompressed) entries — valid for OOXML.
function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x21; // 1980-01-01
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let position = 0;
  for (const local of locals) { out.set(local, position); position += local.length; }
  for (const central of centrals) { out.set(central, position); position += central.length; }
  out.set(end, position);
  return out;
}

interface DocParagraph {
  text: string;
  style?: string;
  bold?: boolean;
  center?: boolean;
}

function docxParagraphs(caseRow: CaseRow, sections: Section[]): DocParagraph[] {
  const paragraphs: DocParagraph[] = [
    { text: caseRow.title, style: "Title", center: true },
    { text: `案件编号：${caseRow.id}    生成日期：${localDate()}`, center: true },
  ];
  if (caseRow.is_demo) {
    paragraphs.push({ text: "虚构演示案例：人物、项目、公司名称均为虚构，仅用于产品演示。", bold: true });
  }
  for (const section of sections) {
    paragraphs.push({ text: section.title, style: "Heading1" });
    for (const [label, value] of section.rows ?? []) paragraphs.push({ text: `${label}：${value}` });
    for (const paragraph of section.paragraphs ?? []) paragraphs.push({ text: paragraph || "" });
    for (const item of section.evidence ?? []) {
      paragraphs.push({ text: `${item.label}（${item.status}）：${item.proves}`, style: "ListBullet" });
    }
    for (const item of section.legal_items ?? []) {
      paragraphs.push({ text: item.title, style: "ListBullet" });
      paragraphs.push({ text: item.text });
      paragraphs.push({ text: `适用判断：${item.applicability}` });
      if (item.pending?.length) paragraphs.push({ text: `待核实：${item.pending.join("；")}` });
      paragraphs.push({ text: `来源：${item.source}` });
    }
    for (const step of section.steps ?? []) {
      const mark = step.done ? "已完成" : "待完成";
      paragraphs.push({ text: `${step.position}. ${step.title}（${mark}）` });
      paragraphs.push({ text: `为什么：${step.why}` });
      for (const prepare of step.prepare ?? []) paragraphs.push({ text: prepare, style: "ListBullet" });
      if (step.deadline) paragraphs.push({ text: `时效：${step.deadline}` });
      if (step.risk) paragraphs.push({ text: `注意：${step.risk}` });
    }
    for (const channel of section.channels ?? []) {
      paragraphs.push({ text: `${channel.name}：${channel.reason}`, style: "ListBullet" });
      if (channel.url) paragraphs.push({ text: `官方入口：${channel.url}` });
    }
    for (const bullet of section.bullets ?? []) paragraphs.push({ text: bullet, style: "ListBullet" });
    if (section.note) paragraphs.push({ text: `说明：${section.note}` });
  }
  return paragraphs;
}

function renderDocxParagraph(paragraph: DocParagraph): string {
  const props: string[] = [];
  if (paragraph.style) props.push(`<w:pStyle w:val="${paragraph.style}"/>`);
  if (paragraph.center) props.push(`<w:jc w:val="center"/>`);
  const pPr = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  const rPr = paragraph.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(paragraph.text)}</w:t></w:r></w:p>`;
}

export function toDocx(caseRow: CaseRow, analysis: Record<string, any>, plan: Record<string, any>): Uint8Array {
  const sections = buildExportSections(caseRow, analysis, plan);
  const body = docxParagraphs(caseRow, sections).map(renderDocxParagraph).join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体"/><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:ind w:left="420" w:hanging="280"/></w:pPr></w:style>` +
    `</w:styles>`;

  const numberingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="420" w:hanging="280"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
    `</Relationships>`;

  const encoder = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/styles.xml", data: encoder.encode(stylesXml) },
    { name: "word/numbering.xml", data: encoder.encode(numberingXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(documentRels) },
  ]);
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function utf16beHex(text: string): string {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      const offset = code - 0x10000;
      const high = 0xd800 + (offset >> 10);
      const low = 0xdc00 + (offset & 0x3ff);
      bytes.push(high >> 8, high & 0xff, low >> 8, low & 0xff);
    } else {
      bytes.push(code >> 8, code & 0xff);
    }
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function charWidth(ch: string, fontSize: number): number {
  const code = ch.codePointAt(0)!;
  // CJK / fullwidth forms occupy roughly one em; latin digits/letters about half.
  if (code >= 0x1100 && (code <= 0x115f || code >= 0x2e80 || code === 0x3000)) return fontSize;
  return fontSize * 0.5;
}

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let current = "";
    let width = 0;
    for (const ch of rawLine) {
      const w = charWidth(ch, fontSize);
      if (width + w > maxWidth && current) {
        lines.push(current);
        current = ch;
        width = w;
      } else {
        current += ch;
        width += w;
      }
    }
    lines.push(current);
  }
  return lines;
}

interface PdfLine {
  text: string;
  fontSize: number;
  leading: number;
  spaceBefore: number;
  spaceAfter: number;
  gray?: boolean;
}

function pdfLines(caseRow: CaseRow, sections: Section[]): PdfLine[] {
  const lines: PdfLine[] = [];
  const title = (text: string): PdfLine => ({ text, fontSize: 18, leading: 26, spaceBefore: 0, spaceAfter: 10 });
  const heading = (text: string): PdfLine => ({ text, fontSize: 13, leading: 20, spaceBefore: 10, spaceAfter: 6 });
  const body = (text: string): PdfLine => ({ text, fontSize: 10.5, leading: 17, spaceBefore: 0, spaceAfter: 4 });
  const small = (text: string): PdfLine => ({ text, fontSize: 8.5, leading: 13, spaceBefore: 0, spaceAfter: 0, gray: true });

  lines.push(title(caseRow.title));
  lines.push(small(`案件编号：${caseRow.id}    生成日期：${localDate()}`));
  if (caseRow.is_demo) lines.push(small("虚构演示案例：人物、项目、公司名称均为虚构，仅用于产品演示。"));
  for (const section of sections) {
    lines.push(heading(section.title));
    for (const [label, value] of section.rows ?? []) lines.push(body(`${label}：${value}`));
    for (const paragraph of section.paragraphs ?? []) lines.push(body(paragraph || ""));
    for (const item of section.evidence ?? []) lines.push(body(`· ${item.label}（${item.status}）：${item.proves}`));
    for (const item of section.legal_items ?? []) {
      lines.push(body(`· ${item.title}`));
      lines.push(body(item.text));
      lines.push(body(`适用判断：${item.applicability}`));
      if (item.pending?.length) lines.push(body(`待核实：${item.pending.join("；")}`));
      lines.push(small(`来源：${item.source}`));
    }
    for (const step of section.steps ?? []) {
      const mark = step.done ? "已完成" : "待完成";
      lines.push(body(`${step.position}. ${step.title}（${mark}）`));
      lines.push(body(`为什么：${step.why}`));
      for (const prepare of step.prepare ?? []) lines.push(body(`· ${prepare}`));
      if (step.deadline) lines.push(body(`时效：${step.deadline}`));
      if (step.risk) lines.push(body(`注意：${step.risk}`));
    }
    for (const channel of section.channels ?? []) {
      lines.push(body(`· ${channel.name}：${channel.reason}`));
      if (channel.url) lines.push(small(`官方入口：${channel.url}`));
    }
    for (const bullet of section.bullets ?? []) lines.push(body(`· ${bullet}`));
    if (section.note) lines.push(small(`说明：${section.note}`));
  }
  return lines;
}

// A4 PDF using the non-embedded Adobe CID font STSong-Light (UniGB-UCS2-H),
// matching the reportlab UnicodeCIDFont baseline. Viewers substitute a CJK font.
export function toPdf(caseRow: CaseRow, analysis: Record<string, any>, plan: Record<string, any>): Uint8Array {
  const sections = buildExportSections(caseRow, analysis, plan);
  const pageWidth = 595.276;
  const pageHeight = 841.89;
  const leftMargin = 51.02;
  const rightMargin = 51.02;
  const topMargin = 45.35;
  const bottomMargin = 45.35;
  const maxWidth = pageWidth - leftMargin - rightMargin;

  const pages: string[] = [];
  let content = "";
  let y = pageHeight - topMargin;
  const flushPage = () => { pages.push(content); content = ""; y = pageHeight - topMargin; };
  const ensureSpace = (needed: number) => { if (y - needed < bottomMargin) flushPage(); };

  for (const line of pdfLines(caseRow, sections)) {
    const wrapped = wrapText(line.text, line.fontSize, maxWidth);
    ensureSpace(line.spaceBefore + line.leading);
    y -= line.spaceBefore;
    const color = line.gray ? "0.333 0.333 0.333" : "0 0 0";
    for (const segment of wrapped) {
      ensureSpace(line.leading);
      y -= line.leading;
      const baseline = y + line.leading * 0.28;
      content += `BT ${color} rg /F1 ${line.fontSize} Tf ${leftMargin} ${baseline.toFixed(2)} Td <${utf16beHex(segment)}> Tj ET\n`;
    }
    y -= line.spaceAfter;
  }
  flushPage();

  const objects: string[] = [];
  const pageCount = pages.length;
  // Object numbering: 1 Catalog, 2 Pages, 3 Font, 4 FontDescriptor, 5 CIDFont,
  // 6..(5+pageCount) Page objects, then content streams, then xref.
  const pageObjectIds = pages.map((_, index) => 6 + index);
  const contentObjectIds = pages.map((_, index) => 6 + pageCount + index);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>`;
  objects[4] = `<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-250 -250 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 93 >>`;
  objects[5] = `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 4 0 R /DW 1000 >>`;
  pages.forEach((pageContent, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const streamBytes = new TextEncoder().encode(pageContent);
    objects[contentId] = `<< /Length ${streamBytes.length} >>\nstream\n${pageContent}endstream`;
  });

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (text: string) => { const bytes = encoder.encode(text); chunks.push(bytes); length += bytes.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [];
  const maxId = contentObjectIds[pageCount - 1];
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = length;
    push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xrefOffset = length;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { out.set(chunk, position); position += chunk.length; }
  return out;
}