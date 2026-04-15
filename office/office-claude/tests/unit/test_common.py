"""_common/lib 全関数の pytest 版ユニットテスト。

責務単位で TestClass を分離:
    TestTaxCodeHelpers    - tax_code_helpers.py（11関数）
    TestKeywordMatcher    - keyword_matcher.py（7関数）
    TestAccountMatcher    - account_matcher.py（3関数）
    TestNoteMarkers       - note_markers.py（2要素）
    TestOverseasServices  - overseas_services.py（import のみ）
    TestFindingFactory    - finding_factory.py（13関数 + load_reference_bundle）

出典: STEP4-D 統合版 §III.5（テスト設計の原則）
配置: tests/unit/test_common.py
"""
from datetime import date
from decimal import Decimal

import pytest


# ═══════════════════════════════════════════════════════════════
# 1. TestTaxCodeHelpers
# ═══════════════════════════════════════════════════════════════

class TestTaxCodeHelpers:
    """tax_code_helpers.py の11関数 + 定数のテスト。"""

    def test_is_taxable_purchase_true(self):
        from skills._common.lib.tax_code_helpers import is_taxable_purchase
        assert is_taxable_purchase(136) is True

    def test_is_taxable_purchase_false(self):
        from skills._common.lib.tax_code_helpers import is_taxable_purchase
        assert is_taxable_purchase(37) is False

    def test_is_reduced_purchase(self):
        from skills._common.lib.tax_code_helpers import is_reduced_purchase
        assert is_reduced_purchase(163) is True
        assert is_reduced_purchase(136) is False

    def test_is_standard_purchase_10(self):
        from skills._common.lib.tax_code_helpers import is_standard_purchase_10
        assert is_standard_purchase_10(136) is True
        assert is_standard_purchase_10(163) is False

    def test_is_non_taxable_purchase(self):
        from skills._common.lib.tax_code_helpers import is_non_taxable_purchase
        assert is_non_taxable_purchase(37) is True
        assert is_non_taxable_purchase(136) is False

    def test_is_taxable_sales(self):
        from skills._common.lib.tax_code_helpers import is_taxable_sales
        assert is_taxable_sales(129) is True
        assert is_taxable_sales(23) is False

    def test_is_standard_taxable_sales(self):
        from skills._common.lib.tax_code_helpers import is_standard_taxable_sales
        assert is_standard_taxable_sales(129) is True
        assert is_standard_taxable_sales(156) is False

    def test_is_reduced_taxable_sales(self):
        from skills._common.lib.tax_code_helpers import is_reduced_taxable_sales
        assert is_reduced_taxable_sales(156) is True
        assert is_reduced_taxable_sales(129) is False

    def test_is_export_sales(self):
        from skills._common.lib.tax_code_helpers import is_export_sales
        assert is_export_sales(22) is True
        assert is_export_sales(21) is False

    def test_is_non_taxable_sales(self):
        from skills._common.lib.tax_code_helpers import is_non_taxable_sales
        assert is_non_taxable_sales(23) is True
        assert is_non_taxable_sales(21) is False

    def test_is_non_subject(self):
        from skills._common.lib.tax_code_helpers import is_non_subject
        assert is_non_subject(2) is True
        assert is_non_subject(136) is False

    def test_get_tax_label_known(self):
        from skills._common.lib.tax_code_helpers import get_tax_label
        assert get_tax_label(136) == "課対仕入10%"
        assert get_tax_label(2) == "対象外"

    def test_get_tax_label_unknown(self):
        from skills._common.lib.tax_code_helpers import get_tax_label
        assert get_tax_label(99999) == "tax_code_99999"

    def test_constants_are_frozenset(self):
        from skills._common.lib.tax_code_helpers import TAXABLE_PURCHASE_CODES
        assert isinstance(TAXABLE_PURCHASE_CODES, frozenset)


# ═══════════════════════════════════════════════════════════════
# 2. TestKeywordMatcher
# ═══════════════════════════════════════════════════════════════

