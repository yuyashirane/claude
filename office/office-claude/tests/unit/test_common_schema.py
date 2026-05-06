"""
共通 Finding スキーマの単体テスト (E1)

E1 段階では「型が定義され、import でき、最小生成・追加属性指定ができる」
ことの確認に留める。詳細な仕様テストは E2 / E3 で V1-3-10 / V1-3-20 の
移行と同時に追加する。
"""

from datetime import date

import pytest

from skills._common.schema import (
    REVIEW_LEVEL_LEGACY_MAP,
    SEVERITY_LEGACY_MAP,
    ErrorType,
    Finding,
    FindingDetail,
    LinkHints,
    LinkTarget,
    ReviewLevel,
    Severity,
)


class TestImports:
    """共通スキーマの主要な型が import 可能"""

    def test_finding_imported(self):
        assert Finding is not None

    def test_link_hints_imported(self):
        assert LinkHints is not None

    def test_finding_detail_imported(self):
        assert FindingDetail is not None


class TestFindingMinimalConstruction:
    """V1-3-10 既存属性のみで Finding が生成できる"""

    def test_minimal_finding(self):
        f = Finding(
            tc_code="TC-01-A",
            sub_code="01",
            severity="🔴 Critical",
            error_type="direct_error",
            review_level="🔴 必須確認",
            area="売上",
            sort_priority=10,
        )
        assert f.tc_code == "TC-01-A"
        assert f.severity == "🔴 Critical"
        assert f.review_level == "🔴 必須確認"

    def test_finding_with_all_v1_3_10_fields(self):
        f = Finding(
            tc_code="TC-02-B",
            sub_code="03",
            severity="🟡 Medium",
            error_type="gray_review",
            review_level="🟡 通常確認",
            area="経費",
            sort_priority=20,
            wallet_txn_id="W-12345",
            current_value="100,000",
            suggested_value="110,000",
            confidence=80,
            message="計上ミスの可能性",
            debit_amount=100000,
            credit_amount=0,
            subarea="旅費交通費",
            show_by_default=True,
            deal_id="D-9999",
            note="補足メモ",
        )
        assert f.confidence == 80
        assert f.debit_amount == 100000
        assert f.subarea == "旅費交通費"


class TestFindingV1320Attributes:
    """V1-3-20 由来の追加属性が指定できる"""

    def test_with_v1_3_20_attrs(self):
        f = Finding(
            tc_code="V1-3-20",
            sub_code="01",
            severity="🟠 High",
            error_type="mild_warning",
            review_level="🟠 重点確認",
            area="インボイス",
            sort_priority=30,
            classification="QUALIFIED_BUT_TRANSITIONAL_TAX",
            partner="株式会社サンプル",
            transaction_date="2026-04-15",
            is_qualified_invoice=True,
            tax_code=8,
        )
        assert f.classification == "QUALIFIED_BUT_TRANSITIONAL_TAX"
        assert f.partner == "株式会社サンプル"
        assert f.transaction_date == "2026-04-15"
        assert f.is_qualified_invoice is True
        assert f.tax_code == 8

    def test_v1_3_20_attrs_default_none(self):
        f = Finding(
            tc_code="TC-01",
            sub_code="01",
            severity="🟢 Low",
            error_type="direct_error",
            review_level="🟢 参考確認",
            area="その他",
            sort_priority=99,
        )
        assert f.classification is None
        assert f.partner is None
        assert f.transaction_date is None
        assert f.is_qualified_invoice is None
        assert f.tax_code is None


class TestFindingFrozen:
    """Finding は frozen=True で不変"""

    def test_finding_is_frozen(self):
        f = Finding(
            tc_code="TC-01",
            sub_code="01",
            severity="🔴 Critical",
            error_type="direct_error",
            review_level="🔴 必須確認",
            area="売上",
            sort_priority=10,
        )
        with pytest.raises(Exception):  # FrozenInstanceError
            f.tc_code = "CHANGED"  # type: ignore


class TestInvoiceWarningErrorType:
    """invoice_warning が ErrorType に追加されている (β2-E E3-pre)"""

    def test_invoice_warning_in_error_type(self):
        # Literal は実行時に値リストを取得できないため、Finding を実際に構築して検証
        f = Finding(
            tc_code="V1-3-20",
            sub_code="01",
            severity="🟠 High",
            error_type="invoice_warning",
            review_level="🟠 重点確認",
            area="A14",
            sort_priority=30,
        )
        assert f.error_type == "invoice_warning"

    def test_invoice_warning_to_review_level(self):
        from skills._common.lib.finding_factory import _ERROR_TYPE_TO_REVIEW_LEVEL
        assert _ERROR_TYPE_TO_REVIEW_LEVEL["invoice_warning"] == "🟠 重点確認"


