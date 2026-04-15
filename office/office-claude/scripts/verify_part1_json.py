"""Part 1 修正版 JSON 配置の検収スクリプト。

5ファイルすべてを読み込み、検収条件を満たすかを確認する。
エリア定義は v1.2.2 第3章準拠の最新版を検証する。
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent / "skills" / "_common" / "references"


def load(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def verify_tax_codes_master() -> None:
    data = load("tax-codes-master.json")
    assert len(data) == 175, f"expected 175 entries, got {len(data)}"
    assert max(int(k) for k in data) == 230, "expected max code 230"
    assert data["2"] == "対象外"
    assert data["136"] == "課対仕入10%"
    print("  tax-codes-master.json        OK (175 entries, max code 230)")


def verify_tax_code_categories() -> None:
    data = load("tax-code-categories.json")
    assert len(data["taxable_purchase"]["codes"]) == 11
    assert data["non_subject"]["codes"][0] == 2
    assert "_version" in data
    assert "_source" in data
    print("  tax-code-categories.json     OK")


def verify_severity_levels() -> None:
    data = load("severity-levels.json")
    assert set(data["severity"].keys()) == {"🔴", "🟡", "🟠", "🟢"}
    assert set(data["review_level"].keys()) == {"必修", "判断", "警戒", "参考"}
    assert set(data["error_type"].keys()) == {
        "direct_error", "gray_review", "reverse_suspect", "mild_warning",
    }
    assert data["error_type"]["direct_error"]["default_review_level"] == "必修"
    print("  severity-levels.json         OK")


def verify_area_definitions() -> None:
    """v1.2.2 第3章準拠のエリア定義を検証。"""
    data = load("area-definitions.json")

    # A1〜A13 すべて存在
    expected_areas = {f"A{i}" for i in range(1, 14)}
    assert set(data["areas"].keys()) == expected_areas

    # v1.2.2 第3章のエリア名を厳密にチェック(旧版からの変更点を全カバー)
    assert data["areas"]["A1"]["name"] == "現預金",      f"A1 should be 現預金, got {data['areas']['A1']['name']}"
    assert data["areas"]["A2"]["name"] == "借入金",      f"A2 should be 借入金, got {data['areas']['A2']['name']}"
    assert data["areas"]["A3"]["name"] == "固定資産",    f"A3 should be 固定資産, got {data['areas']['A3']['name']}"
    assert data["areas"]["A4"]["name"] == "家賃・地代"
    assert data["areas"]["A5"]["name"] == "人件費"
    assert data["areas"]["A6"]["name"] == "士業・外注",  f"A6 should be 士業・外注, got {data['areas']['A6']['name']}"
    assert data["areas"]["A7"]["name"] == "役員・株主",  f"A7 should be 役員・株主, got {data['areas']['A7']['name']}"
    assert data["areas"]["A8"]["name"] == "売上"
    assert data["areas"]["A9"]["name"] == "仕入・棚卸",  f"A9 should be 仕入・棚卸, got {data['areas']['A9']['name']}"
    assert data["areas"]["A10"]["name"] == "その他経費"
    assert data["areas"]["A11"]["name"] == "営業外・特別損益"
    assert data["areas"]["A12"]["name"] == "税金"
    assert data["areas"]["A13"]["name"] == "その他"

    # subarea の parent_area を検証
    assert data["subareas"]["rent"]["parent_area"] == "A4"
    assert data["subareas"]["land"]["parent_area"] == "A4"
    assert data["subareas"]["parking"]["parent_area"] == "A4"
    assert data["subareas"]["payroll"]["parent_area"] == "A5"
    assert data["subareas"]["welfare"]["parent_area"] == "A10"
    assert data["subareas"]["tax_public_charges"]["parent_area"] == "A12"
    assert data["subareas"]["non_operating_revenue"]["parent_area"] == "A11"
    assert data["subareas"]["non_operating_expense"]["parent_area"] == "A11"

    # subarea が8個すべて存在
    expected_subareas = {
        "rent", "land", "parking", "payroll",
        "welfare", "tax_public_charges",
        "non_operating_revenue", "non_operating_expense",
    }
    assert set(data["subareas"].keys()) - {"_comment"} == expected_subareas

    # 動的付与マップ
    assert data["dynamic_area_assignment"]["TC-05"]["支払利息"] == "A11"
    assert data["dynamic_area_assignment"]["TC-05"]["保険料"] == "A10"

    print("  area-definitions.json        OK (v1.2.2 §3 準拠)")


def verify_overseas_services() -> None:
    data = load("overseas-services.json")
    assert "services" in data
    assert isinstance(data["services"], dict)
    assert "placeholder" in data.get("_status", "")
    print("  overseas-services.json       OK (placeholder)")


def main() -> None:
    print("Verifying Part 1 (revised) JSON files...")
    print("  Source: v1.2.2 §13.4.5 (_common/references/)")
    print()
    verify_tax_codes_master()
    verify_tax_code_categories()
    verify_severity_levels()
    verify_area_definitions()
    verify_overseas_services()
    print()
    print("OK: all 5 JSON files verified")


if __name__ == "__main__":
    main()
