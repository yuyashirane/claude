"""V1-3-20 β2-B 専用スキーマ（5 分類体系、V1-3-10 とは独立）。

設計方針 (A3 + B2 + β2):
    - Finding は V1-3-10 との共通最小サブセットのみを採用。
      V1-3-20 固有の情報は raw dict に逃がす（β2-C で classification 組込判断）。
    - CheckContext は V1-3-20 用に最小定義（period_start/end, company_id のみ）。
      V1-3-10 の CheckContext には依存しない。
    - β2 以降で V1-3-10 schema との統合判断を行う前提のため、フィールド名は
      可能な限り V1-3-10 と揃える（period_start, period_end など）。

β2-B での追加:
    - Classification Enum（5 分類 + NONE の 6 値、β2-A 確定）
    - InvoiceCheckRow は run.py 側で tax_code フィールドを保持（本ファイルでは
      Classification の単一エントリのみ追加）
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Any


class Classification(str, Enum):
    """V1-3-20 β2 の 5 分類体系（β2-A 確定）。

    Finding 化対象（指摘事項として悠皓さんに提示）:
        - QUALIFIED_BUT_TRANSITIONAL_TAX: 適格マークあり × 経過措置コード
            （取引先は適格事業者なのに、なぜか経過措置コードで仕訳されている）
        - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: 非適格 × 通常課税仕入 × 20 万以上
            （非適格事業者なのに通常課税仕入として処理されている、β1 の核心パターン）
        - PARTNER_UNKNOWN: partner 不明 × 経過措置 × 20 万以上
            （partner 紐付け不可で、経過措置コードのため判定保留）

    Finding 化しない（観察用に classification_counts には含む）:
        - EXPECTED_TRANSITIONAL_TAX: 非適格 × 経過措置（想定通り、コメントなし）
        - EXPECTED_FULL_DEDUCTION_TAX: 適格 × 通常課税仕入（想定通り）

    分類対象外（インボイス論点の枠外、観察も不要）:
        - NONE: 課税仕入でもなく、インボイス論点の対象外

    NONE と EXPECTED_* の違い（β2-A 方針 2 確定）:
        - EXPECTED_*: 分類は確定、Finding 化しないだけ
        - NONE: そもそも分類対象外、観察も不要
    """
    QUALIFIED_BUT_TRANSITIONAL_TAX = "qualified_but_transitional_tax"
    NONQUALIFIED_BUT_FULL_DEDUCTION_TAX = "nonqualified_but_full_deduction_tax"
    PARTNER_UNKNOWN = "partner_unknown"
    EXPECTED_TRANSITIONAL_TAX = "expected_transitional_tax"
    EXPECTED_FULL_DEDUCTION_TAX = "expected_full_deduction_tax"
    NONE = "none"


@dataclass(frozen=True)
class InvoiceCheckContext:
    """V1-3-20 β1 専用の最小 CheckContext。

    V1-3-10 の CheckContext (categories / transactions など豊富) には依存しない。
    period_start / period_end / company_id のみを受け取る。

    Attributes:
        company_id: freee 事業所 ID。
        period_start: 期間開始日。累積モードでは期首。
        period_end: 期間終了日。対象月末。
        target_month: パターン 2/3 の場合の対象月（YYYY-MM-01 を date で）。
            パターン 1（period_start/end 指定）では None。
        single_month: パターン 3（単月）のとき True。
    """

    company_id: int
    period_start: date
    period_end: date
    target_month: date | None = None
    single_month: bool = False


@dataclass(frozen=True)
class InvoiceFinding:
    """V1-3-20 β2-C の Finding（共通最小サブセット + classification）。

    β2-C 拡張（設計メモ §1 論点 1 / 論点 2）:
        - classification: 分類結果（Optional、案 B）
            V1-3-20 では Finding 化対象 3 分類について必ず設定する。
            V1-3-10 など他 Skill との将来統合時は None を許容する。
        - raw は β2-C で 8 フィールドに拡張（_build_raw が組み立て）

    V1-3-10 Finding と共通フィールド: severity, message, wallet_txn_id, rule_code
    V1-3-20 固有フィールドは raw dict に逃がす（A3 設計）。

    raw に入れる 8 フィールド (β2-C):
        - tax_label: 検出された税区分名
        - tax_code: 税区分コード（β2 で追加、判定の正本）
        - debit_amount: 借方金額（Decimal を str 化）
        - partner: 取引先名
        - description: 摘要
        - transaction_date: 取引日（ISO 文字列、無い場合は None）
        - source: "deal" 固定（β2-C では deals のみ）
        - is_qualified_invoice: 適格マーク（β2 で追加、判定の正本）

    DRY 原則（設計メモ §1 論点 2）:
        Finding.classification = 判定結果
        raw = 判定材料 + 観察情報
        raw に classification は重複保持しない。
    """

    severity: str
    message: str
    wallet_txn_id: str
    classification: Classification | None = None
    rule_code: str = "V1-3-20"
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FindingGroup:
    """β2-C 確定：classification 単位の FindingGroup（最小実装）。

    V1-3-20 では Finding 化対象 3 分類のみを groups に含める：
        - QUALIFIED_BUT_TRANSITIONAL_TAX
        - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        - PARTNER_UNKNOWN

    EXPECTED_TRANSITIONAL_TAX / EXPECTED_FULL_DEDUCTION_TAX / NONE は
    含めない（設計メモ §1 論点 5）。これらは classification_counts による
    集計対象に留める。

    Excel 表示ロジック / 親子行レイアウト / severity 色分けは β2-E / β3 で実装。

    findings_count を冗長保持する理由:
        - JSON 出力時に findings.length を毎回計算しなくて良い
        - Excel 集計（β2-E / β3）で参照しやすい
    """

    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]


__all__ = ["InvoiceCheckContext", "InvoiceFinding", "Classification", "FindingGroup"]
