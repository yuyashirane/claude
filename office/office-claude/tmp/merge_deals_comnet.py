"""Merge fetched deals pages for コムネットシステム into deals_202504-202603.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from scripts.e2e.freee_fetch import merge_deals_pages, save_json, validate_completeness

TR = r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results"

# Pages offset 0 through 1800, each limit=100
PAGE_FILES = [
    TR + r"\mcp-freee-mcp-freee_api_get-1776872991122.txt",  # 0
    TR + r"\mcp-freee-mcp-freee_api_get-1776872997546.txt",  # 100
    TR + r"\mcp-freee-mcp-freee_api_get-1776873002304.txt",  # 200
    TR + r"\mcp-freee-mcp-freee_api_get-1776873007442.txt",  # 300
    TR + r"\mcp-freee-mcp-freee_api_get-1776873012802.txt",  # 400
    TR + r"\mcp-freee-mcp-freee_api_get-1776873019314.txt",  # 500
    TR + r"\mcp-freee-mcp-freee_api_get-1776873024833.txt",  # 600
    TR + r"\mcp-freee-mcp-freee_api_get-1776873030364.txt",  # 700
    TR + r"\mcp-freee-mcp-freee_api_get-1776873036924.txt",  # 800
    TR + r"\mcp-freee-mcp-freee_api_get-1776873042313.txt",  # 900
    TR + r"\mcp-freee-mcp-freee_api_get-1776873048290.txt",  # 1000
    TR + r"\mcp-freee-mcp-freee_api_get-1776873056037.txt",  # 1100
    TR + r"\mcp-freee-mcp-freee_api_get-1776873061446.txt",  # 1200
    TR + r"\mcp-freee-mcp-freee_api_get-1776873066265.txt",  # 1300
    TR + r"\mcp-freee-mcp-freee_api_get-1776873071372.txt",  # 1400
    TR + r"\mcp-freee-mcp-freee_api_get-1776873077235.txt",  # 1500
    TR + r"\mcp-freee-mcp-freee_api_get-1776873082703.txt",  # 1600
    TR + r"\mcp-freee-mcp-freee_api_get-1776873088338.txt",  # 1700
    TR + r"\mcp-freee-mcp-freee_api_get-1776873093808.txt",  # 1800
    "tmp/deals_offset_1900_comnet.json",                     # 1900 (inline saved manually)
]


def main() -> int:
    pages = []
    total = 0
    for i, fp in enumerate(PAGE_FILES):
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        n = len(data.get("deals", []))
        total += n
        pages.append(data)
        print(f"page {i} (offset={i*100}): {n} deals")
    print(f"aggregate: {total}")

    merged = merge_deals_pages(pages)
    report = validate_completeness(merged)
    print("validate_completeness:", report)

    out = Path("data/e2e/1362187_comnet-system/202504-202603/deals_202504-202603.json")
    save_json(merged, out)
    print(f"Saved {out} ({len(merged['deals'])} deals)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
