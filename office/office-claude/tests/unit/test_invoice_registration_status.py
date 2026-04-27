"""V1-3-20 check-invoice-registration-status (α) の最小テスト。

3 条件 AND フィルタの基本挙動を 5 ケースで担保する:
    1. 3 条件すべて充足 → 候補に含まれる
    2. 適格マーク有り → 除外
    3. 課税仕入でない (非課仕入) → 除外
    4. 20 万円未満 → 除外、20 万円ちょうどは含む (>= 判定)
    5. 複数行混在シナリオ → 該当行のみが順序保持で抽出される

V1-3-10 のテスト群と独立しており、共有 conftest を変更せずに動作する。
ハイフン区切りディレクトリへのアクセスは importlib 経由で行う。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest


# ─────────────────────────────────────────────────────────────────────
# モジュールロード (ハイフン入りパッケージのため importlib 経由)
# ─────────────────────────────────────────────────────────────────────

_RUN_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-registration-status" / "run.py"
)


def _load_v1_3_20_run():
    name = "v1_3_20_invoice_run"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _RUN_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_RUN_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def v1320():
    return _load_v1_3_20_run()


# ─────────────────────────────────────────────────────────────────────
# テスト本体
# ─────────────────────────────────────────────────────────────────────

class TestInvoiceCandidatesAlpha:
    """V1-3-20 α 実装の 3 条件 AND フィルタ最小テスト。"""

    def test_all_three_conditions_met(self, v1320):
        """3 条件すべて充足: 候補に含まれる。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t1",
            transaction_date=date(2025, 12, 1),
            partner="未登録ベンダー A",
            description="広告費",
            tax_label="課対仕入10%",
            debit_amount=Decimal("250000"),
            is_qualified_invoice=False,
        )
        result = v1320.find_candidates([row])
        assert result == [row]

    def test_qualified_invoice_excluded(self, v1320):
        """適格マーク有り: 他の 2 条件を満たしても除外される。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t2",
            tax_label="課対仕入10%",
            debit_amount=Decimal("500000"),
            is_qualified_invoice=True,
        )
        assert v1320.find_candidates([row]) == []

    def test_non_taxable_purchase_excluded(self, v1320):
        """課税仕入でない (非課仕入など): 除外される。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t3",
            tax_label="非課仕入",
            debit_amount=Decimal("300000"),
            is_qualified_invoice=False,
        )
        assert v1320.find_candidates([row]) == []

    def test_amount_threshold_boundary(self, v1320):
        """20 万円未満は除外、20 万円ちょうどは含む (>= 判定)。"""
        below = v1320.InvoiceCheckRow(
            wallet_txn_id="t4-below",
            tax_label="課対仕入10%",
            debit_amount=Decimal("199999"),
            is_qualified_invoice=False,
        )
        exact = v1320.InvoiceCheckRow(
            wallet_txn_id="t4-exact",
            tax_label="課対仕入10%",
            debit_amount=Decimal("200000"),
            is_qualified_invoice=False,
        )
        result = v1320.find_candidates([below, exact])
        assert result == [exact]

    def test_mixed_rows_preserve_order(self, v1320):
        """複数行混在で該当のみが入力順を保って抽出される。"""
        rows = [
            # 該当: 3 条件すべて OK
            v1320.InvoiceCheckRow(
                wallet_txn_id="A",
                tax_label="課対仕入10%",
                debit_amount=Decimal("300000"),
                is_qualified_invoice=False,
            ),
            # 除外: 適格マーク有り
            v1320.InvoiceCheckRow(
                wallet_txn_id="B",
                tax_label="課対仕入10%",
                debit_amount=Decimal("400000"),
                is_qualified_invoice=True,
            ),
            # 除外: 非課仕入
            v1320.InvoiceCheckRow(
                wallet_txn_id="C",
                tax_label="非課仕入",
                debit_amount=Decimal("500000"),
                is_qualified_invoice=False,
            ),
            # 除外: 19 万円
            v1320.InvoiceCheckRow(
                wallet_txn_id="D",
                tax_label="課対仕入10%",
                debit_amount=Decimal("190000"),
                is_qualified_invoice=False,
            ),
            # 該当: 20 万円ちょうど (boundary)
            v1320.InvoiceCheckRow(
                wallet_txn_id="E",
                tax_label="課税仕入10%",
                debit_amount=Decimal("200000"),
                is_qualified_invoice=False,
            ),
        ]
        result = v1320.find_candidates(rows)
        assert [r.wallet_txn_id for r in result] == ["A", "E"]
