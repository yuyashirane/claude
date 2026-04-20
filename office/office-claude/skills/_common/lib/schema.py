"""Phase 8-A 共通スキーマ: FindingLike Protocol + FindingGroup。

本ファイルは Phase 8-A で追加された Finding 集約層のためのスキーマを定義する。
既存の Finding 本体(check-tax-classification/schema.py)には一切手を入れず、
Protocol で抽象化することで責務分離を保つ。

設計方針:
    - R3 二層責務: checker は従来通り Finding を返す。grouper が集約し
      FindingGroup を Excel 層に渡す。
    - FindingLike: structural typing で Finding を受け取れる最小限の属性宣言
    - FindingGroup: 集約結果(親行＋子 Findings)を保持する不変 dataclass
    - P1 I/O フリー: 本ファイルは純粋な型定義のみ
    - P12 決定的動作: frozen=True で不変性を保証

配置: skills/_common/lib/schema.py
出典: docs/phase8_prestudy.md §3 (Case A: Composition)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol, Sequence


# ─────────────────────────────────────────────────────────────────────
# FindingLike Protocol
# ─────────────────────────────────────────────────────────────────────

class FindingLike(Protocol):
    """Finding を抽象化する structural typing 用 Protocol。

    grouper / Excel 層は本 Protocol を介して Finding を参照し、
    check-tax-classification/schema.py の Finding dataclass に直接依存しない。
    将来 Finding の実体型が複数になった場合も、この Protocol を満たせば
    受け入れ可能。

    宣言する属性は grouper が group_key 生成・代表値決定・金額集計に
    必要とする最小限のもののみ。link_hints は TC によって None の可能性が
    あるため Optional[Any] とする(実体は LinkHints dataclass)。
    """

    tc_code: str
    sub_code: str
    severity: str
    area: str
    current_value: str
    suggested_value: str
    debit_amount: Optional[int]
    credit_amount: Optional[int]
    link_hints: Optional[Any]


# ─────────────────────────────────────────────────────────────────────
# FindingGroup
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FindingGroup:
    """Finding の集約結果。親行 1 行 + 子 Finding n 行を保持する。

    docs/phase8_prestudy.md §3 Case A (Composition) 準拠。Excel 層は本構造を
    読み、親行をアウトライン折りたたみのトップ、findings を子行として展開する。

    group_key:
        GROUP_KEY_STRATEGIES が TC ごとに生成するキー文字列。
        同じ group_key を持つ Finding が同一 FindingGroup にまとめられる。

    severity / tc_code / sub_code / area:
        親行の代表値。group 内 Finding の共通値または max 採用値。

    count:
        集約された子 Finding の数(== len(findings))。Excel の親行サマリに表示。

    total_debit / total_credit:
        子 Finding の debit_amount / credit_amount の合計(None は 0 扱い)。
        親行の金額表示に使用。

    findings:
        集約された子 Finding のタプル(決定的動作のため tuple)。
    """

    group_key: str
    tc_code: str
    sub_code: str
    severity: str
    area: str
    count: int
    total_debit: int
    total_credit: int
    findings: tuple = field(default_factory=tuple)


__all__ = [
    "FindingLike",
    "FindingGroup",
]
