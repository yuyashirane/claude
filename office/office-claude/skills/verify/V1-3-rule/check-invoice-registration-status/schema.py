"""V1-3-20 β2-E E3-b 専用スキーマ。

β2-E E3-b 以降:
    - InvoiceFinding は共通 Finding (skills/_common/schema.py) の re-export エイリアス
    - Skill 固有の Classification / FindingGroup / InvoiceCheckContext のみ本ファイルに残す
    - 既存 V1-3-20 コードの ``from .schema import InvoiceFinding`` を維持するため
      Finding をエイリアス名 InvoiceFinding として公開

設計メモ: docs/design/V1-3-20_beta2_E_design_v0.md
変更履歴:
    - β2-B: Classification Enum 追加 (5 分類体系)
    - β2-C: FindingGroup 追加 (classification 単位の親子行)
    - β2-E E3-b: InvoiceFinding 独自定義を廃止、共通 Finding のエイリアスに変更
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date
from enum import Enum
from pathlib import Path

# E3-b: CLI 単体起動 (python run.py ...) 経由で本ファイルが
# importlib.util.spec_from_file_location でロードされるとき、
# ``from skills._common.schema import ...`` を解決可能にするため、
# PROJECT_ROOT (office-claude/) を sys.path に挿入する。
_PROJECT_ROOT = Path(__file__).resolve().parents[4]  # office-claude/
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# 共通 Finding を InvoiceFinding という名前で公開する (E3-b)。
# 既存 V1-3-20 コードの ``from .schema import InvoiceFinding`` を維持するためのエイリアス。
# 新規コードは ``from skills._common.schema import Finding`` を直接 import すること。
from skills._common.schema import Finding as InvoiceFinding


class Classification(str, Enum):
    """V1-3-20 β2 の 5 分類体系(β2-A 確定)。

    Finding 化対象(指摘事項として悠皓さんに提示):
        - QUALIFIED_BUT_TRANSITIONAL_TAX: 適格マークあり × 経過措置コード
            (取引先は適格事業者なのに、なぜか経過措置コードで仕訳されている)
        - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: 非適格 × 通常課税仕入 × 20 万以上
            (非適格事業者なのに通常課税仕入として処理されている、β1 の核心パターン)
        - PARTNER_UNKNOWN: partner 不明 × 経過措置 × 20 万以上
            (partner 紐付け不可で、経過措置コードのため判定保留)

    Finding 化しない(観察用に classification_counts には含む):
        - EXPECTED_TRANSITIONAL_TAX: 非適格 × 経過措置(想定通り、コメントなし)
        - EXPECTED_FULL_DEDUCTION_TAX: 適格 × 通常課税仕入(想定通り)

    分類対象外(インボイス論点の枠外、観察も不要):
        - NONE: 課税仕入でもなく、インボイス論点の対象外
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
        target_month: パターン 2/3 の場合の対象月(YYYY-MM-01 を date で)。
            パターン 1(period_start/end 指定)では None。
        single_month: パターン 3(単月)のとき True。
    """

    company_id: int
    period_start: date
    period_end: date
    target_month: date | None = None
    single_month: bool = False


@dataclass(frozen=True)
class FindingGroup:
    """β2-C 確定: classification 単位の FindingGroup(最小実装)。

    V1-3-20 では Finding 化対象 3 分類のみを groups に含める:
        - QUALIFIED_BUT_TRANSITIONAL_TAX
        - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        - PARTNER_UNKNOWN

    EXPECTED_TRANSITIONAL_TAX / EXPECTED_FULL_DEDUCTION_TAX / NONE は
    含めない(設計メモ §1 論点 5)。これらは classification_counts による
    集計対象に留める。

    Excel 表示ロジック / 親子行レイアウト / severity 色分けは β2-E / β3 で実装。

    findings_count を冗長保持する理由:
        - JSON 出力時に findings.length を毎回計算しなくて良い
        - Excel 集計(β2-E / β3)で参照しやすい
    """

    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]


__all__ = ["InvoiceCheckContext", "InvoiceFinding", "Classification", "FindingGroup"]
