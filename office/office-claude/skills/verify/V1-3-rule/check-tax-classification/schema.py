"""V1-3-10 (check-tax-classification) スキーマ定義。

β2-E E2-a により、Finding / LinkHints / FindingDetail / Severity / ReviewLevel /
ErrorType / LinkTarget は共通スキーマ skills/_common/schema.py から re-export する形に
変更。本ファイルは V1-3-10 固有の型のみを保持する。

V1-3-10 固有の型 (E4 で共通化予定):
    - TransactionRow      入力仕訳の正規形
    - ReferenceBundle     references/JSON 辞書の束
    - CheckContext        Skill 実行時に注入される環境情報

設計メモ: docs/design/V1-3-20_beta2_E_design_v0.md
変更履歴: 元の Finding/LinkHints/FindingDetail dataclass 定義は f59efb2 で
         _common/schema.py に昇格済。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

# ─────────────────────────────────────────────────────────────────────
# 共通スキーマからの re-export
#
# 以下の型は skills/_common/schema.py が正本。本ファイルは互換性維持のため
# re-export している。新規実装では _common.schema から直接 import すること。
# ─────────────────────────────────────────────────────────────────────

from skills._common.schema import (
    Finding,
    FindingDetail,
    LinkHints,
    Severity,
    ErrorType,
    ReviewLevel,
    LinkTarget,
)


# ─────────────────────────────────────────────────────────────────────
# 2.5 TransactionRow (V1-3-10 固有、E4 で共通化予定)
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# 2.6 ReferenceBundle (V1-3-10 固有、E4 で共通化予定)
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# 2.4 CheckContext (V1-3-10 固有、E4 で共通化予定)
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CheckContext:
    """Skill 実行時に注入される環境情報。

    V1-3-10 固有のため本ファイルに残置。E4 (Context 統合) で共通スキーマへ
    昇格予定。
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


# ─────────────────────────────────────────────────────────────────────
# __all__ (元の 10 シンボルを維持)
# ─────────────────────────────────────────────────────────────────────

__all__ = [
    # 共通スキーマからの re-export (7 種類)
    "Severity",
    "ErrorType",
    "ReviewLevel",
    "LinkTarget",
    "Finding",
    "FindingDetail",
    "LinkHints",
    # V1-3-10 固有 (3 種類、E4 で共通化予定)
    "CheckContext",
    "TransactionRow",
    "ReferenceBundle",
]
