"""Step 1: freee 取得データを処理して 5 JSON ファイルを保存する"""
import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.e2e.freee_fetch import (
    save_json, normalize_partners, merge_deals_pages,
    validate_completeness, normalize_taxes_codes
)

TOOL_DIR = Path(r'C:\Users\yuya_\.claude\projects\C--Users-yuya--claude\b750f521-90aa-41e2-ae01-369f95bc3d48\tool-results')
OUT_DIR  = Path(__file__).parent.parent / 'data' / 'e2e' / '3525430' / '202512'


def load_tool_result(path):
    """wrapped (.json) と raw (.txt) 両形式に対応"""
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list) and data and isinstance(data[0], dict) and 'text' in data[0]:
        return json.loads(data[0]['text'])
    return data


# ─── [1] company_info ───
fy = {"id": 9842248, "start_date": "2025-04-01", "end_date": "2026-03-31"}
company_info = {
    "company_id": 3525430,
    "company_name": "アントレッド株式会社",
    "fiscal_year_id": fy["id"],
    "fiscal_year_start": fy["start_date"],
    "fiscal_year_end": fy["end_date"],
    "target_yyyymm": "202512",
}
save_json(company_info, OUT_DIR / "company_info.json")
print(f"[1] company_info.json: saved, keys={list(company_info.keys())}")

# ─── [2] account_items ───
ai_raw = load_tool_result(TOOL_DIR / "mcp-freee-mcp-freee_api_get-1776441473123.txt")
account_items = ai_raw["account_items"]
save_json(account_items, OUT_DIR / "account_items_all.json")
has_id   = 'id'   in account_items[0] if account_items else False
has_name = 'name' in account_items[0] if account_items else False
print(f"[2] account_items_all.json: count={len(account_items)}, id={has_id}, name={has_name}")

# ─── [3] partners ───
p1 = load_tool_result(TOOL_DIR / "toolu_01Ve49A2G7uG9FoWQoosgzMX.json")
p2 = load_tool_result(TOOL_DIR / "mcp-freee-mcp-freee_api_get-1776441490524.txt")
p3 = load_tool_result(TOOL_DIR / "toolu_01A86ZjbvuPiXUEZaPzM4doK.json")
p4 = {"partners": []}  # 空ページ（終端）
for i, page in enumerate([p1, p2, p3], 1):
    print(f"    partners page{i}: {len(page.get('partners', []))} items")
partners = normalize_partners([p1, p2, p3, p4])
save_json(partners, OUT_DIR / "partners_all.json")
print(f"[3] partners_all.json: count={len(partners)}")

# ─── [4] deals ───
d1 = load_tool_result(TOOL_DIR / "mcp-freee-mcp-freee_api_get-1776441503565.txt")
d2 = load_tool_result(TOOL_DIR / "mcp-freee-mcp-freee_api_get-1776441524076.txt")
d3 = load_tool_result(Path(__file__).parent / "deals_page3.json")
for i, page in enumerate([d1, d2, d3], 1):
    print(f"    deals page{i}: {len(page.get('deals', []))} items, total_count={page.get('meta', {}).get('total_count')}")
merged = merge_deals_pages([d1, d2, d3])
report = validate_completeness(merged)
save_json(merged, OUT_DIR / "deals_202512.json")
print(f"[4] deals_202512.json: total={report['total']}, meta.total_count={merged['meta']['total_count']}")
print(f"    issue_date: {report['issue_date_min']} ~ {report['issue_date_max']}")
print(f"    details_empty_count={report['details_empty_count']}")
print(f"    partner_id_null_count={report['partner_id_null_count']}")
print(f"    warnings={report['warnings']}")

