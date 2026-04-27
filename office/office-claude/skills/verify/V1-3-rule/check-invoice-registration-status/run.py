"""V1-3-20 インボイス登録状況チェック (α 解像度・最小実装)。

「適格マークなし × 課税仕入 × 20 万円以上」の 3 条件 AND フィルタで候補仕訳を
抽出する純粋関数モジュール。

設計方針:
    - I/O フリー: 本モジュールは外部 JSON / API / DB を読まない。
      fetch は SKILL.md (Claude Code エージェント) の責務。
    - α 解像度: 登録番号チェック / 経過措置 (80%/50%) / 少額特例 /
      公共交通費特例 は本リリースに含まない。
    - 配置・命名は V1-3-10 (check-tax-classification) を踏襲。
    - V1-3-10 の TransactionRow には依存せず、独立した最小型 InvoiceCheckRow
      を導入する (V1-3-10 コードへの変更を避けるため)。

公開 API:
    - InvoiceCheckRow: 入力仕訳の最小型 (frozen dataclass)
    - find_candidates(rows) -> list[InvoiceCheckRow]: 3 条件 AND フィルタ
    - is_taxable_purchase(tax_label) -> bool: 税区分が課税仕入系かの判定
    - AMOUNT_THRESHOLD: 20 万円 (固定、Decimal)
    - TAXABLE_PURCHASE_PREFIXES: 課税仕入と判定する税区分の prefix タプル

配置: skills/verify/V1-3-rule/check-invoice-registration-status/run.py
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional


# ─────────────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────────────

AMOUNT_THRESHOLD: Decimal = Decimal("200000")
"""借方金額の閾値 (20 万円)。α リリースでは固定。"""

TAXABLE_PURCHASE_PREFIXES: tuple[str, ...] = ("課対仕入", "課税仕入")
"""tax_label が課税仕入系であると判定する prefix の集合 (α 解像度の最小辞書)。

freee 会計の標準税区分名を踏襲:
    - 課対仕入10% / 課対仕入8%(軽) / 課対仕入(8%) など
    - 課税仕入10% / 課税仕入8%(軽) など
"""


# ─────────────────────────────────────────────────────────────────────
# 入力型
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InvoiceCheckRow:
    """V1-3-20 の入力仕訳行 (α)。

    V1-3-10 の TransactionRow と独立した最小型。fetch 層が freee deals
    レスポンスを本型に正規化して find_candidates() に渡す想定。

    Attributes:
        wallet_txn_id: 一意の取引 ID (必須)。
        transaction_date: 取引日 (オプション)。
        partner: 取引先名。
        description: 摘要。
        tax_label: 税区分名 (例: "課対仕入10%")。
        debit_amount: 借方金額 (Decimal)。
        credit_amount: 貸方金額 (Decimal)。
        is_qualified_invoice: 適格マークの有無 (True なら登録番号確認済)。
    """

    wallet_txn_id: str
    transaction_date: Optional[date] = None
    partner: str = ""
    description: str = ""
    tax_label: str = ""
    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")
    is_qualified_invoice: bool = False


# ─────────────────────────────────────────────────────────────────────
# 判定関数
# ─────────────────────────────────────────────────────────────────────

def is_taxable_purchase(tax_label: str) -> bool:
    """tax_label が課税仕入系かを α 解像度で判定する。

    判定基準:
        TAXABLE_PURCHASE_PREFIXES のいずれかで始まる文字列を「課税仕入」とみなす。

    Args:
        tax_label: 税区分名。

    Returns:
        課税仕入系なら True、それ以外は False。
    """
    if not tax_label:
        return False
    return any(tax_label.startswith(p) for p in TAXABLE_PURCHASE_PREFIXES)


def find_candidates(rows: Iterable[InvoiceCheckRow]) -> list[InvoiceCheckRow]:
    """3 条件 AND フィルタで候補仕訳を抽出する。

    条件 (すべて AND、α リリース):
        1. 適格マークなし: is_qualified_invoice == False
        2. 課税仕入: is_taxable_purchase(tax_label) == True
        3. 20 万円以上: debit_amount >= AMOUNT_THRESHOLD

    Args:
        rows: InvoiceCheckRow のイテラブル。

    Returns:
        3 条件すべてを満たす行のリスト。順序は入力順を保つ。
    """
    out: list[InvoiceCheckRow] = []
    for r in rows:
        if r.is_qualified_invoice:
            continue
        if not is_taxable_purchase(r.tax_label):
            continue
        if r.debit_amount < AMOUNT_THRESHOLD:
            continue
        out.append(r)
    return out


__all__ = [
    "AMOUNT_THRESHOLD",
    "TAXABLE_PURCHASE_PREFIXES",
    "InvoiceCheckRow",
    "is_taxable_purchase",
    "find_candidates",
]
