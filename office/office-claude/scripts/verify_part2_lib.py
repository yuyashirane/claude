"""Part 2 _common/lib 6ファイルの検収スクリプト。

全6ファイルの関数・定数が正しく動作することを検証する。
Python 3.12 の importlib 対応パターンを使用。
"""
import sys
import importlib.util
from datetime import date
from decimal import Decimal
from pathlib import Path

# Part 1 知見: sys.modules 登録パターン
# NOTE: Part 2 以降で skills/_common/lib/ を import する検収スクリプトで
# 同じパターンを使うため、Part 1 時点から path を通しておく。
sys.path.insert(0, str(Path(__file__).parent.parent))

# schema.py のロード（Python 3.12 対応）
_schema_path = (
    Path(__file__).parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
)
_spec = importlib.util.spec_from_file_location("schema", _schema_path)
_schema = importlib.util.module_from_spec(_spec)
sys.modules["schema"] = _schema
_spec.loader.exec_module(_schema)


def _header(name: str) -> None:
    print(f"\n--- {name} ---")


# ═══════════════════════════════════════════════════════════════
# 1. tax_code_helpers
# ═══════════════════════════════════════════════════════════════

def test_tax_code_helpers() -> None:
    _header("tax_code_helpers.py (11 functions)")
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_reduced_purchase, is_standard_purchase_10,
        is_non_taxable_purchase, is_taxable_sales, is_standard_taxable_sales,
        is_reduced_taxable_sales, is_export_sales, is_non_taxable_sales,
        is_non_subject, get_tax_label,
        TAXABLE_PURCHASE_CODES,
    )

    assert is_taxable_purchase(136) is True
    assert is_taxable_purchase(37) is False
    assert is_reduced_purchase(163) is True
    assert is_standard_purchase_10(136) is True
    assert is_non_taxable_purchase(37) is True
    assert is_taxable_sales(129) is True
    assert is_standard_taxable_sales(129) is True
    assert is_reduced_taxable_sales(156) is True
    assert is_export_sales(22) is True
    assert is_non_taxable_sales(23) is True
    assert is_non_subject(2) is True
    assert is_non_subject(136) is False
    assert get_tax_label(136) == "課対仕入10%"
    assert get_tax_label(2) == "対象外"
    assert get_tax_label(99999) == "tax_code_99999"
    assert isinstance(TAXABLE_PURCHASE_CODES, frozenset)
    print("  11 functions: all OK")


# ═══════════════════════════════════════════════════════════════
# 2. keyword_matcher
# ═══════════════════════════════════════════════════════════════

def test_keyword_matcher() -> None:
    _header("keyword_matcher.py (7 functions)")
    from skills._common.lib.keyword_matcher import (
        matches_any, matches_any_weighted, normalize_account_name,
        normalize_tax_label, contains_any, matches_of, build_search_text,
    )

    assert matches_any("2026年3月分給与", ["給与", "賞与"]) is True
    assert matches_any("備品購入", ["給与"]) is False
    assert matches_any("", ["給与"]) is False
    assert matches_any("test", []) is False
    assert matches_any("ABC", ["abc"]) is True  # case insensitive

    result = matches_any_weighted("田町マンション", {"strong": ["社宅"], "weak": ["マンション"]})
    assert result == {"strong": False, "weak": True}

    assert normalize_account_name("  給与手当  ") == "給与手当"
    assert normalize_account_name("支払利息(割引料)") == "支払利息（割引料）"
    assert normalize_account_name("") == ""

    assert normalize_tax_label("課対仕入8%(軽)") == "課対仕入8%（軽）"
    assert normalize_tax_label(" 非課売上 ") == "非課売上"

    assert contains_any is matches_any  # エイリアス確認

    assert matches_of("社員忘年会 飲食代", ["忘年会", "飲食", "旅行"]) == ["忘年会", "飲食"]
    assert matches_of("備品", ["忘年会"]) == []

    # build_search_text は TransactionRow を使うため簡易テスト
    row = _schema.TransactionRow(
        wallet_txn_id="t1",
        description="家賃4月分",
        partner="〇〇不動産",
    )
    text = build_search_text(row)
    assert "家賃4月分" in text
    assert "〇〇不動産" in text
    print("  7 functions: all OK")


# ═══════════════════════════════════════════════════════════════
# 3. account_matcher
# ═══════════════════════════════════════════════════════════════

