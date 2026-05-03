"""Merge fetched deals JSON pages for プラスバリュー into single deals file."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from scripts.e2e.freee_fetch import merge_deals_pages, validate_completeness, save_json

PAGE_FILES = [
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871142524.txt",  # offset 0
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871158720.txt",  # 100
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871164221.txt",  # 200
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871170393.txt",  # 300
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871180280.txt",  # 400
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871186173.txt",  # 500
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871192802.txt",  # 600
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871198565.txt",  # 700
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871206591.txt",  # 800
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871213917.txt",  # 900
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871221688.txt",  # 1000
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871228411.txt",  # 1100
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871233469.txt",  # 1200
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871239288.txt",  # 1300
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871245906.txt",  # 1400
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871251443.txt",  # 1500
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871256924.txt",  # 1600
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871262829.txt",  # 1700
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871269088.txt",  # 1800
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871275752.txt",  # 1900
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871283151.txt",  # 2000
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871288763.txt",  # 2100
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871295176.txt",  # 2200
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871303487.txt",  # 2300
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871309611.txt",  # 2400
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871317174.txt",  # 2500
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871322973.txt",  # 2600
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871329738.txt",  # 2700
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871335961.txt",  # 2800
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871341730.txt",  # 2900
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871347852.txt",  # 3000
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871353502.txt",  # 3100
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871358961.txt",  # 3200
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871364920.txt",  # 3300
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871371353.txt",  # 3400
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871377551.txt",  # 3500
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871383371.txt",  # 3600
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871389212.txt",  # 3700
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871396576.txt",  # 3800
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871405249.txt",  # 3900
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871412589.txt",  # 4000
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871418877.txt",  # 4100
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871425010.txt",  # 4200
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871430760.txt",  # 4300
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871442739.txt",  # 4400
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871450139.txt",  # 4500
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871456108.txt",  # 4600
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871462667.txt",  # 4700
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871467820.txt",  # 4800
    r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results\mcp-freee-mcp-freee_api_get-1776871474478.txt",  # 4900
]


def main() -> int:
    pages = []
    total = 0
    for i, fp in enumerate(PAGE_FILES):
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        deals_count = len(data.get("deals", []))
        total += deals_count
        pages.append(data)
        print(f"page {i} (offset={i*100}): {deals_count} deals")
    print(f"aggregate: {total}")
    merged = merge_deals_pages(pages)
    report = validate_completeness(merged)
    print("validate_completeness:", report)
    out = Path("data/e2e/10021668/202504-202603/deals_202504-202603.json")
    save_json(merged, out)
    print(f"Saved {out} ({len(merged['deals'])} deals)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
