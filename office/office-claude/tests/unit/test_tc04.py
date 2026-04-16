"""TC-04 のユニットテスト（15+α ケース）。

Pattern B（科目カテゴリ × 税区分マトリクス型）の模範テスト。
TC-05/06 のテストもこの構造をテンプレートにする。
"""
from datetime import date
from decimal import Decimal
import pytest


def _make_ctx(schema, rows):
    """TC-04 テスト用の CheckContext。売上系の税区分コードを登録。"""
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課税売上10%": "129",
            "非課売上": "23",
            "対象外": "2",
            "課対仕入10%": "136",
        },
    )


class TestTC04a:
    """TC-04a: 受取利息が課税売上。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取利息", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=1000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04a"
        assert findings[0].error_type == "direct_error"

    def test_negative(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取利息", tax_label="非課売上",
                              debit_amount=0, credit_amount=1000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04b:
    """TC-04b: 配当金等が課税売上。"""

    def test_positive_dividend(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取配当金", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=5000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04b"

    def test_negative(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取配当金", tax_label="対象外",
                              debit_amount=0, credit_amount=5000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04c:
    """TC-04c: 受取利息が対象外（許容パターン）。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取利息", tax_label="対象外",
                              debit_amount=0, credit_amount=100)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04c"
        assert findings[0].error_type == "mild_warning"
        assert findings[0].note == "affects_taxable_sales_ratio"
        assert findings[0].show_by_default is False

    def test_negative_correct_classification(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取利息", tax_label="非課売上",
                              debit_amount=0, credit_amount=100)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04d:
    """TC-04d: 配当金等が非課売上（許容パターン）。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="補助金収入", tax_label="非課売上",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04d"
        assert findings[0].note == "affects_taxable_sales_ratio"

    def test_negative_correct(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="補助金収入", tax_label="対象外",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04e:
    """TC-04e: 損害賠償金の課税該当性要確認。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="損害賠償金", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=500000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04e"
        assert findings[0].error_type == "gray_review"

    def test_negative(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="損害賠償金", tax_label="対象外",
                              debit_amount=0, credit_amount=500000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_boundary_non_taxable_sales(self, schema, make_row_factory):
        """非課売上はTC-04eの対象外(gray_reviewは課税売上のみ)。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="損害賠償金", tax_label="非課売上",
                              debit_amount=0, credit_amount=500000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04f:
    """TC-04f: 雑収入で対価性のない収入(reverse_suspect)。"""

    def test_positive_with_kw(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="雑収入", tax_label="課税売上10%",
                              description="〇〇補助金入金",
                              debit_amount=0, credit_amount=200000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04f"
        assert findings[0].error_type == "reverse_suspect"
        assert findings[0].note == "reverse_detection"

    def test_negative_non_subject(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="雑収入", tax_label="対象外",
                              description="〇〇補助金",
                              debit_amount=0, credit_amount=200000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_falseflag_no_kw(self, schema, make_row_factory):
        """KWマッチなし → ノイズ防止でスキップ。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="雑収入", tax_label="課税売上10%",
                              description="仕入値引",
                              debit_amount=0, credit_amount=50000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_falseflag_asset_transfer(self, schema, make_row_factory):
        """asset_transfer KW は non_consideration ではないので検出しない。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="雑収入", tax_label="課税売上10%",
                              description="固定資産売却益",
                              debit_amount=0, credit_amount=300000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC04Exclusion:
    """TC-04 の排他制御テスト。"""

    def test_04a_excludes_04c(self, schema, make_row_factory):
        """受取利息 + 課税売上 → TC-04a のみ、TC-04c は出ない。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取利息", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=100)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-04a"  # TC-04c ではない

    def test_04b_message_variant_dividend(self, schema, make_row_factory):
        """受取配当金 → message に「配当金」を含む。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="受取配当金", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=5000)
        findings = run(_make_ctx(schema, [row]))
        assert "配当金" in findings[0].message

    def test_04b_message_variant_subsidy(self, schema, make_row_factory):
        """補助金収入 → message に「補助金」を含む。"""
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(account="補助金収入", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert "補助金" in findings[0].message
