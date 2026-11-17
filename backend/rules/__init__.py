"""Region, channel and intake rules (data lives under /knowledge)."""

from backend.rules.regions import REGION_INDEX, detect_location, get_region_tree

__all__ = ["REGION_INDEX", "detect_location", "get_region_tree"]
