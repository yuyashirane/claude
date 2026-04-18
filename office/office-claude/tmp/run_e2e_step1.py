"""E2E Step 1: freee 取得データを処理して 5 JSON ファイルを保存"""
import sys, json
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
from scripts.e2e.freee_fetch import save_json, normalize_partners, merge_deals_pages, validate_completeness

TOOL = Path(r'C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\b750f521-90aa-41e2-ae01-369f95bc3d48\tool-results')
OUT  = ROOT / 'data' / 'e2e' / '3525430' / '202512'
TMP  = ROOT / 'tmp'


def load(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list) and data and 'text' in data[0]:
        return json.loads(data[0]['text'])
    return data


# [1] company_info
info = {
    "company_id": 3525430,
    "company_name": "アントレッド株式会社",
    "fiscal_year_id": 9842248,
    "fiscal_year_start": "2025-04-01",
    "fiscal_year_end": "2026-03-31",
    "target_yyyymm": "202512",
}
save_json(info, OUT / "company_info.json")
print(f"[1] company_info.json: saved")
print(f"    6 keys: {list(info.keys())}")

# [2] account_items
ai = load(TOOL / "mcp-freee-mcp-freee_api_get-1776441473123.txt")["account_items"]
save_json(ai, OUT / "account_items_all.json")
print(f"[2] account_items_all.json: count={len(ai)}")

# [3] partners (3 pages + empty terminator)
p1 = load(TOOL / "toolu_01Ve49A2G7uG9FoWQoosgzMX.json")
p2 = load(TOOL / "mcp-freee-mcp-freee_api_get-1776441490524.txt")
p3 = load(TOOL / "toolu_01A86ZjbvuPiXUEZaPzM4doK.json")
c1, c2, c3 = len(p1['partners']), len(p2['partners']), len(p3['partners'])
print(f"    partners pages: {c1}+{c2}+{c3}={c1+c2+c3}")
partners = normalize_partners([p1, p2, p3, {"partners": []}])
save_json(partners, OUT / "partners_all.json")
print(f"[3] partners_all.json: count={len(partners)}")

# [4] deals (3 pages)
d1 = load(TOOL / "mcp-freee-mcp-freee_api_get-1776441503565.txt")
d2 = load(TOOL / "mcp-freee-mcp-freee_api_get-1776441524076.txt")
d3 = load(TMP  / "deals_page3.json")
c1, c2, c3 = len(d1['deals']), len(d2['deals']), len(d3['deals'])
print(f"    deals pages: {c1}+{c2}+{c3}={c1+c2+c3}")
merged = merge_deals_pages([d1, d2, d3])
rep = validate_completeness(merged)
save_json(merged, OUT / "deals_202512.json")
print(f"[4] deals_202512.json: total={rep['total']}, meta.total_count={merged['meta']['total_count']}")
print(f"    issue_date: {rep['issue_date_min']} ~ {rep['issue_date_max']}")
print(f"    details_empty_count={rep['details_empty_count']}")
print(f"    partner_id_null_count={rep['partner_id_null_count']}")
print(f"    warnings={rep['warnings']}")

# [5] taxes_codes — 既存ファイルを freshen（今回の inline 取得分は全コード確認済み）
existing = OUT / "taxes_codes.json"
if existing.exists():
    with open(existing, encoding='utf-8') as f:
        tc = json.load(f)
    print(f"[5] taxes_codes.json: reused existing, count={len(tc)}")
else:
    print("[5] taxes_codes.json: file not found, skip")

# 最終読み戻し
print("\n=== 最終 JSON 読み戻し検証 ===")
for fname in ["company_info.json","account_items_all.json","partners_all.json","deals_202512.json","taxes_codes.json"]:
    p = OUT / fname
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    size = p.stat().st_size
    print(f"  {fname}: OK ({size:,} bytes)")
print("Done.")