def test_account_matcher() -> None:
    _header("account_matcher.py (3 functions)")
    from skills._common.lib.account_matcher import (
        account_equals_any, account_includes_any, categorize_account,
    )

    assert account_equals_any("給与手当", ["給与手当", "賞与"]) is True
    assert account_equals_any("福利厚生費", ["法定福利費"]) is False
    assert account_equals_any("", ["給与手当"]) is False

    assert account_includes_any("地代家賃", ["家賃"]) is True
    assert account_includes_any("消耗品費", ["家賃"]) is False

    cats = {"salary": ["給与手当"], "welfare": ["福利厚生費"]}
    assert categorize_account("給与手当", cats) == "salary"
    assert categorize_account("消耗品費", cats) is None
    assert categorize_account("地代家賃", {"rent": ["家賃"]}, match_mode="includes") == "rent"
    print("  3 functions: all OK")


# ═══════════════════════════════════════════════════════════════
# 4. note_markers
# ═══════════════════════════════════════════════════════════════

def test_note_markers() -> None:
    _header("note_markers.py (2 elements)")
    from skills._common.lib.note_markers import NOTE_MARKERS, validate_note

    assert len(NOTE_MARKERS) == 6
    assert "tax_impact_negligible" in NOTE_MARKERS
    assert "defer_to_V1-3-20" in NOTE_MARKERS
    assert isinstance(NOTE_MARKERS, frozenset)

    assert validate_note("tax_impact_negligible") == "tax_impact_negligible"

    try:
        validate_note("typo_marker")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass

    print("  2 elements: all OK")


# ═══════════════════════════════════════════════════════════════
# 5. overseas_services
# ═══════════════════════════════════════════════════════════════

def test_overseas_services() -> None:
    _header("overseas_services.py (skeleton)")
    import skills._common.lib.overseas_services  # import だけでエラーにならないこと
    print("  skeleton import: OK")


# ═══════════════════════════════════════════════════════════════
# 6. finding_factory
# ═══════════════════════════════════════════════════════════════