class TestKeywordMatcher:
    """keyword_matcher.py の7関数のテスト。"""

    def test_matches_any_hit(self):
        from skills._common.lib.keyword_matcher import matches_any
        assert matches_any("2026年3月分給与", ["給与", "賞与"]) is True

    def test_matches_any_miss(self):
        from skills._common.lib.keyword_matcher import matches_any
        assert matches_any("備品購入", ["給与", "賞与"]) is False

    def test_matches_any_empty_text(self):
        from skills._common.lib.keyword_matcher import matches_any
        assert matches_any("", ["給与"]) is False

    def test_matches_any_empty_keywords(self):
        from skills._common.lib.keyword_matcher import matches_any
        assert matches_any("test", []) is False

    def test_matches_any_case_insensitive(self):
        from skills._common.lib.keyword_matcher import matches_any
        assert matches_any("ABC", ["abc"]) is True

    def test_matches_any_weighted(self):
        from skills._common.lib.keyword_matcher import matches_any_weighted
        result = matches_any_weighted(
            "田町マンション事務所",
            {"strong": ["社宅", "寮"], "weak": ["マンション"], "business": ["事務所"]},
        )
        assert result == {"strong": False, "weak": True, "business": True}

    def test_matches_any_weighted_empty_text(self):
        from skills._common.lib.keyword_matcher import matches_any_weighted
        result = matches_any_weighted("", {"a": ["x"]})
        assert result == {"a": False}

    def test_normalize_account_name_strip(self):
        from skills._common.lib.keyword_matcher import normalize_account_name
        assert normalize_account_name("  給与手当  ") == "給与手当"

    def test_normalize_account_name_paren(self):
        from skills._common.lib.keyword_matcher import normalize_account_name
        assert normalize_account_name("支払利息(割引料)") == "支払利息（割引料）"

    def test_normalize_account_name_empty(self):
        from skills._common.lib.keyword_matcher import normalize_account_name
        assert normalize_account_name("") == ""

    def test_normalize_tax_label(self):
        from skills._common.lib.keyword_matcher import normalize_tax_label
        assert normalize_tax_label("課対仕入8%(軽)") == "課対仕入8%（軽）"
        assert normalize_tax_label(" 非課売上 ") == "非課売上"

    def test_contains_any_is_alias(self):
        from skills._common.lib.keyword_matcher import contains_any, matches_any
        assert contains_any is matches_any

    def test_matches_of_hit(self):
        from skills._common.lib.keyword_matcher import matches_of
        assert matches_of("社員忘年会 飲食代", ["忘年会", "飲食", "旅行"]) == ["忘年会", "飲食"]

    def test_matches_of_miss(self):
        from skills._common.lib.keyword_matcher import matches_of
        assert matches_of("備品購入", ["忘年会"]) == []

    def test_build_search_text(self, schema):
        from skills._common.lib.keyword_matcher import build_search_text
        row = schema.TransactionRow(
            wallet_txn_id="t1",
            description="家賃4月分",
            partner="〇〇不動産",
        )
        text = build_search_text(row)
        assert "家賃4月分" in text
        assert "〇〇不動産" in text


# ═══════════════════════════════════════════════════════════════
# 3. TestAccountMatcher
# ═══════════════════════════════════════════════════════════════

class TestAccountMatcher:
    """account_matcher.py の3関数のテスト。"""

    def test_account_equals_any_hit(self):
        from skills._common.lib.account_matcher import account_equals_any
        assert account_equals_any("給与手当", ["給与手当", "賞与"]) is True

    def test_account_equals_any_miss(self):
        from skills._common.lib.account_matcher import account_equals_any
        assert account_equals_any("福利厚生費", ["法定福利費"]) is False

    def test_account_equals_any_empty(self):
        from skills._common.lib.account_matcher import account_equals_any
        assert account_equals_any("", ["給与手当"]) is False

    def test_account_includes_any_hit(self):
        from skills._common.lib.account_matcher import account_includes_any
        assert account_includes_any("地代家賃", ["家賃"]) is True

    def test_account_includes_any_miss(self):
        from skills._common.lib.account_matcher import account_includes_any
        assert account_includes_any("消耗品費", ["家賃"]) is False

    def test_categorize_account_equals(self):
        from skills._common.lib.account_matcher import categorize_account
        cats = {"salary": ["給与手当"], "welfare": ["福利厚生費"]}
        assert categorize_account("給与手当", cats) == "salary"

    def test_categorize_account_miss(self):
        from skills._common.lib.account_matcher import categorize_account
        cats = {"salary": ["給与手当"]}
        assert categorize_account("消耗品費", cats) is None

    def test_categorize_account_includes(self):
        from skills._common.lib.account_matcher import categorize_account
        assert categorize_account("地代家賃", {"rent": ["家賃"]}, match_mode="includes") == "rent"


# ═══════════════════════════════════════════════════════════════
# 4. TestNoteMarkers
# ═══════════════════════════════════════════════════════════════

class TestNoteMarkers:
    """note_markers.py の2要素のテスト。"""

    def test_note_markers_count(self):
        from skills._common.lib.note_markers import NOTE_MARKERS
        assert len(NOTE_MARKERS) == 6

    def test_note_markers_contains(self):
        from skills._common.lib.note_markers import NOTE_MARKERS
        assert "tax_impact_negligible" in NOTE_MARKERS
        assert "defer_to_V1-3-20" in NOTE_MARKERS
        assert "high_anomaly" in NOTE_MARKERS

    def test_note_markers_is_frozenset(self):
        from skills._common.lib.note_markers import NOTE_MARKERS
        assert isinstance(NOTE_MARKERS, frozenset)

    def test_validate_note_valid(self):
        from skills._common.lib.note_markers import validate_note
        assert validate_note("tax_impact_negligible") == "tax_impact_negligible"

    def test_validate_note_invalid(self):
        from skills._common.lib.note_markers import validate_note
        with pytest.raises(ValueError):
            validate_note("typo_marker")


