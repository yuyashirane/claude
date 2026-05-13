"""V1-3-21 IS-03 (自販機特例) のユニットテスト。

検出 ID:
    IS-03a: 課税仕入 + 3万円未満 + 自販機 KW → advisory finding
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


_IS03_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-special-rules"
    / "checks" / "is03_vending_machine.py"
)


def _load_is03():
    mod_key = "v1_3_21_is03_test"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    spec = importlib.util.spec_from_file_location(mod_key, _IS03_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_IS03_PATH}")
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


class TestIS03a:
    """自販機 KW + 3万円未満 + 課税仕入 → IS-03a 検出。"""

    def test_positive_vending_machine(self, schema, make_row_factory):
        """雑費 + 自販機 + 200円 → IS-03a。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="雑費", tax_label="課対仕入10%",
            description="自販機 ペットボトル",
            transaction_date=date(2026, 3, 15),
            debit_amount=200, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "IS-03a"
        assert f.severity == "🟢 Low"
        assert f.confidence == 60
        assert "自販機" in f.message

    def test_positive_coin_parking(self, schema, make_row_factory):
        """旅費交通費 + コインパーキング → IS-03a (自販機・自動サービス機の範疇)。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="コインパーキング",
            transaction_date=date(2026, 3, 15),
            debit_amount=600, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-03a"

    def test_positive_coin_laundry(self, schema, make_row_factory):
        """福利厚生費 + コインランドリー → IS-03a。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="コインランドリー",
            transaction_date=date(2026, 3, 15),
            debit_amount=500, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-03a"

    def test_negative_amount_over_30000(self, schema, make_row_factory):
        """3 万円ちょうど → 検出なし (3 万円未満が対象)。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="雑費", tax_label="課対仕入10%",
            description="自販機", transaction_date=date(2026, 3, 15),
            debit_amount=30000, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_no_keyword(self, schema, make_row_factory):
        """KW なし → 検出なし (false positive 抑制)。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="雑費", tax_label="課対仕入10%",
            description="飲料水", transaction_date=date(2026, 3, 15),
            debit_amount=500, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_non_taxable(self, schema, make_row_factory):
        """非課税仕入 → 検出なし。"""
        is03 = _load_is03()
        row = make_row_factory(
            account="支払利息", tax_label="非課税仕入",
            description="自販機 (偶然)", transaction_date=date(2026, 3, 15),
            debit_amount=500, credit_amount=0,
        )
        findings = is03.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_empty_transactions(self, schema):
        is03 = _load_is03()
        assert is03.run(_make_ctx(schema, [])) == []
