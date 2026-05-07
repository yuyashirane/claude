"""
共通 Context スキーマ定義 (V1-3-20 β2-E クラスタ E4)

V1-3-10 / V1-3-20 が共通で使用する Context 系データクラス群を提供する。
本ファイルは V1-3-10 既存スキーマ (skills/verify/V1-3-rule/check-tax-classification/schema.py)
の TransactionRow / ReferenceBundle / CheckContext をそのまま昇格した形。

E4-1 (本ファイル新設) では中身を一切改変せず純粋に「移動」のみを行った。
E4-3a で CheckContext に target_month / single_month を Optional として追加。
InvoiceCheckContext の削除と V1-3-20 寄せは E4-3b で実施する。

設計メモ: docs/design/V1-3-20_beta2_E_design_v2.md
事前調査: docs/analysis/v1-3-context-survey-2026-05-07.md
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


# ===========================================================================
# TransactionRow (V1-3-10 既存をそのまま昇格)
# ===========================================================================

@dataclass(frozen=True)
class TransactionRow:
    """仕訳1件の正規形。

    V1-3-10 固有のため本ファイルに残置。E4 (Context 統合) で共通スキーマへ
    昇格予定。
    """

    wallet_txn_id: str

    deal_id: Optional[str] = None
    transaction_date: Optional[date] = None
    account: str = ""
    tax_label: str = ""
    partner: str = ""
    description: str = ""

    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")

    item: Optional[str] = None
    section: Optional[str] = None
    memo_tag: Optional[str] = None
    notes: Optional[str] = None

    raw: Optional[dict] = None


# ===========================================================================
# ReferenceBundle (V1-3-10 既存をそのまま昇格)
#
# load_for_skill / get の実体は skills/_common/lib/finding_factory.py 側にあり、
# 本ファイルではスタブ (NotImplementedError) のまま維持する。
# ===========================================================================

@dataclass(frozen=True)
class ReferenceBundle:
    """references/JSON 辞書の束。

    V1-3-10 固有のため本ファイルに残置。E4 (Context 統合) で共通スキーマへ
    昇格予定。
    """

    common: dict[str, dict] = field(default_factory=dict)
    skill_specific: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def load_for_skill(cls, skill_name: str) -> "ReferenceBundle":
        raise NotImplementedError(
            "ReferenceBundle.load_for_skill is implemented in Part 2 "
            "(finding_factory.py). Phase 1 Part 1 では schema 定義のみ。"
        )

    def get(self, category: str, key: str) -> dict:
        raise NotImplementedError(
            "ReferenceBundle.get is implemented in Part 2 "
            "(finding_factory.py). Phase 1 Part 1 では schema 定義のみ。"
        )


# ===========================================================================
# CheckContext (V1-3-10 既存をそのまま昇格)
# ===========================================================================

@dataclass(frozen=True)
class CheckContext:
    """Skill 実行時に注入される環境情報。

    β2-E E4-3a で V1-3-20 用の target_month / single_month を Optional として追加。
    V1-3-10 系では未使用、V1-3-20 系の月次/単月チェックで使用する。
    """

    company_id: str
    fiscal_year_id: str
    period_start: date
    period_end: date

    transactions: list[TransactionRow] = field(default_factory=list)

    account_master: dict[str, dict] = field(default_factory=dict)
    tax_code_master: dict[str, str] = field(default_factory=dict)
    partner_master: dict[str, dict] = field(default_factory=dict)

    references: Optional[ReferenceBundle] = None

    company_name: str = ""
    skill_name: str = ""
    debug_mode: bool = False

    # V1-3-20 用 (β2-E E4-3a で追加)
    target_month: Optional[date] = None  # 月次対象 (パターン 2/3)
    single_month: bool = False           # 単一月チェックフラグ (パターン 3)


__all__ = [
    "CheckContext",
    "TransactionRow",
    "ReferenceBundle",
]
