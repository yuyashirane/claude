"""Merge partners pages for デイリーユニフォーム (10794380)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, ".")
from scripts.e2e.freee_fetch import normalize_partners, save_json

TR = r"C:/Users/yuya_/.claude/projects/C--Users-yuya--claude/53f6e805-5e10-4474-8f86-697fe74c9c38/tool-results"


def load_page(filepath: str) -> dict:
    with open(filepath, encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return raw
    # list of content blocks format
    text = "".join(x.get("text", "") for x in raw if isinstance(x, dict) and x.get("type") == "text")
    return json.loads(text)


def main() -> int:
    # page 1 already saved as array
    with open("data/e2e/10794380/2025-12/partners_all.json", encoding="utf-8") as f:
        p1_arr = json.load(f)
    p1 = {"partners": p1_arr}

    # page 2 (offset=100)
    p2 = load_page(TR + "/mcp-freee-mcp-freee_api_get-1776952208060.txt")

    # page 3 (offset=200)
    p3 = load_page(TR + "/toolu_016CRXkcQz1n1GwJE6p6g1pd.json")

    pages = [p1, p2, p3]
    for i, p in enumerate(pages):
        print(f"page{i+1}: {len(p.get('partners', []))} 件")

    all_partners = normalize_partners(pages)
    print(f"total partners: {len(all_partners)}")

    save_json(all_partners, Path("data/e2e/10794380/2025-12/partners_all.json"))
    print("partners_all.json saved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
