from functools import lru_cache

from backend.legal.loader import load_regions


@lru_cache(maxsize=1)
def get_region_tree() -> dict:
    return load_regions()


def _build_alias_index() -> dict:
    tree = get_region_tree()
    index: dict[str, dict] = {}
    for city in tree["cities"]:
        city_info = {
            "id": f"henan-{city['code']}",
            "name": city["name"],
            "short": city["name"].removesuffix("市"),
            "districts": {},
        }
        for position, district in enumerate(city["districts"], start=1):
            if isinstance(district, str):
                name, code = district, None
            else:
                name, code = district[0], district[1]
            city_info["districts"][name] = {
                "id": f"henan-{city['code']}-{position:02d}",
                "name": name,
                "official_code": code,
            }
        index[city["name"]] = city_info
    return index


REGION_INDEX = _build_alias_index()


def _city_alias(city_name: str) -> list[str]:
    short = city_name.removesuffix("市")
    aliases = [city_name]
    if short and short != city_name:
        aliases.append(short)
    return aliases


def detect_location(text: str) -> dict:
    """Detect a Henan city/district from free text without guessing outside scope."""
    result = {
        "location_province": None,
        "location_city": None,
        "location_district": None,
    }
    if not text:
        return result
    if "河南" in text:
        result["location_province"] = "河南省"

    matched_city: dict | None = None
    matched_city_name: str | None = None
    for city_name, city_info in REGION_INDEX.items():
        if any(alias in text for alias in _city_alias(city_name)):
            matched_city = city_info
            matched_city_name = city_name
            break
    if not matched_city:
        return result

    result["location_province"] = "河南省"
    result["location_city"] = matched_city["name"]
    district_hits: list[tuple[int, str]] = []
    for district_name in matched_city["districts"]:
        if district_name in text:
            district_hits.append((len(district_name), district_name))
            continue
        short = district_name
        for suffix in ("回族区", "区", "县", "市"):
            if short.endswith(suffix) and len(short) > len(suffix) + 1:
                short = short[: -len(suffix)]
                break
        if short != district_name and len(short) >= 2 and short in text:
            district_hits.append((len(short), district_name))
    if district_hits:
        district_hits.sort(reverse=True)
        result["location_district"] = district_hits[0][1]
    return result


def resolve_city(city_name: str | None) -> dict | None:
    if not city_name:
        return None
    for name, info in REGION_INDEX.items():
        if city_name in (name, name.removesuffix("市")):
            return info
    return None


def resolve_district(city_name: str | None, district_name: str | None) -> dict | None:
    city = resolve_city(city_name)
    if not city or not district_name:
        return None
    if district_name in city["districts"]:
        return city["districts"][district_name]
    for name, info in city["districts"].items():
        if district_name in name or name in district_name:
            return info
    return None
