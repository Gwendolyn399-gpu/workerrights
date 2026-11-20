import re
from typing import Any

from backend.rules.regions import detect_location
from backend.services.amounts import context_after, context_before, find_money, parse_duration_months

NEW_CASE_FACTS: dict[str, Any] = {
    "scene": "construction_wage_arrears",
    "location_province": None,
    "location_city": None,
    "location_district": None,
    "location_detail": None,
    "project_name": None,
    "developer_name": None,
    "contractor_name": None,
    "subcontractor_name": None,
    "work_type": None,
    "work_start": None,
    "work_end": None,
    "duration_text": None,
    "duration_months": None,
    "recruiter_type": None,
    "recruiter_name": None,
    "recruiter_phone": None,
    "manager_role": None,
    "manager_name": None,
    "wage_basis": None,
    "daily_wage": None,
    "monthly_wage": None,
    "unit_price": None,
    "agreed_amount": None,
    "paid_amount": None,
    "owed_amount": None,
    "owed_amount_approx": False,
    "owed_amount_note": None,
    "pay_cycle": None,
    "last_paid_date": None,
    "has_contract": None,
    "contract_party": None,
    "evidence": [],
    "evidence_other": None,
    "evidence_status": None,
    "project_info_status": None,
    "prior_report": None,
    "prior_report_detail": None,
    "contact_phone": None,
    "user_statement": None,
    "notes": None,
    "outside_scope": False,
    "outside_scope_note": None,
}

WORK_TYPE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("钢筋工", ("钢筋", "绑扎", "扎钢筋")),
    ("木工", ("木工", "支模", "模板")),
    ("瓦工", ("瓦工", "砌墙", "砌筑", "抹灰", "贴砖")),
    ("水电工", ("水电", "电工", "水管", "布线")),
    ("架子工", ("架子工", "搭架子", "脚手架")),
    ("混凝土工", ("混凝土", "打灰", "浇筑")),
    ("焊工", ("焊工", "电焊", "焊接")),
    ("油漆工", ("油漆", "涂料", "刷墙")),
    ("防水工", ("防水",)),
    ("塔吊司机", ("塔吊",)),
    ("电梯安装工", ("电梯",)),
    ("测量工", ("测量", "放线")),
    ("司机", ("货车", "开车", "司机")),
    ("装修工", ("装修", "木饰", "吊顶")),
    ("杂工/小工", ("杂工", "小工", "力工", "普工")),
]

EVIDENCE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("chat", ("微信", "聊天记录", "短信", "语音消息", "聊天")),
    ("attendance", ("考勤", "打卡", "记工", "门禁记录")),
    ("wage_sheet", ("工资表", "工资条", "结算单", "记工本", "对账单")),
    ("transfer", ("转账", "银行流水", "支付宝", "微信支付", "打款记录")),
    ("iou", ("欠条", "借条", "欠款单")),
    ("photos", ("照片", "视频", "现场照片", "工作照")),
    ("badge", ("工牌", "安全帽", "门禁卡", "出入证", "胸牌")),
    ("witness", ("工友", "证人", "老乡作证", "同事作证")),
    ("recording", ("录音", "通话录音", "通话记录")),
    ("contract", ("劳动合同", "劳务协议", "进场协议", "书面合同")),
]

COMPANY_PATTERN = re.compile(r"([\u4e00-\u9fa5]{2,20}(?:有限责任公司|有限公司|集团公司|劳务公司|建筑公司|工程公司))")
PROJECT_PATTERN = re.compile(
    r"(?:项目|工地)(?:名称)?(?:叫|是|为)\s*[“\"「]?([^，。；;、\s”\"」]{2,30})"
)
PHONE_PATTERN = re.compile(r"1[3-9]\d{9}")


def _clean(value: str) -> str:
    return value.strip(" \t\r\n，。,.；;：:！!？?“”\"'、")


def _append_note(existing: str | None, note: str) -> str:
    if not existing:
        return note
    if note in existing:
        return existing
    return f"{existing}；{note}"


