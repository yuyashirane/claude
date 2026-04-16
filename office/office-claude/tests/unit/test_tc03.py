"""TC-03 のユニットテスト（6+α ケース）。

出典: STEP4-D 統合版 §III.2.5 TC-03a/b/c
設計原則: §III.5.1 fixture-based design / §III.5.2 最小限の assert
"""
from decimal import Decimal
from datetime import date
import pytest


# ── ヘルパー：TC-03 用の CheckContext を構築 ──

def _make_ctx(schema, rows):
    """TC-03 テスト用の CheckContext を構築する。

    tax_code_master に必要最小限の税区分を登録。
    """
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "対象外": "2",
            "非課仕入": "37",
            "課税売上10%": "129",
            "非課売上": "23",
        },
    )


class TestTC03a:
    """TC-03a: 給与系が課税区分。"""

    def test_positive_salary_taxable(self, schema, make_row_factory):
        """給与手当 + 課対仕入10% → TC-03a Finding が出る。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="給与手当",
            tax_label="課対仕入10%",
            description="2026年3月分給与",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 1
        assert findings[0].sub_code == "TC-03a"
        assert findings[0].confidence >= 80

    def test_negative_salary_non_subject(self, schema, make_row_factory):
        """給与手当 + 対象外 → Finding 出ない（正常）。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="給与手当",
            tax_label="対象外",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 0


class TestTC03b:
    """TC-03b: 法定福利費が課税区分。"""

    def test_positive_social_insurance_taxable(self, schema, make_row_factory):
        """法定福利費 + 課対仕入10% → TC-03b Finding が出る。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="法定福利費",
            tax_label="課対仕入10%",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 1
        assert findings[0].sub_code == "TC-03b"
        assert findings[0].confidence >= 80

    def test_negative_social_insurance_non_taxable(self, schema, make_row_factory):
        """法定福利費 + 非課仕入 → Finding 出ない（正常）。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="法定福利費",
            tax_label="非課仕入",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 0


class TestTC03c:
    """TC-03c: 法定福利費が対象外（許容パターン）。"""

    def test_positive_social_insurance_non_subject(self, schema, make_row_factory):
        """法定福利費 + 対象外 → TC-03c Finding が出る(mild_warning)。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="法定福利費",
            tax_label="対象外",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 1
        assert findings[0].sub_code == "TC-03c"
        assert findings[0].error_type == "mild_warning"
        assert findings[0].note == "tax_impact_negligible"
        assert findings[0].show_by_default is False

    def test_negative_taxable_triggers_03b_not_03c(self, schema, make_row_factory):
        """法定福利費 + 課対仕入10% → TC-03b が出る（TC-03c は出ない）。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="法定福利費",
            tax_label="課対仕入10%",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 1
        assert findings[0].sub_code == "TC-03b"  # TC-03c ではない


class TestTC03Collision:
    """TC-03 の衝突防止テスト。"""

    def test_fukuri_kougei_no_hit(self, schema, make_row_factory):
        """福利厚生費は TC-03 に引っかからない（完全一致で衝突しない）。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="福利厚生費",
            tax_label="課対仕入10%",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 0

    def test_retirement_confidence_80(self, schema, make_row_factory):
        """退職給付費用 → confidence=80（給与系本体は90だが退職給付費用だけ80）。"""
        from checks.tc03_payroll import run

        row = make_row_factory(
            account="退職給付費用",
            tax_label="課対仕入10%",
        )
        ctx = _make_ctx(schema, [row])
        findings = run(ctx)

        assert len(findings) == 1
        assert findings[0].sub_code == "TC-03a"
        assert findings[0].confidence == 80
