"""V1-3-21 IS-04 (出張旅費特例) のユニットテスト。

検出 ID:
    IS-04a: 課税仕入 + 旅費交通費系 + 従業員精算 KW → advisory finding

IS-04b (通常必要範囲超過) は 039 スコープ外。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


_IS04_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-special-rules"
    / "checks" / "is04_travel_expense.py"
)


def _load_is04():
    mod_key = "v1_3_21_is04_test"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    spec = importlib.util.spec_from_file_location(mod_key, _IS04_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_IS04_PATH}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_key] = mod
    spec.loader.exec_module(mod)
    return mod


def _make_ctx(schema, rows):
    return schema.CheckContext(
        company_id="10794380",
        fiscal_year_id="fy2026",
        period_start=date(2025, 6, 1),
        period_end=date(2025, 12, 31),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "課対仕入8%(軽)": "163",
            "対象外": "2",
            "非課税仕入": "37",
        },
    )


class TestIS04a:
    """旅費交通費 + 従業員精算 KW → IS-04a 検出。"""

    def test_positive_shucho(self, schema, make_row_factory):
        """旅費交通費 + 「出張」KW → IS-04a。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="営業 出張 精算", transaction_date=date(2026, 3, 15),
            debit_amount=15000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "IS-04a"
        assert f.severity == "🟡 Medium"
        assert f.confidence == 60
        assert "出張旅費特例" in f.message

    def test_positive_seisan(self, schema, make_row_factory):
        """旅費交通費 + 「精算」KW → IS-04a。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="従業員 精算分", transaction_date=date(2026, 3, 15),
            debit_amount=8000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-04a"

    def test_positive_tatekae(self, schema, make_row_factory):
        """旅費交通費 + 「立替」KW → IS-04a。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="社員 立替金", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-04a"

    def test_positive_high_amount(self, schema, make_row_factory):
        """旅費交通費 + 出張 KW + 高額 (10万円超) でも IS-04a 検出。

        IS-04b (通常必要範囲超過) は 039 スコープ外のため、本ラウンドでは
        金額閾値なく検出。040-discuss / 第 10 ラウンドで IS-04b を追加する際に
        分離する。
        """
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="海外 出張 精算", transaction_date=date(2026, 3, 15),
            debit_amount=200000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-04a"

    def test_negative_not_transport_account(self, schema, make_row_factory):
        """旅費交通費以外 + 精算 KW → 検出なし。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="経費精算", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_no_employee_keyword(self, schema, make_row_factory):
        """旅費交通費 + 出張 KW なし → 検出なし (false positive 抑制)。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="JR 切符", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_non_taxable(self, schema, make_row_factory):
        """非課税仕入 → 検出なし。"""
        is04 = _load_is04()
        row = make_row_factory(
            account="旅費交通費", tax_label="非課税仕入",
            description="出張 精算", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is04.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_empty_transactions(self, schema):
        is04 = _load_is04()
        assert is04.run(_make_ctx(schema, [])) == []
