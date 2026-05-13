"""V1-3-21 IS-02 (公共交通機関特例) のユニットテスト。

検出 ID:
    IS-02a: 課税仕入 + 旅費交通費系 + 3万円未満 + 公共交通 positive KW (advisory)
    IS-02b: 課税仕入 + 旅費交通費系 + タクシー等 negative KW (warning)

特に重要: タクシー/ハイヤー/航空券は公共交通機関特例の対象外 (negative match)。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


_IS02_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-special-rules"
    / "checks" / "is02_public_transport.py"
)


def _load_is02():
    mod_key = "v1_3_21_is02_test"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    spec = importlib.util.spec_from_file_location(mod_key, _IS02_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_IS02_PATH}")
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


# ═════════════════════════════════════════════════════════════
# IS-02a: 公共交通機関 positive KW
# ═════════════════════════════════════════════════════════════

class TestIS02a:
    """旅費交通費 + 3万円未満 + 公共交通 KW で advisory finding。"""

    def test_positive_jr(self, schema, make_row_factory):
        """旅費交通費 + JR + 5000円 → IS-02a 検出。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="JR 東京→大阪", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "IS-02a"
        assert f.severity == "🟡 Medium"
        assert f.confidence == 70
        assert "JR" in f.message

    def test_positive_subway(self, schema, make_row_factory):
        """旅費交通費 + 東京メトロ → IS-02a 検出。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="東京メトロ", transaction_date=date(2026, 3, 15),
            debit_amount=300, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02a"

    def test_positive_bus(self, schema, make_row_factory):
        """旅費交通費 + バス → IS-02a 検出。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="高速バス", transaction_date=date(2026, 3, 15),
            debit_amount=3000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02a"

    def test_positive_suica(self, schema, make_row_factory):
        """旅費交通費 + Suica チャージ → IS-02a 検出。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="Suica チャージ", transaction_date=date(2026, 3, 15),
            debit_amount=2000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02a"

    def test_negative_amount_over_30000(self, schema, make_row_factory):
        """3 万円ちょうど → 検出なし (3 万円未満が対象)。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="新幹線 東京-博多", transaction_date=date(2026, 3, 15),
            debit_amount=30000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_not_transport_account(self, schema, make_row_factory):
        """旅費交通費以外の科目 → 検出なし。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="JR 切符代", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_no_keyword(self, schema, make_row_factory):
        """旅費交通費 + KW なし → 検出なし (判別不能で false positive 抑制)。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="出張交通費", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert findings == []


# ═════════════════════════════════════════════════════════════
# IS-02b: タクシー等 negative KW (対象外 warning)
# ═════════════════════════════════════════════════════════════

class TestIS02b:
    """タクシー・ハイヤー・航空券は公共交通機関特例の対象外 → warning。"""

    def test_negative_taxi(self, schema, make_row_factory):
        """旅費交通費 + タクシー → IS-02b 検出 (対象外 warning)。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="タクシー代", transaction_date=date(2026, 3, 15),
            debit_amount=3000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "IS-02b"
        assert f.severity == "🟠 High"
        assert f.confidence == 80
        assert "タクシー" in f.message
        assert "対象外" in f.message

    def test_negative_uber(self, schema, make_row_factory):
        """Uber → IS-02b 検出。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="Uber 利用", transaction_date=date(2026, 3, 15),
            debit_amount=2500, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02b"

    def test_negative_airline_ana(self, schema, make_row_factory):
        """ANA (航空券) → IS-02b 検出 (航空券は対象外)。"""
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="ANA 国内線", transaction_date=date(2026, 3, 15),
            debit_amount=20000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02b"

    def test_negative_priority_over_positive(self, schema, make_row_factory):
        """positive + negative 両方マッチ → negative 優先 (IS-02b 優先)。

        例: 「電車で空港まで、その後 ANA で大阪へ」のような複合摘要。
        実際は IS-02b を優先して warning を出す方が安全。
        """
        is02 = _load_is02()
        row = make_row_factory(
            account="旅費交通費", tax_label="課対仕入10%",
            description="電車 → ANA 大阪",  # 電車 (positive) + ANA (negative)
            transaction_date=date(2026, 3, 15),
            debit_amount=25000, credit_amount=0,
        )
        findings = is02.run(_make_ctx(schema, [row]))
        # negative 優先で IS-02b
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-02b"


# ═════════════════════════════════════════════════════════════
# 全体動作
# ═════════════════════════════════════════════════════════════

class TestIS02General:
    """混合 ctx と空 ctx の動作。"""

    def test_multiple_rows(self, schema, make_row_factory):
        is02 = _load_is02()
        rows = [
            # IS-02a (公共交通)
            make_row_factory(
                wallet_txn_id="t1",
                account="旅費交通費", tax_label="課対仕入10%",
                description="JR 出張", transaction_date=date(2026, 3, 15),
                debit_amount=5000, credit_amount=0,
            ),
            # IS-02b (タクシー)
            make_row_factory(
                wallet_txn_id="t2",
                account="旅費交通費", tax_label="課対仕入10%",
                description="タクシー", transaction_date=date(2026, 3, 15),
                debit_amount=3000, credit_amount=0,
            ),
            # 検出なし (KW なし)
            make_row_factory(
                wallet_txn_id="t3",
                account="旅費交通費", tax_label="課対仕入10%",
                description="交通費", transaction_date=date(2026, 3, 15),
                debit_amount=5000, credit_amount=0,
            ),
        ]
        findings = is02.run(_make_ctx(schema, rows))
        assert len(findings) == 2
        sub_codes = sorted(f.sub_code for f in findings)
        assert sub_codes == ["IS-02a", "IS-02b"]

    def test_empty_transactions(self, schema):
        is02 = _load_is02()
        assert is02.run(_make_ctx(schema, [])) == []
