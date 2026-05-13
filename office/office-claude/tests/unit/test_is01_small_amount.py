"""V1-3-21 IS-01 (少額特例) のユニットテスト。

検出 ID:
    IS-01a: 期間内 (R5/10/1 - R11/9/30) + 課税仕入 + 1万円未満 (advisory)
    IS-01b: 期間外 (R11/10/1 以降) + 課税仕入 + 1万円未満 (warning)

import 戦略 (V1-3-11 と同じ):
    V1-3-21 は `checks/` サブパッケージ名が V1-3-10/11 と衝突するため、
    importlib で独立した sys.modules キー (v1_3_21_is01_test) でロード。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path


# ─────────────────────────────────────────────────────────────
# is01_small_amount のロード
# ─────────────────────────────────────────────────────────────

_IS01_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-special-rules"
    / "checks" / "is01_small_amount.py"
)


def _load_is01():
    mod_key = "v1_3_21_is01_test"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    spec = importlib.util.spec_from_file_location(mod_key, _IS01_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_IS01_PATH}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_key] = mod
    spec.loader.exec_module(mod)
    return mod


# ─────────────────────────────────────────────────────────────
# CheckContext factory (V1-3-21 用)
# ─────────────────────────────────────────────────────────────

def _make_ctx(schema, rows):
    """V1-3-21 テスト用の CheckContext。仕入系の税区分を登録。"""
    return schema.CheckContext(
        company_id="10794380",
        fiscal_year_id="fy2026",
        period_start=date(2025, 6, 1),
        period_end=date(2025, 12, 31),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "課対仕入8%(軽)": "163",
            "課対仕入(控80)10%": "189",
            "課対仕入(控50)10%": "190",
            "対象外": "2",
            "非課税仕入": "37",
            "課対仕入8%": "108",
        },
    )


# ═════════════════════════════════════════════════════════════
# IS-01a: 期間内 + 課税仕入 + 1万円未満 → advisory finding
# ═════════════════════════════════════════════════════════════

class TestIS01a:
    """期間内 (R5/10/1-R11/9/30) の少額仕入で advisory finding を出す。"""

    def test_positive_basic(self, schema, make_row_factory):
        """課税仕入10% + 9,800円 + 期間内 → IS-01a 検出。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具",
            transaction_date=date(2026, 3, 15),  # 期間内
            debit_amount=9800, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.tc_code == "V1-3-21"
        assert f.sub_code == "IS-01a"
        assert f.severity == "🟢 Low"
        assert f.confidence == 50
        assert f.area == "A15"
        assert "9,800" in f.message
        assert "少額特例" in f.message

    def test_positive_reduced_rate(self, schema, make_row_factory):
        """軽減税率8% + 5,000円 + 期間内 → IS-01a 検出 (税率問わず対象)。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入8%(軽)",
            description="弁当代", transaction_date=date(2026, 6, 10),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-01a"

    def test_positive_at_period_start(self, schema, make_row_factory):
        """R5/10/1 (期間開始日) ちょうど → IS-01a 検出。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2023, 10, 1),
            debit_amount=3000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-01a"

    def test_positive_at_period_end(self, schema, make_row_factory):
        """R11/9/30 (期間終了日) ちょうど → IS-01a 検出。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2029, 9, 30),
            debit_amount=3000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-01a"

    def test_negative_amount_10000(self, schema, make_row_factory):
        """1 万円ちょうど → 検出なし (1 万円未満が対象)。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2026, 3, 15),
            debit_amount=10000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_amount_over(self, schema, make_row_factory):
        """1 万円超 → 検出なし。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="高額消耗品", transaction_date=date(2026, 3, 15),
            debit_amount=15000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_non_taxable(self, schema, make_row_factory):
        """非課税仕入 → 検出なし (起点の課税仕入フィルタで除外)。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="支払利息", tax_label="非課税仕入",
            description="銀行利息", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_non_subject(self, schema, make_row_factory):
        """対象外 → 検出なし。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="租税公課", tax_label="対象外",
            description="印紙税", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_credit_only_returns_zero(self, schema, make_row_factory):
        """貸方仕訳のみ (戻し仕訳等) でも金額 > 0 なら検出する。

        get_purchase_amount は debit > 0 なら debit、それ以外は credit を返す。
        本テストは credit_amount > 0 で課税仕入の場合、特例適用候補として扱う。
        """
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="戻し仕訳", transaction_date=date(2026, 3, 15),
            debit_amount=0, credit_amount=5000,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        # credit_amount > 0 で 1 万円未満なら検出される (戻し仕訳含む)
        assert len(findings) == 1
        assert findings[0].sub_code == "IS-01a"


# ═════════════════════════════════════════════════════════════
# IS-01b: 期間外 (R11/10/1 以降) + 課税仕入 + 1万円未満 → warning
# ═════════════════════════════════════════════════════════════

class TestIS01b:
    """期間外 (R11/10/1 以降) で課税仕入 + 1万円未満なら warning。"""

    def test_positive_after_period(self, schema, make_row_factory):
        """R11/10/1 以降 + 1万円未満 → IS-01b 検出。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2029, 10, 1),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "IS-01b"
        assert f.severity == "🟡 Medium"
        assert f.confidence == 90
        assert "期間外" in f.message

    def test_negative_before_period(self, schema, make_row_factory):
        """R5/9/30 以前 (期間より前) → 検出なし (インボイス制度開始前)。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2023, 9, 30),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        # 期間外 (R5/9/30 以前) は IS-01a, IS-01b いずれも対象外
        assert findings == []


# ═════════════════════════════════════════════════════════════
# 全体動作: 複数 row 混合 / 空 ctx
# ═════════════════════════════════════════════════════════════

class TestIS01General:
    """複数 row 混合 / 空 ctx などの動作確認。"""

    def test_multiple_rows_mixed(self, schema, make_row_factory):
        """検出・期間外・非課税が混在 → 期待件数の Finding のみ。"""
        is01 = _load_is01()
        rows = [
            # IS-01a (期間内)
            make_row_factory(
                wallet_txn_id="t1",
                account="消耗品費", tax_label="課対仕入10%",
                description="文房具", transaction_date=date(2026, 3, 15),
                debit_amount=3000, credit_amount=0,
            ),
            # IS-01b (期間外)
            make_row_factory(
                wallet_txn_id="t2",
                account="消耗品費", tax_label="課対仕入10%",
                description="文房具", transaction_date=date(2029, 12, 1),
                debit_amount=8000, credit_amount=0,
            ),
            # 1 万円以上 → 検出なし
            make_row_factory(
                wallet_txn_id="t3",
                account="消耗品費", tax_label="課対仕入10%",
                description="高額", transaction_date=date(2026, 3, 15),
                debit_amount=15000, credit_amount=0,
            ),
            # 非課税 → 検出なし
            make_row_factory(
                wallet_txn_id="t4",
                account="支払利息", tax_label="非課税仕入",
                description="銀行利息", transaction_date=date(2026, 3, 15),
                debit_amount=2000, credit_amount=0,
            ),
        ]
        findings = is01.run(_make_ctx(schema, rows))
        assert len(findings) == 2
        sub_codes = sorted(f.sub_code for f in findings)
        assert sub_codes == ["IS-01a", "IS-01b"]

    def test_empty_transactions(self, schema):
        """空 ctx → 空 list (例外なし)。"""
        is01 = _load_is01()
        findings = is01.run(_make_ctx(schema, []))
        assert findings == []

    def test_finding_has_link_hints(self, schema, make_row_factory):
        """生成される Finding には link_hints (general_ledger) が付与される。"""
        is01 = _load_is01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具", transaction_date=date(2026, 3, 15),
            debit_amount=5000, credit_amount=0,
        )
        findings = is01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.link_hints is not None
        assert f.link_hints.target == "general_ledger"