def test_finding_factory() -> None:
    _header("finding_factory.py (13 functions + load_reference_bundle)")
    from skills._common.lib.finding_factory import (
        load_reference_json, load_common_definitions,
        is_debit_side, is_credit_side, get_amount,
        get_month_range, get_period_range,
        create_finding, build_link_hints, determine_area,
        validate_finding, check_exclusive_match,
        load_reference_bundle,
    )

    # --- reference loader ---
    area_defs = load_common_definitions("area-definitions")
    assert area_defs["areas"]["A5"]["name"] == "人件費"

    try:
        load_common_definitions("nonexistent")
        raise AssertionError("expected FileNotFoundError")
    except FileNotFoundError:
        pass

    print("  load_common_definitions: OK")

    # --- debit/credit ---
    row_d = _schema.TransactionRow(wallet_txn_id="t1", debit_amount=Decimal("1000"))
    row_c = _schema.TransactionRow(wallet_txn_id="t2", credit_amount=Decimal("5000"))
    row_0 = _schema.TransactionRow(wallet_txn_id="t3")

    assert is_debit_side(row_d) is True
    assert is_debit_side(row_c) is False
    assert is_credit_side(row_c) is True
    assert is_credit_side(row_d) is False
    assert get_amount(row_d) == Decimal("1000")
    assert get_amount(row_c) == Decimal("5000")
    assert get_amount(row_0) == Decimal("0")
    print("  is_debit_side / is_credit_side / get_amount: OK")

    # --- date ---
    assert get_month_range(date(2026, 3, 15)) == (date(2026, 3, 1), date(2026, 3, 31))
    assert get_month_range(date(2024, 2, 10)) == (date(2024, 2, 1), date(2024, 2, 29))  # 閏年
    assert get_month_range(date(2026, 12, 31)) == (date(2026, 12, 1), date(2026, 12, 31))
    print("  get_month_range: OK")

    ctx = _schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2026, 1, 1),
        period_end=date(2026, 12, 31),
    )
    assert get_period_range("fy2026", ctx) == (date(2026, 1, 1), date(2026, 12, 31))
    assert get_period_range("fy2025", ctx) is None
    print("  get_period_range: OK")

    # --- create_finding ---
    row = _schema.TransactionRow(
        wallet_txn_id="abc1",
        deal_id="d001",
        transaction_date=date(2026, 3, 15),
        account="給与手当",
        tax_label="課対仕入10%",
        debit_amount=Decimal("300000"),
    )
    f = create_finding(
        tc_code="TC-03",
        sub_code="TC-03a",
        severity="🔴 High",
        error_type="direct_error",
        area="A5",
        sort_priority=1,
        row=row,
        current_value="課対仕入10%",
        suggested_value="対象外",
        confidence=90,
        message="給与は対象外です。",
        subarea="payroll",
    )
    assert f.tc_code == "TC-03"
    assert f.review_level == "🔴必修"  # 自動導出
    assert f.wallet_txn_id == "abc1"
    assert f.deal_id == "d001"
    print("  create_finding: OK (review_level auto-derived)")

    # --- build_link_hints ---
    hints_gl = build_link_hints("general_ledger", row, ctx)
    assert hints_gl.target == "general_ledger"
    assert hints_gl.account_name == "給与手当"
    assert hints_gl.period_start == date(2026, 3, 1)

    hints_j = build_link_hints("journal", row, ctx)
    assert hints_j.target == "journal"
    assert hints_j.account_name is None  # journal では account_name なし

    hints_d = build_link_hints("deal_detail", row, ctx)
    assert hints_d.deal_id == "d001"

    row_no_deal = _schema.TransactionRow(wallet_txn_id="t4")
    try:
        build_link_hints("deal_detail", row_no_deal, ctx)
        raise AssertionError("expected ValueError for missing deal_id")
    except ValueError:
        pass
    print("  build_link_hints: OK (3 targets + ValueError)")

    # --- determine_area ---
    assert determine_area("支払利息", "A10", {"支払利息": "A11"}) == "A11"
    assert determine_area("消耗品費", "A10", {"支払利息": "A11"}) == "A10"
    print("  determine_area: OK")

    # --- validate_finding ---
    errors = validate_finding(f)
    assert errors == [], f"expected no errors, got {errors}"
    print("  validate_finding (valid): OK")

    bad_f = create_finding(
        tc_code="TC-03",
        sub_code="TC-03a",
        severity="🔴 High",
        error_type="direct_error",
        area="A5",
        sort_priority=1,
        row=row,
        current_value="x",
        suggested_value="y",
        confidence=90,
        message="",  # empty message
    )
    bad_errors = validate_finding(bad_f)
    assert len(bad_errors) > 0, "expected validation errors for empty message"
    print("  validate_finding (invalid): OK")

    # --- check_exclusive_match ---
    f1 = create_finding(
        tc_code="TC-04", sub_code="TC-04a", severity="🔴 High",
        error_type="direct_error", area="A11", sort_priority=1,
        row=row, current_value="x", suggested_value="y",
        confidence=90, message="test1",
    )
    f2 = create_finding(
        tc_code="TC-04", sub_code="TC-04c", severity="🟢 Low",
        error_type="mild_warning", area="A11", sort_priority=92,
        row=row, current_value="x", suggested_value="y",
        confidence=50, message="test2",
    )
    result_ab = check_exclusive_match([f1, f2])
    result_ba = check_exclusive_match([f2, f1])
    assert len(result_ab) == 1
    assert result_ab[0].sub_code == "TC-04a"  # direct_error 優先
    assert result_ab[0].sub_code == result_ba[0].sub_code  # 順序非依存
    print("  check_exclusive_match: OK (order-independent)")

    # --- load_reference_bundle ---
    bundle = load_reference_bundle("verify/V1-3-rule/check-tax-classification")
    assert "area-definitions" in bundle.common
    assert bundle.common["area-definitions"]["areas"]["A5"]["name"] == "人件費"
    assert bundle.common["tax-codes-master"]["136"] == "課対仕入10%"
    print("  load_reference_bundle: OK")


# ═══════════════════════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════════════════════

def main() -> None:
    print("=" * 60)
    print("Verifying Part 2: skills/_common/lib/ (6 files)")
    print("=" * 60)

    test_tax_code_helpers()
    test_keyword_matcher()
    test_account_matcher()
    test_note_markers()
    test_overseas_services()
    test_finding_factory()

    print("\n" + "=" * 60)
    print("OK: all 6 files verified, all functions operational")
    print("=" * 60)


if __name__ == "__main__":
    main()
