"""TC-02 のユニットテスト (20+α ケース)。

Phase 4 の山場、最も判定ロジックが複雑な TC のテスト。
3層キーワード判定 + 駐車場優先ディスパッチ + 売上/仕入両側 + reverse_suspect。
"""
from datetime import date
import pytest


def _make_ctx(schema, rows):
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課税売上10%": "129",
            "課税売上8%(軽)": "156",
            "非課売上": "23",
            "対象外": "2",
            "課対仕入10%": "136",
            "非課仕入": "37",
        },
    )


# ═══════════════════════════════════════════════════════════════
# TC-02a: 土地
# ═══════════════════════════════════════════════════════════════

class TestTC02a:
    def test_positive_sales(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="土地売却益", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=10000000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02a"
        assert findings[0].suggested_value == "非課売上"

    def test_positive_purchase(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="土地譲渡益", tax_label="課対仕入10%",
                              debit_amount=10000000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02a"
        assert findings[0].suggested_value == "非課仕入"

    def test_negative(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="土地売却益", tax_label="非課売上",
                              debit_amount=0, credit_amount=10000000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


# ═══════════════════════════════════════════════════════════════
# TC-02b: 住宅家賃 売上
# ═══════════════════════════════════════════════════════════════

class TestTC02b:
    def test_strong_kw(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="社宅家賃",
                              debit_amount=0, credit_amount=80000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02b"
        assert findings[0].confidence == 85

    def test_weak_kw(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="○○マンション",
                              debit_amount=0, credit_amount=80000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02b"
        assert findings[0].confidence == 70

    def test_apartment_is_strong(self, schema, make_row_factory):
        """アパート は strong に昇格 (悠皓さん判断、マージ版)。"""
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="アパート賃料",
                              debit_amount=0, credit_amount=70000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02b"
        assert findings[0].confidence == 85

    def test_negative_business(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="事務所",
                              debit_amount=0, credit_amount=200000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_negative_no_kw(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="家賃収入",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


# ═══════════════════════════════════════════════════════════════
# TC-02c: 住宅家賃 仕入
# ═══════════════════════════════════════════════════════════════

class TestTC02c:
    def test_strong_kw(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="課対仕入10%",
                              description="社宅家賃",
                              debit_amount=80000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02c"
        assert findings[0].confidence == 85

    def test_weak_kw(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="課対仕入10%",
                              description="○○マンション",
                              debit_amount=80000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02c"
        assert findings[0].confidence == 70

    def test_negative_business(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="課対仕入10%",
                              description="事務所家賃",
                              debit_amount=200000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


# ═══════════════════════════════════════════════════════════════
# TC-02d: 駐車場
# ═══════════════════════════════════════════════════════════════

class TestTC02d:
    def test_parking_simple(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="駐車場",
                              debit_amount=0, credit_amount=10000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02d"
        assert findings[0].subarea == "parking"

    def test_residential_parking_taxable(self, schema, make_row_factory):
        """住宅KW + 駐車場 + 課税 → TC-02d 分岐1。"""
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="社宅 駐車場",
                              debit_amount=0, credit_amount=15000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02d"
        assert "住宅付随駐車場" in findings[0].message

    def test_independent_parking_non_taxable(self, schema, make_row_factory):
        """駐車場 + 非課税 → TC-02d 分岐2。"""
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="非課売上",
                              description="月極駐車場",
                              debit_amount=0, credit_amount=8000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02d"
        assert "独立した駐車場" in findings[0].message


# ═══════════════════════════════════════════════════════════════
# TC-02e: reverse_suspect 売上
# ═══════════════════════════════════════════════════════════════

class TestTC02e:
    def test_business_only(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="非課売上",
                              description="事務所家賃",
                              debit_amount=0, credit_amount=200000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02e"
        assert findings[0].confidence == 65

    def test_mixed_business(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="非課売上",
                              description="社宅 事務所兼用",
                              debit_amount=0, credit_amount=150000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02e"
        assert findings[0].confidence == 45


# ═══════════════════════════════════════════════════════════════
# TC-02f: reverse_suspect 仕入
# ═══════════════════════════════════════════════════════════════

class TestTC02f:
    def test_business_only(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="非課仕入",
                              description="事務所家賃",
                              debit_amount=200000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02f"
        assert findings[0].confidence == 65

    def test_mixed_business(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="非課仕入",
                              description="マンション 本社",
                              debit_amount=150000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02f"
        assert findings[0].confidence == 45


# ═══════════════════════════════════════════════════════════════
# スコープ判定
# ═══════════════════════════════════════════════════════════════

class TestTC02Scope:
    def test_revenue_account_debit_skipped(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="非課売上",
                              description="社宅",
                              debit_amount=80000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_expense_account_credit_skipped(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        row = make_row_factory(account="地代家賃", tax_label="非課仕入",
                              description="社宅",
                              debit_amount=0, credit_amount=80000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


# ═══════════════════════════════════════════════════════════════
# classify_residential 純粋関数テスト
# ═══════════════════════════════════════════════════════════════

class TestClassifyResidential:
    @pytest.fixture
    def keywords(self):
        from skills._common.lib.finding_factory import load_reference_json
        return load_reference_json(
            "verify/V1-3-rule/check-tax-classification",
            "keywords/rent-keywords",
            filter_meta=True,
        )

    def test_strong_only(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("社宅家賃", keywords) == ("strong", 85)

    def test_weak_only(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("○○マンション", keywords) == ("weak", 70)

    def test_business_only(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("事務所", keywords) == ("business", 65)

    def test_mixed_strong_business(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("社宅 事務所", keywords) == ("mixed_business", 45)

    def test_mixed_weak_business(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("マンション 本社", keywords) == ("mixed_business", 45)

    def test_none(self, keywords):
        from checks.tc02_land_rent import classify_residential
        assert classify_residential("家賃支払", keywords) is None


# ═══════════════════════════════════════════════════════════════
# 優先順位テスト
# ═══════════════════════════════════════════════════════════════

class TestPriority:
    def test_parking_priority_over_residential(self, schema, make_row_factory):
        """摘要「社宅 駐車場代」→ TC-02d 優先 (TC-02b ではない)。"""
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="社宅 駐車場代",
                              debit_amount=0, credit_amount=10000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-02d"

    def test_mixed_skipped_for_tc02b(self, schema, make_row_factory):
        """受取家賃 + 課税売上 + 「社宅 事務所」→ TC-02b は出ない (mixed スコープ外)。"""
        from checks.tc02_land_rent import run
        row = make_row_factory(account="受取家賃", tax_label="課税売上10%",
                              description="社宅 事務所",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0