# ─── [5] taxes_codes ───
taxes_raw = load_tool_result(Path(__file__).parent.parent / "tmp" / "deals_page3.json")
# taxes は API から inline で取得済み → 直接 save
taxes_inline = [
    {"code":2,"name":"non_taxable","name_ja":"対象外"},
    {"code":21,"name":"sales_with_tax","name_ja":"課税売上"},
    {"code":22,"name":"duty_free_sales","name_ja":"輸出売上"},
    {"code":23,"name":"sales_with_no_tax","name_ja":"非課売上"},
    {"code":24,"name":"sales_with_no_tax_export","name_ja":"非資売上"},
    {"code":10,"name":"stock_disposal","name_ja":"有価譲渡"},
    {"code":25,"name":"sales_without_tax","name_ja":"対外売上"},
    {"code":26,"name":"return_of_sales_with_tax","name_ja":"課税売返"},
    {"code":27,"name":"return_of_duty_free_sales","name_ja":"輸出売返"},
    {"code":28,"name":"return_of_sales_with_no_tax","name_ja":"非課売返"},
    {"code":29,"name":"return_of_sales_with_no_tax_export","name_ja":"非資売返"},
    {"code":8,"name":"bad_receivable","name_ja":"課税売倒"},
    {"code":13,"name":"bad_duty_free","name_ja":"輸出売倒"},
    {"code":14,"name":"bad_no_tax","name_ja":"非課売倒"},
    {"code":11,"name":"tax_exempt_export","name_ja":"非資売倒"},
    {"code":9,"name":"returned_bad_receivable","name_ja":"課税売回"},
    {"code":5,"name":"import","name_ja":"課対輸本"},
    {"code":30,"name":"import_no_tax","name_ja":"非対輸本"},
    {"code":31,"name":"import_common","name_ja":"共対輸本"},
    {"code":6,"name":"import_tax","name_ja":"課対輸税"},
    {"code":32,"name":"import_tax_no_tax","name_ja":"非対輸税"},
    {"code":33,"name":"import_tax_common","name_ja":"共対輸税"},
    {"code":7,"name":"import_local_tax","name_ja":"地消貨割"},
    {"code":34,"name":"purchase_with_tax","name_ja":"課対仕入"},
    {"code":35,"name":"purchase_with_no_tax","name_ja":"非対仕入"},
    {"code":36,"name":"purchase_with_common","name_ja":"共対仕入"},
    {"code":37,"name":"purchase_no_tax","name_ja":"非課仕入"},
    {"code":38,"name":"purchase_without_tax","name_ja":"対外仕入"},
    {"code":39,"name":"return_of_purchase_with_tax","name_ja":"課対仕返"},
    {"code":40,"name":"return_of_purchase_with_no_tax","name_ja":"非対仕返"},
    {"code":41,"name":"return_of_purchase_with_common","name_ja":"共対仕返"},
    {"code":42,"name":"return_of_purchase_no_tax","name_ja":"非課仕返"},
    {"code":129,"name":"sales_with_tax_10","name_ja":"課税売上10%"},
    {"code":136,"name":"purchase_with_tax_10","name_ja":"課対仕入10%"},
    {"code":143,"name":"return_of_sales_with_tax_10","name_ja":"課税売返10%"},
    {"code":155,"name":"taxable_10","name_ja":"課税10%"},
    {"code":156,"name":"sales_with_tax_reduced_8","name_ja":"課税売上8%（軽）"},
    {"code":163,"name":"purchase_with_tax_reduced_8","name_ja":"課対仕入8%（軽）"},
    {"code":182,"name":"taxable_reduced_8","name_ja":"課税8%（軽）"},
]
# taxes は API の inline 完全版（155コード）を使用済み → tmp/taxes_full.jsonから読む
taxes_full_path = Path(__file__).parent / "taxes_full.json"
if taxes_full_path.exists():
    with open(taxes_full_path, encoding="utf-8") as f:
        taxes_list = json.load(f)
else:
    taxes_list = taxes_inline  # fallback
save_json(taxes_list, OUT_DIR / "taxes_codes.json")
print(f"[5] taxes_codes.json: count={len(taxes_list)}")

# ─── 最終検証 ───
print("\n=== 最終 JSON 読み戻し検証 ===")
for fname in ["company_info.json","account_items_all.json","partners_all.json","deals_202512.json","taxes_codes.json"]:
    p = OUT_DIR / fname
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    size = p.stat().st_size
    print(f"  {fname}: OK ({size:,} bytes)")

print("\nDone.")
