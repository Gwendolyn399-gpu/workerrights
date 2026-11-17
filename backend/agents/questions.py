from backend.rules.regions import REGION_INDEX, resolve_city
from backend.services.facts import format_amount

EVIDENCE_QUICK_REPLIES = [
    {"label": "微信聊天记录"},
    {"label": "考勤记录"},
    {"label": "工资表/结算单"},
    {"label": "转账记录"},
    {"label": "欠条"},
    {"label": "工作照片/视频"},
    {"label": "工牌/门禁卡"},
    {"label": "工友证言"},
    {"label": "通话录音"},
    {"label": "都没有"},
]


def _q(
    key: str,
    text: str,
    helper: str = "",
    quick: list[str] | None = None,
    *,
    multi_select: bool = False,
    optional: bool = False,
) -> dict:
    return {
        "key": key,
        "text": text,
        "helper": helper,
        "quick_replies": [{"label": item, "value": item} for item in (quick or [])],
        "multi_select": multi_select,
        "optional": optional,
    }


def district_question(facts: dict) -> dict:
    city = resolve_city(facts.get("location_city"))
    if not city:
        return _q(
            "district",
            "具体在哪个区县或工地？",
            "说个大概位置也可以，后面还能修改。",
            optional=True,
        )
    names = list(city["districts"].keys())[:8]
    return _q(
        "district",
        f"具体在{city['name']}哪个区/县？",
        "区县信息用于匹配项目所在地的受理机构；不确定可以选“不确定”。",
        names + ["不确定具体区县"],
        optional=True,
    )


def owed_confirm_question(facts: dict) -> dict:
    agreed = facts.get("agreed_amount")
    paid = facts.get("paid_amount")
    difference = max(float(agreed or 0) - float(paid or 0), 0)
    return _q(
        "owed_confirm",
        f"按你说的，应发 {format_amount(agreed)}、已付 {format_amount(paid)}，"
        f"还差约 {format_amount(difference)}。这个数对吗？",
        "如果不对，直接重新说欠款金额就行。",
        ["对，大约是这个数", "不对，我重新说"],
    )


def confirm_question() -> dict:
    return _q(
        "confirm",
        "案件信息已经整理好了，请先核对右侧的“案件信息”。确认后我再生成案件分析和维权步骤。",
        "如果哪项不对，可以点“修改案件信息”直接改。",
        ["信息无误，生成分析", "我要修改信息"],
    )


def get_question(key: str, facts: dict, attempts: int = 0) -> dict | None:
    if key == "location":
        question = _q(
            "location",
            "先说说你在哪儿干活：在河南哪个城市、哪个工地？",
            "说个城市或工地名字就行，比如“郑州金水区”。",
            ["郑州", "洛阳", "开封", "南阳", "其他河南城市"],
        )
    elif key == "district":
        question = district_question(facts)
    elif key == "work_type":
        question = _q(
            "work_type",
            "你在工地主要做什么活？",
            "比如钢筋、木工、瓦工、水电、架子、杂工。",
            ["钢筋工", "木工", "瓦工", "水电工", "架子工", "杂工"],
        )
    elif key == "period":
        question = _q(
            "period",
            "从什么时候干到什么时候？大概干了多久？",
            "记不清具体日期就说个大概，比如“去年3月到6月，干了3个多月”。",
            ["不到1个月", "1-3个月左右", "3-6个月左右", "半年以上"],
        )
    elif key == "recruiter":
        question = _q(
            "recruiter",
            "当初是谁介绍或招你到这个工地干活的？",
            "是包工头、劳务公司，还是工地项目部？",
            ["包工头", "劳务公司", "工地项目部", "熟人介绍，单位不清楚"],
        )
    elif key == "manager":
        question = _q(
            "manager",
            "平时是谁给你安排活、记考勤、管你？",
            "这有助于判断谁直接管理你，不用担心说得不准确。",
            ["同一个包工头", "项目部的人", "劳务公司", "说不清"],
        )
    elif key == "wage_basis":
        question = _q(
            "wage_basis",
            "工资是怎么算的？",
            "按天、按月、计件，还是一口价？",
            ["按天算", "按月算", "计件或按平方", "一口价/包工"],
        )
    elif key == "amounts":
        question = _q(
            "amounts",
            "他们一共该给你多少，已经给了多少，现在还欠多少？",
            "可以分开说，比如“一共3万，给了1万，还欠2万”。不确定就说大概。",
        )
    elif key == "paid_amount":
        question = _q(
            "paid_amount",
            "到现在为止，老板已经给过你多少钱？",
            "一分没给也可以直接说，金额不确定就说大概。",
            ["一分没给", "给过一部分", "记不清了"],
        )
    elif key == "agreed_amount":
        question = _q(
            "agreed_amount",
            "你们说好的工资总额大概是多少？",
            "不是已付金额，而是按工天/单价算出的应发总额；不确定可以跳过。",
        )
    elif key == "owed_amount":
        question = _q(
            "owed_amount",
            "现在还欠你多少钱？说个大概就行。",
            "金额不确定可以写“约两万”，后面还能修改。",
        )
    elif key == "owed_confirm":
        question = owed_confirm_question(facts)
    elif key == "contract":
        question = _q(
            "contract",
            "你们签劳动合同或者书面协议了吗？",
            "没签也不影响继续维权，只是需要更多其他材料。",
            ["签了", "没签", "不清楚"],
        )
    elif key == "evidence":
        question = _q(
            "evidence",
            "你手里有哪些能证明干活和欠薪的材料？可以多选。",
            "没有某项也没关系，缺少材料不等于不能维权。",
            [item["label"] for item in EVIDENCE_QUICK_REPLIES],
            multi_select=True,
        )
    elif key == "project_info":
        question = _q(
            "project_info",
            "你知道这个工地的项目名称，或者施工总承包单位吗？",
            "可以从工地大门公示牌、工牌、工资表上找；不知道就跳过。",
            ["知道，我来补充", "不知道", "只有工地位置", "跳过"],
            optional=True,
        )
    elif key == "prior_report":
        question = _q(
            "prior_report",
            "之前有没有找过劳动监察、12345或者项目部反映？",
            "这会影响我推荐先走哪个渠道。",
            ["没找过", "找过项目部", "找过劳动监察", "找过12345", "跳过"],
            optional=True,
        )
    elif key == "confirm":
        question = confirm_question()
    else:
        return None

    if attempts >= 2 and key not in ("owed_confirm", "confirm"):
        question["text"] = "我还没完全听明白，我们换个简单的方式。" + question["text"]
        question["helper"] = "直接点下面的选项，或者用一句短话说清楚就可以。"
    return question


def is_unknown_answer(text: str) -> bool:
    return any(
        marker in text
        for marker in ("不知道", "不清楚", "记不清", "说不清", "忘了", "不确定", "没注意", "想不起来")
    )


def city_names() -> list[str]:
    return [city["name"] for city in REGION_INDEX.values()]
