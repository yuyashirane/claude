"""V1-3-21 check モジュール群の共通判定ヘルパー。

各 check (is01-04) で重複する判定ロジックを集約:
- 期間判定 (少額特例の R5/10-R11/9)
- 金額取得 (TransactionRow の debit/credit から仕入額を取得)
- 起点税区分判定 (課税仕入 = 課税対象、非課税・対象外は除外)

設計メモ: 038-survey 報告書 §3.2 候補 A (フラット並列) + 共通 _shared.py
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checks/_shared.py
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal


# ═══════════════════════════════════════════════════════════════
# 少額特例の適用期間 (28改正法附則第53条の2)
# ═══════════════════════════════════════════════════════════════

SMALL_AMOUNT_PERIOD_START: date = date(2023, 10, 1)
"""少額特例適用開始日: 令和5年10月1日 (インボイス制度開始日)。"""

SMALL_AMOUNT_PERIOD_END: date = date(2029, 9, 30)
"""少額特例適用終了日: 令和11年9月30日 (経過措置終了)。"""


def is_within_small_amount_period(txn_date: date | None) -> bool:
    """取引日が少額特例適用期間内かを判定する。

    Args:
        txn_date: 取引日 (TransactionRow.transaction_date)

    Returns:
        True: R5/10/1 - R11/9/30 の範囲内
        False: 範囲外、または txn_date が None
    """
    if txn_date is None:
        return False
    return SMALL_AMOUNT_PERIOD_START <= txn_date <= SMALL_AMOUNT_PERIOD_END


def is_after_small_amount_period(txn_date: date | None) -> bool:
    """取引日が少額特例期間より後 (R11/10/1 以降) かを判定する。

    IS-01b (期間外発動) の検出に使用。
    """
    if txn_date is None:
        return False
    return txn_date > SMALL_AMOUNT_PERIOD_END


# ═══════════════════════════════════════════════════════════════
# 金額取得 (TransactionRow の借方/貸方から仕入額を取得)
# ═══════════════════════════════════════════════════════════════

def get_purchase_amount(row) -> Decimal:
    """仕入仕訳の金額 (税込) を取得する。

    課税仕入は通常借方計上だが、戻し仕訳 (返品等) では貸方計上の可能性も
    あるため、debit_amount > 0 なら debit、それ以外は credit を返す。

    Args:
        row: TransactionRow

    Returns:
        金額 (Decimal、税込)。両方 0 なら Decimal("0") を返す。
    """
    debit = getattr(row, "debit_amount", Decimal("0")) or Decimal("0")
    credit = getattr(row, "credit_amount", Decimal("0")) or Decimal("0")
    if debit > 0:
        return Decimal(debit)
    return Decimal(credit)


# ═══════════════════════════════════════════════════════════════
# 起点税区分判定 (V1-3-21 共通)
# ═══════════════════════════════════════════════════════════════

def is_purchase_for_invoice_special(code: int | None) -> bool:
    """インボイス特例の対象となる課税仕入かを判定する。

    対象: 課税仕入系全般 (標準10% + 軽減8% + 経過措置)。
    除外: 非課税・対象外・売上系。

    実装メモ:
        tax-code-categories.json で taxable_purchase は標準系 (183-190 等) のみ。
        軽減税率仕入 (163) は reduced_purchase に分類されるため、両方を OR で
        判定することでインボイス特例の対象を網羅する。

    Args:
        code: 税区分コード (int) または None

    Returns:
        True: 課税仕入系 (標準 + 軽減)
        False: それ以外
    """
    if code is None:
        return False
    # skills/_common/lib/tax_code_helpers から判定関数 import
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase,
        is_reduced_purchase,
    )
    return is_taxable_purchase(code) or is_reduced_purchase(code)


# ═══════════════════════════════════════════════════════════════
# 金額閾値定数
# ═══════════════════════════════════════════════════════════════

SMALL_AMOUNT_THRESHOLD: Decimal = Decimal("10000")
"""少額特例の金額閾値: 税込 1 万円未満 (28改正法附則53の2)。"""

PUBLIC_TRANSPORT_THRESHOLD: Decimal = Decimal("30000")
"""公共交通機関特例の金額閾値: 税込 3 万円未満 (施行令70の9第2項第1号)。"""

VENDING_MACHINE_THRESHOLD: Decimal = Decimal("30000")
"""自販機特例の金額閾値: 税込 3 万円未満 (施行規則26の6第1号)。"""