class TestLegacyMaps:
    """互換変換マップが正しく定義されている"""

    def test_severity_legacy_map_keys(self):
        assert "🔴 High" in SEVERITY_LEGACY_MAP
        assert "🟡 Medium" in SEVERITY_LEGACY_MAP
        assert "🟠 Warning" in SEVERITY_LEGACY_MAP
        assert "🟢 Low" in SEVERITY_LEGACY_MAP

    def test_severity_legacy_map_values(self):
        assert SEVERITY_LEGACY_MAP["🔴 High"] == "🔴 Critical"
        assert SEVERITY_LEGACY_MAP["🟡 Medium"] == "🟡 Medium"
        assert SEVERITY_LEGACY_MAP["🟠 Warning"] == "🟠 High"
        assert SEVERITY_LEGACY_MAP["🟢 Low"] == "🟢 Low"

    def test_review_level_legacy_map_keys(self):
        assert "🔴必修" in REVIEW_LEVEL_LEGACY_MAP
        assert "🟡判断" in REVIEW_LEVEL_LEGACY_MAP
        assert "🟠警戒" in REVIEW_LEVEL_LEGACY_MAP
        assert "🟢参考" in REVIEW_LEVEL_LEGACY_MAP

    def test_review_level_legacy_map_values(self):
        assert REVIEW_LEVEL_LEGACY_MAP["🔴必修"] == "🔴 必須確認"
        assert REVIEW_LEVEL_LEGACY_MAP["🟡判断"] == "🟡 通常確認"
        assert REVIEW_LEVEL_LEGACY_MAP["🟠警戒"] == "🟠 重点確認"
        assert REVIEW_LEVEL_LEGACY_MAP["🟢参考"] == "🟢 参考確認"


class TestLinkHintsConstruction:
    """LinkHints が生成できる(V1-3-10 既存型に準拠)"""

    def test_minimal_link_hints(self):
        lh = LinkHints(target="general_ledger")
        assert lh.target == "general_ledger"
        assert lh.account_name is None

    def test_link_hints_with_optionals(self):
        lh = LinkHints(
            target="deal_detail",
            account_name="売上高",
            period_start=date(2025, 4, 1),
            period_end=date(2026, 3, 31),
            tax_group_codes=["1", "2"],
            deal_id="D-12345",
            fiscal_year_id="fy2026",
            company_id="10794380",
        )
        assert lh.account_name == "売上高"
        assert lh.period_start == date(2025, 4, 1)
        assert lh.deal_id == "D-12345"
        assert lh.fiscal_year_id == "fy2026"
        assert lh.company_id == "10794380"


class TestFindingDetailConstruction:
    """FindingDetail が生成できる(V1-3-10 既存型に準拠)"""

    def test_default_finding_detail(self):
        fd = FindingDetail()
        assert fd.matched_rules == []
        assert fd.evidence == {}
        assert fd.confidence_breakdown == {}
        assert fd.recommended_actions == []
        assert fd.related_law is None
        assert fd.related_docs == []

    def test_finding_detail_with_fields(self):
        fd = FindingDetail(
            matched_rules=["rule-A", "rule-B"],
            evidence={"account": "給与手当", "tax_label": "課対仕入10%"},
            confidence_breakdown={"keyword": 50, "context": 30},
            recommended_actions=["税区分を「対象外」に変更"],
            related_law="消費税法 第2条第1項第8号",
            related_docs=["tax-classification.md R03"],
        )
        assert fd.matched_rules == ["rule-A", "rule-B"]
        assert fd.evidence == {"account": "給与手当", "tax_label": "課対仕入10%"}
        assert fd.confidence_breakdown == {"keyword": 50, "context": 30}
        assert fd.related_law == "消費税法 第2条第1項第8号"


class TestFindingWithLinkHintsAndDetail:
    """Finding が LinkHints / FindingDetail を保持できる"""

    def test_finding_carries_link_hints(self):
        lh = LinkHints(target="journal", account_name="売上高")
        f = Finding(
            tc_code="TC-01",
            sub_code="01",
            severity="🟡 Medium",
            error_type="gray_review",
            review_level="🟡 通常確認",
            area="売上",
            sort_priority=10,
            link_hints=lh,
        )
        assert f.link_hints is not None
        assert f.link_hints.target == "journal"

    def test_finding_carries_detail(self):
        fd = FindingDetail(matched_rules=["r1"])
        f = Finding(
            tc_code="TC-01",
            sub_code="01",
            severity="🟡 Medium",
            error_type="gray_review",
            review_level="🟡 通常確認",
            area="売上",
            sort_priority=10,
            detail=fd,
        )
        assert f.detail is not None
        assert f.detail.matched_rules == ["r1"]
