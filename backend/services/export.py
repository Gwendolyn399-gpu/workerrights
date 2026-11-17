from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from backend.models.case import Case


def build_export_sections(case: Case, analysis: dict, plan: dict) -> list[dict]:
    facts = case.facts
    basic_rows = [
        (item["label"], item["value"]) for item in analysis.get("basic_info", [])
    ]
    legal_items = []
    for item in analysis.get("legal_analysis", []):
        source = item.get("document_title", "")
        legal_items.append(
            {
                "title": f"{source} {item.get('article', '')} {item.get('heading', '')}".strip(),
                "text": item.get("text", ""),
                "applicability": item.get("applicability", ""),
                "pending": item.get("pending_verification", []),
                "source": f"{item.get('issuing_authority', '')}｜核验状态：{item.get('verification_label', '')}｜{item.get('official_source_name', '')} {item.get('official_url', '')}".strip(),
            }
        )
    steps = []
    for step in plan.get("steps", []):
        steps.append(
            {
                "position": step["position"],
                "title": step["title"],
                "why": step["why"],
                "prepare": step["prepare"],
                "deadline": step.get("deadline_note"),
                "risk": step.get("risk_note"),
                "done": step.get("done"),
            }
        )
    channels = [
        {
            "name": channel["name"],
            "reason": channel.get("reason", ""),
            "url": channel.get("official_url", ""),
            "access": channel.get("access_note", ""),
            "verification": channel.get("verification_status", ""),
        }
        for channel in plan.get("channels", [])
        if channel.get("recommended") or channel["id"] in ("henan-12333", "labor-arbitration", "legal-aid-12348")
    ]
    return [
        {
            "title": "案件基本情况",
            "rows": basic_rows,
            "note": "以下信息来自你在对话中的陈述，未知信息保留为“待核实”。"
            if not case.is_demo
            else "本文件为虚构演示案例，人物、项目、公司名称均为虚构。",
        },
        {
            "title": "事实陈述（正式参考稿）",
            "paragraphs": [plan.get("formal_statement", "")],
            "note": "提交前请核对姓名、日期、金额和项目信息；本产品不代替你向官方平台提交。",
        },
        {
            "title": "证据目录",
            "evidence": plan.get("evidence_directory", []),
        },
        {
            "title": "可能适用的法律依据",
            "legal_items": legal_items,
            "note": analysis.get("legal_sources", {}).get("disclaimer", ""),
        },
        {
            "title": "维权行动步骤",
            "steps": steps,
        },
        {
            "title": "推荐渠道",
            "channels": channels,
        },
        {
            "title": "风险与时效提示",
            "bullets": plan.get("risks", [])
            + [item["detail"] for item in analysis.get("risk_flags", []) if item.get("level") == "attention"],
        },
        {
            "title": "免责声明",
            "paragraphs": [analysis.get("disclaimer", ""), plan.get("disclaimer", "")],
        },
    ]


def build_plain_text(case: Case, analysis: dict, plan: dict) -> str:
    sections = build_export_sections(case, analysis, plan)
    lines = [
        case.title,
        f"案件编号：{case.id}",
        f"生成日期：{date.today().isoformat()}",
        "本文件由工友权益助手本地演示版生成，不构成正式法律意见。" if case.is_demo else "",
        "",
    ]
    for section in sections:
        lines.append(section["title"])
        lines.append("=" * 40)
        for label, value in section.get("rows", []):
            lines.append(f"{label}：{value}")
        for paragraph in section.get("paragraphs", []):
            lines.append(paragraph or "")
        for item in section.get("evidence", []):
            lines.append(f"- {item['label']}（{item['status']}）：{item['proves']}")
        for item in section.get("legal_items", []):
            lines.append(f"- {item['title']}")
            lines.append(f"  {item['text']}")
            lines.append(f"  适用判断：{item['applicability']}")
            if item.get("pending"):
                lines.append(f"  待核实：{'；'.join(item['pending'])}")
            lines.append(f"  来源：{item['source']}")
        for step in section.get("steps", []):
            mark = "已完成" if step.get("done") else "待完成"
            lines.append(f"{step['position']}. {step['title']}（{mark}）")
            lines.append(f"   为什么：{step['why']}")
            for prepare in step.get("prepare", []):
                lines.append(f"   - {prepare}")
            if step.get("deadline"):
                lines.append(f"   时效：{step['deadline']}")
            if step.get("risk"):
                lines.append(f"   注意：{step['risk']}")
        for channel in section.get("channels", []):
            lines.append(f"- {channel['name']}：{channel['reason']}")
            if channel.get("url"):
                lines.append(f"  入口：{channel['url']}")
        for bullet in section.get("bullets", []):
            lines.append(f"- {bullet}")
        if section.get("note"):
            lines.append(f"说明：{section['note']}")
        lines.append("")
    return "\n".join(lines)