# ═══════════════════════════════════════════════════════════════
# 5. TestOverseasServices
# ═══════════════════════════════════════════════════════════════

class TestOverseasServices:
    """overseas_services.py のテスト（import のみ）。"""

    def test_import_succeeds(self):
        import skills._common.lib.overseas_services  # noqa: F401


# ═══════════════════════════════════════════════════════════════
# 6. TestFindingFactory
# ═══════════════════════════════════════════════════════════════

class TestFindingFactory:
    """finding_factory.py の13関数 + load_reference_bundle のテスト。"""

    # --- reference loader ---

    def test_load_common_definitions(self):
        from skills._common.lib.finding_factory import load_common_definitions
        data = load_common_definitions("area-definitions")
        assert data["areas"]["A5"]["name"] == "人件費"

    def test_load_common_definitions_not_found(self):
        from skills._common.lib.finding_factory import load_common_definitions
        with pytest.raises(FileNotFoundError):
            load_common_definitions("nonexistent")

    # --- debit / credit ---

    def test_is_debit_side(self, schema):
        from skills._common.lib.finding_factory import is_debit_side
        row = schema.TransactionRow(wallet_txn_id="t1", debit_amount=Decimal("1000"))
        assert is_debit_side(row) is True

    def test_is_debit_side_false(self, schema):
        from skills._common.lib.finding_factory import is_debit_side
        row = schema.TransactionRow(wallet_txn_id="t1", credit_amount=Decimal("1000"))
        assert is_debit_side(row) is False

    def test_is_credit_side(self, schema):
        from skills._common.lib.finding_factory import is_credit_side
        row = schema.TransactionRow(wallet_txn_id="t1", credit_amount=Decimal("5000"))
        assert is_credit_side(row) is True

    def test_get_amount_debit(self, schema):
        from skills._common.lib.finding_factory import get_amount
        row = schema.TransactionRow(wallet_txn_id="t1", debit_amount=Decimal("1000"))
        assert get_amount(row) == Decimal("1000")

    def test_get_amount_credit(self, schema):
        from skills._common.lib.finding_factory import get_amount
        row = schema.TransactionRow(wallet_txn_id="t1", credit_amount=Decimal("5000"))
        assert get_amount(row) == Decimal("5000")

    def test_get_amount_zero(self, schema):
        from skills._common.lib.finding_factory import get_amount
        row = schema.TransactionRow(wallet_txn_id="t1")
        assert get_amount(row) == Decimal("0")

    # --- date ---

    def test_get_month_range_normal(self):
        from skills._common.lib.finding_factory import get_month_range
        assert get_month_range(date(2026, 3, 15)) == (date(2026, 3, 1), date(2026, 3, 31))

    def test_get_month_range_leap_year(self):
        from skills._common.lib.finding_factory import get_month_range
        assert get_month_range(date(2024, 2, 10)) == (date(2024, 2, 1), date(2024, 2, 29))

    def test_get_month_range_december(self):
        from skills._common.lib.finding_factory import get_month_range
        assert get_month_range(date(2026, 12, 31)) == (date(2026, 12, 1), date(2026, 12, 31))

    def test_get_period_range_match(self, sample_ctx):
        from skills._common.lib.finding_factory import get_period_range
        result = get_period_range("fy2026", sample_ctx)
        assert result == (sample_ctx.period_start, sample_ctx.period_end)

    def test_get_period_range_mismatch(self, sample_ctx):
        from skills._common.lib.finding_factory import get_period_range
        assert get_period_range("fy2025", sample_ctx) is None

    # --- create_finding ---

    def test_create_finding_review_level_auto(self, sample_row):
        from skills._common.lib.finding_factory import create_finding
        f = create_finding(
            tc_code="TC-03", sub_code="TC-03a",
            severity="🔴 High", error_type="direct_error",
            area="A5", sort_priority=1, row=sample_row,
            current_value="課対仕入10%", suggested_value="対象外",
            confidence=90, message="給与は対象外です。",
        )
        assert f.review_level == "🔴必修"
        assert f.wallet_txn_id == "test-001"

    def test_create_finding_mild_warning(self, sample_row):
        from skills._common.lib.finding_factory import create_finding
        f = create_finding(
            tc_code="TC-03", sub_code="TC-03c",
            severity="🟢 Low", error_type="mild_warning",
            area="A5", sort_priority=92, row=sample_row,
            current_value="対象外", suggested_value="非課仕入",
            confidence=60, message="法定福利費の対象外は許容範囲です。",
            note="tax_impact_negligible",
            show_by_default=False,
        )
        assert f.review_level == "🟢参考"
        assert f.note == "tax_impact_negligible"
        assert f.show_by_default is False

    # --- build_link_hints ---

    def test_build_link_hints_general_ledger(self, sample_row, sample_ctx):
        from skills._common.lib.finding_factory import build_link_hints
        hints = build_link_hints("general_ledger", sample_row, sample_ctx)
        assert hints.target == "general_ledger"
        assert hints.account_name == "給与手当"
        assert hints.period_start == date(2026, 3, 1)

    def test_build_link_hints_journal(self, sample_row, sample_ctx):
        from skills._common.lib.finding_factory import build_link_hints
        hints = build_link_hints("journal", sample_row, sample_ctx)
        assert hints.target == "journal"
        assert hints.account_name is None

    def test_build_link_hints_deal_detail(self, sample_row, sample_ctx):
        from skills._common.lib.finding_factory import build_link_hints
        hints = build_link_hints("deal_detail", sample_row, sample_ctx)
        assert hints.deal_id == "d-001"

    def test_build_link_hints_deal_detail_missing(self, schema, sample_ctx):
        from skills._common.lib.finding_factory import build_link_hints
        row = schema.TransactionRow(wallet_txn_id="t-no-deal")
        with pytest.raises(ValueError):
            build_link_hints("deal_detail", row, sample_ctx)

    # --- determine_area ---

    def test_determine_area_hit(self):
        from skills._common.lib.finding_factory import determine_area
        assert determine_area("支払利息", "A10", {"支払利息": "A11"}) == "A11"

    def test_determine_area_default(self):
        from skills._common.lib.finding_factory import determine_area
        assert determine_area("消耗品費", "A10", {"支払利息": "A11"}) == "A10"

    # --- validate_finding ---

    def test_validate_finding_valid(self, sample_row):
        from skills._common.lib.finding_factory import create_finding, validate_finding
        f = create_finding(
            tc_code="TC-03", sub_code="TC-03a",
            severity="🔴 High", error_type="direct_error",
            area="A5", sort_priority=1, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=90, message="テスト",
        )
        assert validate_finding(f) == []

    def test_validate_finding_invalid_empty_message(self, sample_row):
        from skills._common.lib.finding_factory import create_finding, validate_finding
        f = create_finding(
            tc_code="TC-03", sub_code="TC-03a",
            severity="🔴 High", error_type="direct_error",
            area="A5", sort_priority=1, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=90, message="",
        )
        errors = validate_finding(f)
        assert len(errors) > 0

    # --- check_exclusive_match ---

    def test_check_exclusive_match_direct_wins(self, sample_row):
        from skills._common.lib.finding_factory import create_finding, check_exclusive_match
        f1 = create_finding(
            tc_code="TC-04", sub_code="TC-04a",
            severity="🔴 High", error_type="direct_error",
            area="A11", sort_priority=1, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=90, message="direct error",
        )
        f2 = create_finding(
            tc_code="TC-04", sub_code="TC-04c",
            severity="🟢 Low", error_type="mild_warning",
            area="A11", sort_priority=92, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=50, message="mild warning",
        )
        result = check_exclusive_match([f1, f2])
        assert len(result) == 1
        assert result[0].sub_code == "TC-04a"

    def test_check_exclusive_match_order_independent(self, sample_row):
        from skills._common.lib.finding_factory import create_finding, check_exclusive_match
        f1 = create_finding(
            tc_code="TC-04", sub_code="TC-04a",
            severity="🔴 High", error_type="direct_error",
            area="A11", sort_priority=1, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=90, message="a",
        )
        f2 = create_finding(
            tc_code="TC-04", sub_code="TC-04c",
            severity="🟢 Low", error_type="mild_warning",
            area="A11", sort_priority=92, row=sample_row,
            current_value="x", suggested_value="y",
            confidence=50, message="b",
        )
        assert check_exclusive_match([f1, f2])[0].sub_code == check_exclusive_match([f2, f1])[0].sub_code

    # --- load_reference_bundle ---

    def test_load_reference_bundle(self):
        from skills._common.lib.finding_factory import load_reference_bundle
        bundle = load_reference_bundle("verify/V1-3-rule/check-tax-classification")
        assert "area-definitions" in bundle.common
        assert bundle.common["area-definitions"]["areas"]["A5"]["name"] == "人件費"
        assert bundle.common["tax-codes-master"]["136"] == "課対仕入10%"