class FactExtractor:
    """Deterministic, conservative extraction from worker language.

    It only records information expressed by the user. Approximate amounts are
    kept approximate. Unknown values stay ``None`` instead of being invented.
    """

    def extract(
        self,
        text: str,
        current_facts: dict,
        question_key: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        updates: dict[str, Any] = {}
        meta: dict[str, Any] = {}
        clean_text = text.strip()
        if not clean_text:
            return updates, meta

        location = detect_location(clean_text)
        if location["location_province"]:
            updates["location_province"] = location["location_province"]
        if location["location_city"]:
            updates["location_city"] = location["location_city"]
        if location["location_district"]:
            updates["location_district"] = location["location_district"]
        if not location["location_city"] and question_key == "location":
            if any(marker in clean_text for marker in ("工地", "项目", "路", "街", "园区", "小区")):
                updates["location_detail"] = _clean(clean_text)[:80]

        work_type = self._detect_work_type(clean_text)
        if work_type:
            updates["work_type"] = work_type
        elif question_key == "work_type" and self._looks_like_work_type(clean_text):
            updates["work_type"] = _clean(clean_text)

        self._extract_period(clean_text, updates, question_key)
        self._extract_recruiter(clean_text, updates, question_key)
        self._extract_manager(clean_text, updates, question_key)
        self._extract_wage(clean_text, updates, question_key, current_facts)
        self._extract_contract(clean_text, updates, question_key)
        self._extract_evidence(clean_text, updates, question_key)
        self._extract_project(clean_text, updates, question_key)
        self._extract_prior_report(clean_text, updates, question_key)
        self._extract_contacts(clean_text, updates, question_key)

        updates["user_statement"] = _append_note(
            current_facts.get("user_statement"), clean_text[:600]
        )

        if question_key and question_key not in ("location", "work_type") and len(clean_text) > 40:
            if not any(key in updates for key in ("owed_amount", "paid_amount", "agreed_amount")):
                updates["notes"] = _append_note(current_facts.get("notes"), clean_text[:400])

        meta["question_key"] = question_key
        return {key: value for key, value in updates.items() if value is not None}, meta

    @staticmethod
    def _detect_work_type(text: str) -> str | None:
        for label, keywords in WORK_TYPE_RULES:
            if any(keyword in text for keyword in keywords):
                return label
        return None

    @staticmethod
    def _looks_like_work_type(text: str) -> bool:
        cleaned = _clean(text)
        if not (1 < len(cleaned) <= 8):
            return False
        blockers = (
            "我", "他", "包工头", "老板", "工资", "欠", "没", "不", "介绍", "安排",
            "合同", "微信", "证据", "项目", "工地", "公司", "一天", "月",
        )
        if any(blocker in cleaned for blocker in blockers):
            return False
        return not any(char in cleaned for char in "，。,.；;：:！!？?")

    def _extract_period(self, text: str, updates: dict, question_key: str | None) -> None:
        dates = re.findall(r"(20\d{2})\s*年\s*(\d{1,2})\s*月", text)
        normalized = [f"{year}-{int(month):02d}" for year, month in dates]
        if len(normalized) >= 2:
            updates["work_start"] = normalized[0]
            updates["work_end"] = normalized[-1]
        elif len(normalized) == 1:
            before = text[: text.find(dates[0][0])]
            after = text[text.find(dates[0][0]) + len(dates[0][0]) :]
            if any(marker in after[:16] for marker in ("到", "至", "干到")):
                updates["work_end"] = normalized[0]
            elif any(marker in before[-8:] for marker in ("到", "至")):
                updates["work_end"] = normalized[0]
            else:
                updates["work_start"] = normalized[0]

        duration_context = any(
            marker in text for marker in ("干了", "做了", "工作", "干了活", "待了", "上了", "月", "天")
        )
        months, raw = parse_duration_months(text)
        if months and (duration_context or question_key in ("period", "work_period")):
            updates["duration_months"] = months
            updates["duration_text"] = raw
        elif question_key == "period" and re.search(r"(不到|不满)?\s*一个月", text):
            updates["duration_text"] = "不到一个月"
            updates["duration_months"] = 0.5

        if not updates.get("duration_text") and question_key == "period":
            if any(marker in text for marker in ("月", "天", "年", "干", "做", "工作", "左右", "记不清", "跳过")):
                updates["duration_text"] = _clean(text)[:40]

    def _extract_recruiter(self, text: str, updates: dict, question_key: str | None) -> None:
        if any(marker in text for marker in ("包工头", "工头")):
            updates["recruiter_type"] = "包工头"
        elif "劳务" in text:
            updates["recruiter_type"] = "劳务公司"
        elif any(marker in text for marker in ("项目部", "施工单位", "公司")):
            updates["recruiter_type"] = "施工企业/项目部"
        elif any(marker in text for marker in ("熟人", "老乡", "朋友", "亲戚")):
            updates["recruiter_type"] = "熟人介绍（单位不明）"
        elif question_key == "recruiter" and any(marker in text for marker in ("不知道", "不清楚")):
            updates["recruiter_type"] = "不清楚"

        name_patterns = [
            r"(?:包工头|工头|老板)(?:叫|名叫|是|姓)\s*([\u4e00-\u9fa5]{2,4})",
            r"([\u4e00-\u9fa5])老板",
        ]
        stop_names = {"我", "的", "老", "板", "大", "小", "那", "这", "他", "她", "还", "欠"}
        for pattern_index, pattern in enumerate(name_patterns):
            match = re.search(pattern, text)
            if match:
                candidate = match.group(1)
                if candidate not in stop_names and not candidate.endswith(("老板", "包工头")):
                    if pattern_index == 1:
                        candidate = f"{candidate}老板"
                    updates["recruiter_name"] = candidate
                    break

        company = COMPANY_PATTERN.search(text)
        if company:
            if any(marker in text for marker in ("劳务", "分包")):
                updates["subcontractor_name"] = company.group(1)
                updates["recruiter_type"] = updates.get("recruiter_type") or "劳务公司"
            elif any(marker in text for marker in ("总包", "总承包", "施工总承包")):
                updates["contractor_name"] = company.group(1)

    def _extract_manager(self, text: str, updates: dict, question_key: str | None) -> None:
        role: str | None = None
        management_markers = ("安排活", "安排工作", "派活", "管我", "管理", "考勤", "记工", "带班", "指挥")
        if any(marker in text for marker in ("同一个包工头", "还是包工头", "包工头管", "包工头安排")):
            role = "包工头"
        elif ("包工头" in text or "工头" in text) and (
            question_key == "manager" or any(marker in text for marker in management_markers)
        ):
            role = "包工头"
        elif any(marker in text for marker in ("项目部", "施工员", "技术员", "工地管理")):
            role = "项目部"
        elif "劳务公司" in text or "公司" in text:
            role = "劳务公司"
        elif question_key == "manager" and any(marker in text for marker in ("不清楚", "不知道", "说不清")):
            role = "不清楚"
        if role:
            updates["manager_role"] = role
        elif question_key == "manager":
            updates["manager_role"] = "待核实"

    def _extract_wage(
        self,
        text: str,
        updates: dict,
        question_key: str | None,
        current_facts: dict,
    ) -> None:
        if any(marker in text for marker in ("按天", "一天", "每天", "日薪")):
            updates["wage_basis"] = "按天"
        elif any(marker in text for marker in ("按月", "月薪", "每个月", "每月")):
            updates["wage_basis"] = "按月"
        elif any(marker in text for marker in ("计件", "按件", "平方", "平米")):
            updates["wage_basis"] = "计件/按平方"
        elif any(marker in text for marker in ("一口价", "包工价", "包死", "包干价")):
            updates["wage_basis"] = "包工价"
        elif question_key == "wage_basis" and any(marker in text for marker in ("不知道", "不清楚")):
            updates["wage_basis"] = "不清楚"

        matches = find_money(text)
        if not matches:
            if question_key in ("owed_amount", "amounts"):
                existing_note = current_facts.get("owed_amount_note")
                updates["owed_amount_note"] = _append_note(existing_note, _clean(text)[:80])
            return

        if any(marker in text for marker in ("一分没给", "一分钱没给", "没给过钱", "没发过工资", "没给过工资")):
            updates["paid_amount"] = 0

        owed_markers = ("欠", "拖欠", "没给", "未付", "还差", "剩下", "欠着", "应付未付")
        paid_markers = ("给了", "已付", "已支付", "已经给", "付了", "拿到", "发了", "结算了", "支付了", "先给")
        agreed_markers = ("一共", "总共", "应发", "说好", "答应", "该给", "约定", "合计", "工资是", "工资")
        daily_markers = ("一天", "每天", "日薪")
        monthly_markers = ("一个月", "每月", "月薪")

        used: set[int] = set()
        for index, match in enumerate(matches):
            before = context_before(text, match, 18)
            after = context_after(text, match, 6)
            window = before
            if not any(marker in before for marker in owed_markers + paid_markers + agreed_markers):
                if after.lstrip().startswith(("没给", "没付", "未付", "不给", "欠着")):
                    window = before + after
            raw_note = match.raw
            if any(marker in window for marker in daily_markers) and "daily_wage" not in updates:
                updates["daily_wage"] = match.value
                updates["wage_basis"] = updates.get("wage_basis") or "按天"
                used.add(index)
                continue
            if any(marker in window for marker in monthly_markers) and "monthly_wage" not in updates:
                updates["monthly_wage"] = match.value
                updates["wage_basis"] = updates.get("wage_basis") or "按月"
                used.add(index)
                continue
            if any(marker in window for marker in owed_markers) and "owed_amount" not in updates:
                updates["owed_amount"] = match.value
                updates["owed_amount_approx"] = match.approximate
                updates["owed_amount_note"] = f"用户表述：{raw_note}"
                used.add(index)
                continue
            if any(marker in window for marker in paid_markers) and "paid_amount" not in updates:
                updates["paid_amount"] = match.value
                used.add(index)
                continue
            if any(marker in window for marker in agreed_markers) and "agreed_amount" not in updates:
                updates["agreed_amount"] = match.value
                used.add(index)

        if question_key in ("owed_amount", "amounts") and "owed_amount" not in updates:
            remaining = [match for index, match in enumerate(matches) if index not in used]
            if remaining and "owed_amount" not in current_facts:
                match = remaining[-1]
                updates["owed_amount"] = match.value
                updates["owed_amount_approx"] = match.approximate
                updates["owed_amount_note"] = f"用户表述：{match.raw}"

    def _extract_contract(self, text: str, updates: dict, question_key: str | None) -> None:
        negative = any(
            marker in text
            for marker in ("没签", "没有签", "未签", "没合同", "没有合同", "没有书面", "没书面")
        )
        positive = any(
            marker in text
            for marker in ("签了", "签过", "签合同", "有合同", "签的合同", "签了协议", "有协议")
        ) and not negative
        unknown = any(marker in text for marker in ("不知道", "不清楚", "记不清", "忘了"))
        if negative:
            updates["has_contract"] = "no"
        elif positive:
            updates["has_contract"] = "yes"
        elif unknown and any(marker in text for marker in ("合同", "协议")):
            updates["has_contract"] = "unknown"

    def _extract_evidence(self, text: str, updates: dict, question_key: str | None) -> None:
        if question_key == "manager" and not any(marker in text for marker in ("我有", "手里有", "保存", "保留", "拿到")):
            return
        if "跳过" in text:
            return
        if question_key != "evidence" and not any(
            keyword in text for _, keywords in EVIDENCE_RULES for keyword in keywords
        ):
            return
        if any(
            marker in text
            for marker in ("没有证据", "啥也没有", "什么都没有", "没留", "没有任何材料", "都没有", "没有材料")
        ):
            updates["evidence"] = []
            updates["evidence_status"] = "none"
            return
        found: list[str] = []
        for key, keywords in EVIDENCE_RULES:
            if any(keyword in text for keyword in keywords):
                found.append(key)
        if found:
            updates["evidence"] = found
            updates["evidence_status"] = "some"
        elif question_key == "evidence":
            if any(marker in text for marker in ("没有", "无")):
                updates["evidence"] = []
                updates["evidence_status"] = "none"
            else:
                updates["evidence_other"] = _clean(text)[:120]

    def _extract_project(self, text: str, updates: dict, question_key: str | None) -> None:
        project = PROJECT_PATTERN.search(text)
        if project:
            updates["project_name"] = _clean(project.group(1))
            updates["project_info_status"] = "partial"
        for company_match in COMPANY_PATTERN.finditer(text):
            company = company_match.group(1)
            window = text[max(0, company_match.start() - 8) : company_match.end() + 8]
            if any(marker in window for marker in ("总包", "总承包", "施工总承包")):
                updates["contractor_name"] = company
                updates["project_info_status"] = "partial"
            elif any(marker in window for marker in ("分包", "劳务")):
                updates["subcontractor_name"] = company
                updates["project_info_status"] = "partial"
            elif any(marker in window for marker in ("建设单位", "开发商", "业主")):
                updates["developer_name"] = company
                updates["project_info_status"] = "partial"
        if question_key == "project_info":
            if "跳过" in text:
                return
            if any(marker in text for marker in ("不知道", "不清楚", "没有注意", "没注意")):
                updates["project_info_status"] = "unknown"
            elif not updates.get("project_info_status"):
                updates["project_info_status"] = "partial"
                updates["notes"] = _append_note(None, f"项目信息：{_clean(text)[:120]}")

    def _extract_prior_report(self, text: str, updates: dict, question_key: str | None) -> None:
        negative = any(
            marker in text
            for marker in ("没找过", "没有找", "没投诉", "没有投诉", "没反映", "没有反映", "没报过", "没找", "没去")
        )
        positive = any(
            marker in text
            for marker in ("找过", "投诉过", "反映过", "12345", "12333", "劳动监察", "劳动局", "报过警")
        )
        if negative:
            updates["prior_report"] = "no"
        elif positive:
            updates["prior_report"] = "yes"
            updates["prior_report_detail"] = _clean(text)[:160]

    def _extract_contacts(self, text: str, updates: dict, question_key: str | None) -> None:
        phones = PHONE_PATTERN.findall(text)
        if not phones:
            return
        if any(marker in text for marker in ("包工头", "老板", "他电话", "负责人")):
            updates["recruiter_phone"] = phones[0]
        else:
            updates["contact_phone"] = phones[0]
