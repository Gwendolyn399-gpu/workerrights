"""Extract only the provisional reply string from streamed respond arguments."""
import json
import re


def partial_reply(arguments: str) -> str:
    match = re.search(r'(?<!\\)"reply"\s*:\s*"', arguments)
    if not match:
        return ""
    start = match.end() - 1
    escaped = False
    for end in range(start + 1, len(arguments)):
        char = arguments[end]
        if char == '"' and not escaped:
            return json.loads(arguments[start:end + 1])
        if char == "\\" and not escaped:
            escaped = True
        else:
            escaped = False
    # An escape/unicode sequence may be split between network chunks.
    for trim in range(min(12, len(arguments) - start)):
        prefix = arguments[start:len(arguments) - trim]
        try:
            return json.loads(prefix + '"')
        except json.JSONDecodeError:
            continue
    return ""
