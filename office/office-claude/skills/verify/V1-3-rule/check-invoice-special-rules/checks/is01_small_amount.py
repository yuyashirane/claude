"""IS-01: 少額特例検出 (Small Amount Special Rule)。

法令根拠 (⚠️ 二次情報、TODO-PRIMARY-1):
    平成28年改正法附則 第53条の2 + 平成30年改正令附則 第24条の2
    - 適用期間: 令和5年10月1日 - 令和11年9月30日 (6 年間の経過措置)
    - 対象事業者: 基準期間 1億円以下 or 特定期間 5千万円以下
    - 金額閾値: 税込 1万円未満 (1取引単位)
    - 帳簿記載: 通常の課税仕入と同様

    出典: 国税庁 https://www.nta.go.jp/publication/pamph/shohi/kaisei/202304/02.htm

業務哲学 (false positive world):
    1万円未満の課税仕入は適格請求書の有無に関わらず帳簿のみで控除可能
    であることを advisory finding として税理士に提示する。「全件確認は不要」
    というメッセージを Excel に出すことで顧問先への過剰質問を抑制する。

検出 ID:
    IS-01a 少額特例適用可能性 (期間内、advisory)
        - severity=🟢 Low, confidence=50, error_type=gray_review
        - 事業者要件 (1億円以下) は未確認のため confidence 低め
    IS-01b 少額特例期間外発動 (R11/10 以降)
        - severity=🟡 Medium, confidence=90, error_type=mild_warning
        - 期間外なので「通常の請求書保存要件適用」を警告

advisory 設計の理由:
    - 1万円未満仕入は実データで大量発生 (推定 200-500 件/6ヶ月)
    - 全件「確認必要」とすると顧問先疲弊 → severity Low で advisory 化
    - 事業者要件 (基準期間1億円以下) は company_info に情報なしのため未判定
    - 課税売上1億円超の事業者では IS-01a は全件 false positive 可能性あり

設計メモ: 038-survey 報告書 §2.2 + 悠皓判断 8 項目 (advisory 性質)
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checks/is01_small_amount.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# _shared モジュールを importlib でロード (sys.modules キー独立化)
_SHARED_PATH = Path(__file__).parent / "_shared.py"
_SHARED_KEY = "v1_3_21_is_shared"


def _load_shared():
    if _SHARED_KEY in sys.modules:
        return sys.modules[_SHARED_KEY]
    spec = importlib.util.spec_from_file_location(_SHARED_KEY, _SHARED_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[_SHARED_KEY] = mod
    spec.loader.exec_module(mod)
    return mod


# ═══════════════════════════════════════════════════════════════
# メイン run 関数
# ═══════════════════════════════════════════════════════════════

def run(ctx) -> list:
    """IS-01 (少額特例) 主検出のメインエントリ。

    IS-01a (期間内) と IS-01b (期間外) の両方を発生させる。
    """
    from skills._common.lib.finding_factory import (
        create_finding,
        build_link_hints,
        resolve_tax_code,
    )

    shared = _load_shared()
    findings: list = []

    for row in ctx.transactions:
        # 起点: 課税仕入系 (標準10% + 軽減8% + 経過措置)
        code = resolve_tax_code(row, ctx)
        if not shared.is_purchase_for_invoice_special(code):
            continue

        # 金額: 税込 1 万円未満 (1 取引単位)
        amount = shared.get_purchase_amount(row)
        if amount >= shared.SMALL_AMOUNT_THRESHOLD or amount <= 0:
            continue

        txn_date = getattr(row, "transaction_date", None)

        # IS-01b: 期間外発動 (R11/10/1 以降)
        if shared.is_after_small_amount_period(txn_date):
            findings.append(_make_is01b_finding(row, ctx, amount, txn_date))
            continue

        # IS-01a: 期間内 (R5/10/1 - R11/9/30) の advisory
        if shared.is_within_small_amount_period(txn_date):
            findings.append(_make_is01a_finding(row, ctx, amount))
            continue

        # 期間より前 (R5/9/30 以前): インボイス制度開始前なので検出スコープ外
        # (実データでこのケースは想定外、本 skill 着手時点で R5/10/1 以降のみ対象)

    return findings


# ═══════════════════════════════════════════════════════════════
# Finding 生成ヘルパー
# ═══════════════════════════════════════════════════════════════

def _make_is01a_finding(row, ctx, amount):
    """IS-01a 少額特例適用可能性 (期間内、advisory) Finding を生成。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-01a",
        severity="🟢 Low",
        error_type="gray_review",
        area="A15",  # 暫定: インボイス area に併置 (040-discuss で X/Y/Z 案を再確定)
        sort_priority=50,  # 040-discuss で再調整、現状は V1-3-20 invoice 系の後ろ
        row=row,
        current_value=row.tax_label,
        suggested_value="",  # advisory のため変更提案なし
        confidence=50,
        message=(
            f"少額特例の適用可能性があります (税込 ¥{int(amount):,} 円、1万円未満)。"
            f"適格請求書の有無に関わらず帳簿保存のみで仕入税額控除可能 "
            f"(28改正法附則第53条の2)。"
            f"※ 適用には基準期間課税売上 1 億円以下 or 特定期間 5 千万円以下の"
            f"事業者要件あり (本 checker では未確認)。"
        ),
        link_hints=link_hints,
    )


def _make_is01b_finding(row, ctx, amount, txn_date):
    """IS-01b 少額特例期間外発動 Finding を生成 (R11/10/1 以降)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-01b",
        severity="🟡 Medium",
        error_type="mild_warning",
        area="A15",
        sort_priority=51,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=90,
        message=(
            f"少額特例の適用期間外です (取引日 {txn_date}、令和11年10月以降)。"
            f"通常の請求書保存要件 (適格請求書) が適用されますので、"
            f"インボイスの保存状況を確認してください。"
        ),
        link_hints=link_hints,
    )
