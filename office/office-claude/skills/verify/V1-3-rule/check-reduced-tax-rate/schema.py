"""V1-3-11 (check-reduced-tax-rate) スキーマ定義。

V1-3-10 (check-tax-classification) の schema.py と同形の re-export モジュール。
Finding 系は skills/_common/schema.py、Context 系は skills/_common/context.py が
正本で、本ファイルは互換性維持のための re-export のみを保持する。

設計メモ: 035-survey 報告書 §1.2 / §3.2.2
配置: skills/verify/V1-3-rule/check-reduced-tax-rate/schema.py
"""
from __future__ import annotations

from skills._common.schema import (
    Finding,
    FindingDetail,
    LinkHints,
    Severity,
    ErrorType,
    ReviewLevel,
    LinkTarget,
)

from skills._common.context import (
    CheckContext,
    TransactionRow,
    ReferenceBundle,
)


__all__ = [
    "Severity",
    "ErrorType",
    "ReviewLevel",
    "LinkTarget",
    "Finding",
    "FindingDetail",
    "LinkHints",
    "CheckContext",
    "TransactionRow",
    "ReferenceBundle",
]
