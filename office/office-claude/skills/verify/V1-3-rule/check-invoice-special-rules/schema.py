"""V1-3-21 (check-invoice-special-rules) スキーマ定義。

V1-3-11 の schema.py と同形の re-export モジュール。Finding 系は
skills/_common/schema.py、Context 系は skills/_common/context.py が正本。

設計メモ: 038-survey 報告書 §3.2 + 039 impl
配置: skills/verify/V1-3-rule/check-invoice-special-rules/schema.py
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
