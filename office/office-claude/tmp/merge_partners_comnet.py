"""Merge fetched partners pages for コムネットシステム into partners_all.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from scripts.e2e.freee_fetch import normalize_partners, save_json

TR = r"C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\a057b20b-bb97-452a-b29f-c555a8b36456\tool-results"

PAGE_FILES = [
    (TR + r"\mcp-freee-mcp-freee_api_get-1776872793605.txt", "raw"),     # offset 0
    (TR + r"\mcp-freee-mcp-freee_api_get-1776872798625.txt", "raw"),     # offset 100
    (TR + r"\toolu_01NyzuXwrLQReieeGfQ3u5vC.json", "wrapped"),           # offset 200
    (TR + r"\toolu_01TB9ov2G3qcr1cWwHqa4qMo.json", "wrapped"),           # offset 300
    (TR + r"\mcp-freee-mcp-freee_api_get-1776872891253.txt", "raw"),     # offset 400, limit 300
]


def load_page(fp: str, fmt: str) -> dict:
    with open(fp, encoding="utf-8") as f:
        raw = json.load(f)
    if fmt == "raw":
        return raw
    # wrapped: [{"type":"text","text":"<json>"}]
    if isinstance(raw, list) and raw and "text" in raw[0]:
        return json.loads(raw[0]["text"])
    raise ValueError(f"Unexpected format for {fp}")


def main() -> int:
    pages = []
    for fp, fmt in PAGE_FILES:
        data = load_page(fp, fmt)
        n = len(data.get("partners", []))
        pages.append(data)
        print(f"{Path(fp).name}: {n} partners")
    partners = normalize_partners(pages)
    ids = [p["id"] for p in partners]
    dup = len(ids) - len(set(ids))
    print(f"total: {len(partners)} (duplicates: {dup})")
    if dup:
        # 400-499 overlap is possible if offset 400 file is limit 300 AND 400 file exists
        uniq = {}
        for p in partners:
            uniq[p["id"]] = p
        partners = list(uniq.values())
        print(f"after dedup: {len(partners)}")
    out = Path("data/e2e/1362187_comnet-system/202504-202603/partners_all.json")
    save_json(partners, out)
    print(f"Saved {out} ({len(partners)} partners)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
