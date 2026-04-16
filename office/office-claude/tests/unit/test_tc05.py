"""TC-05 のユニットテスト(Pattern B 派生: 動的エリア + デュアルルート)。"""
from datetime import date


def _make_ctx(schema, rows):
    """TC-05 テスト用の CheckContext。仕入系・対象外を含む税区分を登録。"""
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "非課仕入": "37",
            "課税売上10%": "129",
            "非課売上": "23",
            "対象外": "2",
        },
    )


class TestTC05a:
    """TC-05a: 支払利息が課税仕入等(direct_error, A11)。"""

    def test_positive_taxable_purchase(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払利息", tax_label="課対仕入10%",
                              debit_amount=1000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05a"
        assert findings[0].error_type == "direct_error"
        assert findings[0].area == "A11"
        assert findings[0].subarea == "non_operating_expense"

    def test_negative_non_taxable_purchase(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払利息", tax_label="非課仕入",
                              debit_amount=1000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC05b:
    """TC-05b: 保険料が課税仕入等(direct_error, A10)。"""

    def test_positive_insurance(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="損害保険料", tax_label="課対仕入10%",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05b"
        assert findings[0].area == "A10"
        assert findings[0].confidence == 90

    def test_life_insurance_variant(self, schema, make_row_factory):
        """生命保険料 → confidence=72 + 積立型 message variant。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="生命保険料", tax_label="課対仕入10%",
                              debit_amount=10000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05b"
        assert findings[0].confidence == 72
        assert "積立型" in findings[0].message

    def test_negative(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="損害保険料", tax_label="非課仕入",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC05c:
    """TC-05c: 支払利息が対象外=許容(mild_warning)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払利息", tax_label="対象外",
                              debit_amount=500, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05c"
        assert findings[0].error_type == "mild_warning"
        assert findings[0].show_by_default is False
        assert findings[0].note == "affects_taxable_sales_ratio"


class TestTC05d:
    """TC-05d: 保険料が対象外=許容(mild_warning)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="損害保険料", tax_label="対象外",
                              debit_amount=3000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05d"
        assert findings[0].error_type == "mild_warning"
        assert findings[0].area == "A10"


class TestTC05e:
    """TC-05e: 保証料(gray_review, デュアルルート)。"""

    def test_route_a_guarantee_direct(self, schema, make_row_factory):
        """Route A: 保証料科目 + 課税仕入 → confidence=85。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="保証料", tax_label="課対仕入10%",
                              debit_amount=10000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05e"
        assert findings[0].error_type == "gray_review"
        assert findings[0].confidence == 85
        assert findings[0].area == "A10"

    def test_route_b_payment_fee_with_kw(self, schema, make_row_factory):
        """Route B: 支払手数料 + 課税仕入 + guarantee KW → confidence=70。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払手数料", tax_label="課対仕入10%",
                              description="信用保証協会への保証料",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05e"
        assert findings[0].confidence == 70
        assert findings[0].note is None  # Phase 3-R で reverse_detection マーカーを削除

    def test_route_b_negative_no_kw(self, schema, make_row_factory):
        """支払手数料 + KWなし → 検出しない。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払手数料", tax_label="課対仕入10%",
                              description="銀行振込手数料",
                              debit_amount=500, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC05Exclusion:
    """TC-05 の排他制御・構造確認。"""

    def test_05a_excludes_05c(self, schema, make_row_factory):
        """支払利息 + 課税仕入 → TC-05a のみ、TC-05c は出ない。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="支払利息", tax_label="課対仕入10%",
                              debit_amount=1000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-05a"

    def test_dynamic_area(self, schema, make_row_factory):
        """interest→A11 / insurance→A10 の動的エリア割当を確認。"""
        from checks.tc05_non_taxable_expense import run
        row1 = make_row_factory(account="支払利息", tax_label="課対仕入10%",
                               debit_amount=1000, credit_amount=0)
        row2 = make_row_factory(account="損害保険料", tax_label="課対仕入10%",
                               debit_amount=1000, credit_amount=0)
        findings = run(_make_ctx(schema, [row1, row2]))
        assert len(findings) == 2
        areas = {f.sub_code: f.area for f in findings}
        assert areas["TC-05a"] == "A11"
        assert areas["TC-05b"] == "A10"

    def test_unrelated_account_ignored(self, schema, make_row_factory):
        """TC-05 対象外の科目は無視される。"""
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(account="通信費", tax_label="課対仕入10%",
                              debit_amount=1000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0
