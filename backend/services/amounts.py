"""Conservative Chinese money parsing.

Only amounts in an explicit money context are used. When a phrase is
approximate ("两万多"), the caller must keep the approximation flag and avoid
turning it into an exact figure in formal documents.
"""

import re
from dataclasses import dataclass

CN_DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
CN_UNITS = {"十": 10, "百": 100, "千": 1000, "万": 10000, "亿": 100000000}
MONEY_CHARS = "零〇一二两三四五六七八九十百千万亿"

ARABIC_MONEY = re.compile(
    r"(?<![\d.])(\d+(?:\.\d+)?)\s*(万|千|百)?\s*([一二三四五六七八九])?\s*(多|余|来|左右)?"
)
CN_MONEY = re.compile(rf"([{MONEY_CHARS}]+)\s*(多|余|来|左右)?")

APPROX_PREFIXES = ("大概", "大约", "约", "差不多", "将近", "接近", "不到")
MONEY_CONTEXT = ("元", "块", "钱", "工资", "工钱", "欠", "给", "付", "万", "千", "百", "一天", "每天", "日薪", "月薪", "每月", "单价")


@dataclass
class MoneyMatch:
    value: float
    raw: str
    start: int
    end: int
    approximate: bool


def cn_to_number(text: str) -> float | None:
    """Convert Chinese numerals, including colloquial short forms.

    "两万三" -> 23000, "三千五" -> 3500, "一百二" -> 120.
    """
    if not text:
        return None
    total = 0.0
    section = 0.0
    number = 0.0
    last_unit = 1
    seen = False
    for char in text:
        if char in CN_DIGITS:
            number = CN_DIGITS[char]
            seen = True
        elif char in CN_UNITS:
            unit = CN_UNITS[char]
            seen = True
            if unit >= 10000:
                if number == 0 and section == 0:
                    number = 1
                section = (section + number) * unit
                total += section
                section = 0
                number = 0
                last_unit = unit
            else:
                if number == 0:
                    number = 1
                section += number * unit
                number = 0
                last_unit = unit
        else:
            return None
    if not seen:
        return None
    if number:
        if last_unit >= 100 and "零" not in text:
            section += number * (last_unit / 10)
        else:
            section += number
    value = total + section
    return value if value > 0 else None


def _parse_token(raw: str) -> tuple[float | None, bool]:
    compact = raw.replace(" ", "")
    approximate = any(mark in compact for mark in ("多", "余", "来", "左右"))
    compact = re.sub(r"(多|余|来|左右)", "", compact)
    if not compact:
        return None, approximate

    if compact[0].isdigit():
        match = re.match(r"^(\d+(?:\.\d+)?)(万|千|百)?([一二三四五六七八九])?$", compact)
        if not match:
            return None, approximate
        base = float(match.group(1))
        unit_text = match.group(2)
        trailing = match.group(3)
        unit = CN_UNITS.get(unit_text, 1) if unit_text else 1
        value = base * unit
        if trailing and unit >= 100:
            value += CN_DIGITS[trailing] * (unit / 10)
        return value, approximate

    value = cn_to_number(compact)
    return value, approximate


def _is_money_context(text: str, start: int, end: int) -> bool:
    window = text[max(0, start - 6) : min(len(text), end + 6)]
    if any(marker in window for marker in MONEY_CONTEXT):
        return True
    # Bare numbers in a wage-intake answer, e.g. "300" or "两万三".
    stripped = re.sub(r"[\s，。,.、；;：:！!？?]", "", text)
    return bool(re.fullmatch(rf"[{MONEY_CHARS}\d.百千万]+(多|余|来|左右)?", stripped))


def find_money(text: str) -> list[MoneyMatch]:
    matches: list[MoneyMatch] = []
    occupied: list[tuple[int, int]] = []
    for match in ARABIC_MONEY.finditer(text):
        raw = match.group(0).strip()
        if not raw or raw in {"万", "千", "百"}:
            continue
        value, approximate = _parse_token(raw)
        if value is None:
            continue
        start, end = match.start(), match.end()
        # Avoid matching dates and durations.
        trailing = text[end : end + 2]
        if trailing.startswith(("年", "月", "日", "天", "个")):
            continue
        if value > 10_000_000:
            continue
        if not _is_money_context(text, start, end):
            continue
        prefix = text[max(0, start - 4) : start]
        approximate = approximate or any(word in prefix for word in APPROX_PREFIXES)
        matches.append(MoneyMatch(value, raw, start, end, approximate))
        occupied.append((start, end))

    for match in CN_MONEY.finditer(text):
        raw = match.group(0).strip()
        if any(raw.startswith(text[a:b]) for a, b in []):
            continue
        if any(not (match.end() <= a or match.start() >= b) for a, b in occupied):
            continue
        # Pure "一" / "两" is too ambiguous.
        if len(re.sub(r"[多余来左右]", "", raw)) < 2:
            continue
        start, end = match.start(), match.end()
        trailing = text[end : end + 2]
        if trailing.startswith(("年", "月", "日", "天", "个", "次", "人")):
            continue
        value, approximate = _parse_token(raw)
        if value is None or value > 10_000_000:
            continue
        if not _is_money_context(text, start, end):
            continue
        prefix = text[max(0, start - 4) : start]
        approximate = approximate or any(word in prefix for word in APPROX_PREFIXES)
        matches.append(MoneyMatch(value, raw, start, end, approximate))
    matches.sort(key=lambda item: item.start)
    return matches


def context_before(text: str, match: MoneyMatch, size: int = 14) -> str:
    return text[max(0, match.start - size) : match.start]


def context_after(text: str, match: MoneyMatch, size: int = 14) -> str:
    return text[match.end : match.end + size]


def parse_duration_months(text: str) -> tuple[float | None, str | None]:
    # "从2024年3月干到2024年6月" is handled by date extraction; this helper
    # focuses on explicit "三个月/半年/40天" statements.
    under_month = re.search(r"不到\s*(?:一|1)\s*个?月", text)
    if under_month:
        return 0.5, under_month.group(0)
    range_match = re.search(r"(\d+)\s*[-—~到至]\s*(\d+)\s*个?月", text)
    if range_match:
        low, high = float(range_match.group(1)), float(range_match.group(2))
        if 0 < low <= high <= 120:
            return round((low + high) / 2, 1), range_match.group(0)
    half_year = re.search(r"半年", text)
    if half_year:
        return 6.0, half_year.group(0)
    year = re.search(r"(\d+|[一二两三四五六七八九十]+)\s*年", text)
    if year and "年" in year.group(0):
        number_text = year.group(1)
        value = float(number_text) if number_text[0].isdigit() else cn_to_number(number_text)
        if value and 0 < value <= 10:
            return value * 12, year.group(0)
    month = re.search(r"(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?月", text)
    if month:
        raw = month.group(0)
        number_text = month.group(1)
        value = float(number_text) if number_text[0].isdigit() else cn_to_number(number_text)
        if value and value <= 120:
            return value, raw
    day = re.search(r"(\d+)\s*天", text)
    if day:
        days = float(day.group(1))
        if 0 < days <= 3650:
            return round(days / 30, 1), day.group(0)
    week = re.search(r"(\d+|[一二两三四五六七八九十]+)\s*(?:个)?星期", text)
    if week:
        raw = week.group(0)
        number_text = week.group(1)
        value = float(number_text) if number_text[0].isdigit() else cn_to_number(number_text)
        if value:
            return round(value * 7 / 30, 1), raw
    return None, None
