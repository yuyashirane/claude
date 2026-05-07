"""V1-3-10 (check-tax-classification) スキーマ定義。

β2-E E2-a により、Finding / LinkHints / FindingDetail / Severity / ReviewLevel /
ErrorType / LinkTarget は共通スキーマ skills/_common/schema.py から re-export する形に
変更。
β2-E E4-1 / E4-2 により、TransactionRow / ReferenceBundle / CheckContext は
共通 Context スキーマ skills/_common/context.py から re-export する形に変更。
本ファイルは互換性維持のための re-export のみを保持する。

設計メモ: docs/design/V1-3-20_beta2_E_design_v2.md
変更履歴:
    - β2-E E2-a (f59efb2): Finding 系を _common/schema.py に昇格、re-export 化
    - β2-E E4-1 / E4-2: Context 系を _common/context.py に昇格、re-export 化
"""
from __future__ import annotations

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
# 共通 Context スキーマからの re-export (β2-E E4-1 / E4-2)
#
# 以下の型は skills/_common/context.py が正本。本ファイルは互換性維持のため
# re-export している。新規実装では _common.context から直接 import すること。
# ─────────────────────────────────────────────────────────────────────

from skills._common.context import (
    CheckContext,
    TransactionRow,
    ReferenceBundle,
)


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
    # 共通 Context スキーマからの re-export (3 種類、β2-E E4-1 / E4-2)
    "CheckContext",
    "TransactionRow",
    "ReferenceBundle",
]
