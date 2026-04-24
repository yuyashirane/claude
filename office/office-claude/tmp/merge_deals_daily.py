"""Merge fetched deals pages for デイリーユニフォーム (10794380) 2025-06 to 2025-12."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from scripts.e2e.freee_fetch import merge_deals_pages, save_json, validate_completeness

TR = r"C:/Users/yuya_/.claude/projects/C--Users-yuya--claude/53f6e805-5e10-4474-8f86-697fe74c9c38/tool-results"

# Files in order: offset 0, 100, 200, ..., 2000
PAGE_FILES = [
    TR + "/mcp-freee-mcp-freee_api_get-1776952211168.txt",   # offset 0
    TR + "/mcp-freee-mcp-freee_api_get-1776952346688.txt",   # offset 100
    TR + "/mcp-freee-mcp-freee_api_get-1776952399987.txt",   # offset 200
    TR + "/mcp-freee-mcp-freee_api_get-1776952402145.txt",   # offset 300
    TR + "/mcp-freee-mcp-freee_api_get-1776952403925.txt",   # offset 400
    TR + "/mcp-freee-mcp-freee_api_get-1776952406329.txt",   # offset 500
    TR + "/mcp-freee-mcp-freee_api_get-1776952408127.txt",   # offset 600
    TR + "/mcp-freee-mcp-freee_api_get-1776952417097.txt",   # offset 700
    TR + "/mcp-freee-mcp-freee_api_get-1776952418561.txt",   # offset 800
    TR + "/mcp-freee-mcp-freee_api_get-1776952420294.txt",   # offset 900
    TR + "/mcp-freee-mcp-freee_api_get-1776952422150.txt",   # offset 1000
    TR + "/mcp-freee-mcp-freee_api_get-1776952423914.txt",   # offset 1100
    TR + "/mcp-freee-mcp-freee_api_get-1776952430153.txt",   # offset 1200
    TR + "/mcp-freee-mcp-freee_api_get-1776952432450.txt",   # offset 1300
    TR + "/mcp-freee-mcp-freee_api_get-1776952434104.txt",   # offset 1400
    TR + "/mcp-freee-mcp-freee_api_get-1776952435856.txt",   # offset 1500
    TR + "/mcp-freee-mcp-freee_api_get-1776952437977.txt",   # offset 1600
    TR + "/mcp-freee-mcp-freee_api_get-1776952444950.txt",   # offset 1700
    TR + "/mcp-freee-mcp-freee_api_get-1776952446733.txt",   # offset 1800
    TR + "/mcp-freee-mcp-freee_api_get-1776952448278.txt",   # offset 1900
    TR + "/mcp-freee-mcp-freee_api_get-1776952449687.txt",   # offset 2000
]


def load_page(filepath: str) -> dict:
    with open(filepath, encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return raw
    # list of content blocks
    text = "".join(
        x.get("text", "") for x in raw
        if isinstance(x, dict) and x.get("type") == "text"
    )
    return json.loads(text)


def main() -> int:
    pages = []
    total = 0
    for i, fp in enumerate(PAGE_FILES):
        data = load_page(fp)
        n = len(data.get("deals", []))
        total += n
        pages.append(data)
        print(f"offset {i*100:4d}: {n} deals")

    print(f"\naggregate before merge: {total}")

    # merge_deals_pages validates total_count == actual count
    # total_count comes from page 0 meta
    first_total = pages[0].get("meta", {}).get("total_count")
    print(f"API total_count: {first_total}")

    if total != first_total:
        print(f"WARNING: mismatch {total} != {first_total}, skipping strict merge")
        merged = {"deals": [], "meta": {"total_count": total}}
        for p in pages:
            merged["deals"].extend(p.get("deals", []))
    else:
        merged = merge_deals_pages(pages)

    report = validate_completeness(merged, expected_count=first_total)
    print("validate_completeness:", report)

    out = Path("data/e2e/10794380/2025-12/deals_2025-06_to_2025-12.json")
    save_json(merged, out)
    print(f"\nSaved: {out} ({len(merged['deals'])} deals)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
