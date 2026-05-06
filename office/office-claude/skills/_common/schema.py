"""
共通 Finding スキーマ定義 (V1-3-20 β2-E クラスタ E1)

V1-3-10 / V1-3-20 が共通で使用する Finding データクラス群を提供する。
本ファイルは V1-3-10 既存スキーマ (skills/verify/V1-3-rule/check-tax-classification/schema.py)
をベースに、V1-3-20 由来の属性を追加した形。

設計メモ: docs/design/V1-3-20_beta2_E_design_v0.md
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal, Optional


# ===========================================================================
# Severity / ReviewLevel / ErrorType / LinkTarget
#
# Severity と ReviewLevel は β2-E で名称刷新。新旧の互換変換マップは
# 本ファイル末尾の SEVERITY_LEGACY_MAP / REVIEW_LEVEL_LEGACY_MAP を参照。
# V1-3-10 既存値からの全面置換は E2 (V1-3-10 移行) で実施する。
# ===========================================================================

Severity = Literal["🔴 Critical", "🟠 High", "🟡 Medium", "🟢 Low"]
ReviewLevel = Literal["🔴 必須確認", "🟠 重点確認", "🟡 通常確認", "🟢 参考確認"]
# ErrorType は深刻度順(direct_error → reverse_suspect → invoice_warning →
# gray_review → mild_warning)。invoice_warning は β2-E E3-pre で追加、
# V1-3-20 系の警告(インボイス未登録の検出等)を表す。
ErrorType = Literal[
    "direct_error",
    "reverse_suspect",
    "invoice_warning",  # V1-3-20 系の警告 (β2-E E3-pre で追加)
    "gray_review",
    "mild_warning",
]
LinkTarget = Literal["general_ledger", "journal", "deal_detail"]


# ===========================================================================
# LinkHints (V1-3-10 既存をそのまま昇格)
# ===========================================================================

@dataclass(frozen=True)
class LinkHints:
    """freee 画面への導線ヒント。URL は含まず、意図のみを宣言する。

    target 別の必須フィールド:
        general_ledger: account_name, period_start, period_end
        journal:        period_start, period_end
        deal_detail:    deal_id
    """

    target: LinkTarget

    # ─── general_ledger 用 ───
    account_name: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    tax_group_codes: Optional[list[str]] = None

    # ─── deal_detail 用 ───
    deal_id: Optional[str] = None

    # ─── 全 target 共通 ───
    fiscal_year_id: Optional[str] = None
    company_id: Optional[str] = None


# ===========================================================================
# FindingDetail (V1-3-10 既存をそのまま昇格)
# ===========================================================================

@dataclass(frozen=True)
class FindingDetail:
    """Finding の詳細情報(根拠・推奨アクション・スナップショット)。"""

    matched_rules: list[str] = field(default_factory=list)
    evidence: dict[str, str] = field(default_factory=dict)
    confidence_breakdown: dict[str, int] = field(default_factory=dict)
    recommended_actions: list[str] = field(default_factory=list)
    related_law: Optional[str] = None
    related_docs: list[str] = field(default_factory=list)


# ===========================================================================
# Finding (共通スキーマ本体)
#
# 構造: V1-3-10 既存 Finding の全属性 + V1-3-20 由来の追加属性 5 個 (Optional)
# ===========================================================================

@dataclass(frozen=True)
class Finding:
    """V1-3-10 / V1-3-20 共通の Finding。

    V1-3-10 既存属性をそのまま昇格し、末尾に V1-3-20 由来の 5 属性を Optional で追加。
    """

    # === V1-3-10 既存属性 (順序・型・デフォルトは V1-3-10 schema.py に完全準拠) ===
    tc_code: str
    sub_code: str
    severity: Severity
    error_type: ErrorType
    review_level: ReviewLevel
    area: str
    sort_priority: int
    wallet_txn_id: str = ""
    current_value: str = ""
    suggested_value: str = ""
    confidence: int = 50
    message: str = ""
    debit_amount: Optional[int] = None
    credit_amount: Optional[int] = None
    subarea: Optional[str] = None
    show_by_default: bool = True
    deal_id: Optional[str] = None
    link_hints: Optional[LinkHints] = None
    detail: Optional[FindingDetail] = None
    note: Optional[str] = None

    # === V1-3-20 由来の追加属性 (すべて Optional、デフォルト None) ===
    classification: Optional[str] = None
    partner: Optional[str] = None
    transaction_date: Optional[str] = None  # YYYY-MM-DD 形式
    is_qualified_invoice: Optional[bool] = None
    tax_code: Optional[int] = None  # 税区分コード(V1-3-20 raw["tax_code"] と同型)


# ===========================================================================
# 互換変換マップ (E2 で V1-3-10 既存値を新名称へ置換する際に使用)
#
# E2 着手時にこのマップを使って V1-3-10 のテストフィクスチャ・create_finding
# 呼び出し箇所を機械的に置換する。E1 の段階では「定義だけ置く」状態。
# ===========================================================================

SEVERITY_LEGACY_MAP: dict[str, Severity] = {
    "🔴 High": "🔴 Critical",
    "🟡 Medium": "🟡 Medium",
    "🟠 Warning": "🟠 High",
    "🟢 Low": "🟢 Low",
}

REVIEW_LEVEL_LEGACY_MAP: dict[str, ReviewLevel] = {
    "🔴必修": "🔴 必須確認",
    "🟡判断": "🟡 通常確認",
    "🟠警戒": "🟠 重点確認",
    "🟢参考": "🟢 参考確認",
}


__all__ = [
    "Severity",
    "ReviewLevel",
    "ErrorType",
    "LinkTarget",
    "LinkHints",
    "FindingDetail",
    "Finding",
    "SEVERITY_LEGACY_MAP",
    "REVIEW_LEVEL_LEGACY_MAP",
]