def to_docx(case: Case, analysis: dict, plan: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Pt

    document = Document()
    styles = document.styles
    normal = styles["Normal"]
    normal.font.name = "宋体"
    normal.font.size = Pt(11)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    title = document.add_heading(case.title, level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in title.runs:
        run.font.name = "黑体"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")

    meta = document.add_paragraph(f"案件编号：{case.id}    生成日期：{date.today().isoformat()}")
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if case.is_demo:
        notice = document.add_paragraph("虚构演示案例：人物、项目、公司名称均为虚构，仅用于产品演示。")
        notice.runs[0].bold = True

    sections = build_export_sections(case, analysis, plan)
    for section in sections:
        heading = document.add_heading(section["title"], level=1)
        for run in heading.runs:
            run.font.name = "黑体"
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
        for label, value in section.get("rows", []):
            document.add_paragraph(f"{label}：{value}")
        for paragraph in section.get("paragraphs", []):
            document.add_paragraph(paragraph or "")
        for item in section.get("evidence", []):
            document.add_paragraph(
                f"{item['label']}（{item['status']}）：{item['proves']}", style="List Bullet"
            )
        for item in section.get("legal_items", []):
            document.add_paragraph(item["title"], style="List Bullet")
            document.add_paragraph(item["text"])
            document.add_paragraph(f"适用判断：{item['applicability']}")
            if item.get("pending"):
                document.add_paragraph(f"待核实：{'；'.join(item['pending'])}")
            document.add_paragraph(f"来源：{item['source']}")
        for step in section.get("steps", []):
            mark = "已完成" if step.get("done") else "待完成"
            document.add_paragraph(f"{step['position']}. {step['title']}（{mark}）")
            document.add_paragraph(f"为什么：{step['why']}")
            for prepare in step.get("prepare", []):
                document.add_paragraph(prepare, style="List Bullet")
            if step.get("deadline"):
                document.add_paragraph(f"时效：{step['deadline']}")
            if step.get("risk"):
                document.add_paragraph(f"注意：{step['risk']}")
        for channel in section.get("channels", []):
            document.add_paragraph(f"{channel['name']}：{channel['reason']}", style="List Bullet")
            if channel.get("url"):
                document.add_paragraph(f"官方入口：{channel['url']}")
        for bullet in section.get("bullets", []):
            document.add_paragraph(bullet, style="List Bullet")
        if section.get("note"):
            document.add_paragraph(f"说明：{section['note']}")

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def to_pdf(case: Case, analysis: dict, plan: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font_name = "STSong-Light"
    except Exception:  # pragma: no cover - font fallback for unusual environments
        font_name = "Helvetica"

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=case.title,
    )
    title_style = ParagraphStyle(
        "Title", fontName=font_name, fontSize=18, leading=26, spaceAfter=10
    )
    heading_style = ParagraphStyle(
        "Heading", fontName=font_name, fontSize=13, leading=20, spaceBefore=10, spaceAfter=6
    )
    body_style = ParagraphStyle(
        "Body", fontName=font_name, fontSize=10.5, leading=17, wordWrap="CJK", spaceAfter=4
    )
    small_style = ParagraphStyle(
        "Small", fontName=font_name, fontSize=8.5, leading=13, textColor="#555555", wordWrap="CJK"
    )

    def para(text: str, style=body_style):
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)

    story = [para(case.title, title_style)]
    story.append(para(f"案件编号：{case.id}    生成日期：{date.today().isoformat()}", small_style))
    if case.is_demo:
        story.append(para("虚构演示案例：人物、项目、公司名称均为虚构，仅用于产品演示。", small_style))
    story.append(Spacer(1, 8))

    sections = build_export_sections(case, analysis, plan)
    for section in sections:
        story.append(para(section["title"], heading_style))
        for label, value in section.get("rows", []):
            story.append(para(f"{label}：{value}"))
        for paragraph in section.get("paragraphs", []):
            story.append(para(paragraph or ""))
        for item in section.get("evidence", []):
            story.append(para(f"· {item['label']}（{item['status']}）：{item['proves']}"))
        for item in section.get("legal_items", []):
            story.append(para(f"· {item['title']}", body_style))
            story.append(para(item["text"]))
            story.append(para(f"适用判断：{item['applicability']}"))
            if item.get("pending"):
                story.append(para(f"待核实：{'；'.join(item['pending'])}"))
            story.append(para(f"来源：{item['source']}", small_style))
        for step in section.get("steps", []):
            mark = "已完成" if step.get("done") else "待完成"
            story.append(para(f"{step['position']}. {step['title']}（{mark}）"))
            story.append(para(f"为什么：{step['why']}"))
            for prepare in step.get("prepare", []):
                story.append(para(f"· {prepare}"))
            if step.get("deadline"):
                story.append(para(f"时效：{step['deadline']}"))
            if step.get("risk"):
                story.append(para(f"注意：{step['risk']}"))
        for channel in section.get("channels", []):
            story.append(para(f"· {channel['name']}：{channel['reason']}"))
            if channel.get("url"):
                story.append(para(f"官方入口：{channel['url']}", small_style))
        for bullet in section.get("bullets", []):
            story.append(para(f"· {bullet}"))
        if section.get("note"):
            story.append(para(f"说明：{section['note']}", small_style))
        story.append(Spacer(1, 6))

    document.build(story)
    return buffer.getvalue()
