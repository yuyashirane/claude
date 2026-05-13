"""IS-03: 自販機特例検出 (Vending Machine Special Rule)。

法令根拠 (一次情報):
    消費税法施行令 第49条第1項第1号ニ
      → 施行規則 第15条の4 第1号
      → 施行規則 第26条の6 第1号
    - 金額閾値: 税込 3万円未満
    - 対象: 自動販売機・自動サービス機による課税資産の譲渡等

    出典: https://laws.e-gov.go.jp/law/363M50000040053

業務哲学 (false positive world):
    自販機購入 (会議用ペットボトル、コインパーキング、コインランドリー等) は
    領収書取得が困難。3万円未満であれば帳簿のみで OK の旨を税理士に提示。

検出 ID:
    IS-03a 自販機特例適用可能性 (advisory)
        - severity=🟢 Low, confidence=60, error_type=gray_review
        - 課税仕入 + 3万円未満 + 自販機 KW

False positive 抑制:
    - 「自販機」KW がなければ検出しない
    - 「コインパーキング」「コインランドリー」も自販機・自動サービス機の範疇
    - 取引先名や摘要に明示があるケースのみ検出 (KW なしは判別不能)

設計メモ: 038-survey 報告書 §2.2 + 規則26の6第1号
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checks/is03_vending_machine.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

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
    """IS-03 (自販機特例) 主検出のメインエントリ。"""
    from skills._common.lib.finding_factory import (
        load_reference_json,
        resolve_tax_code,
    )
    from skills._common.lib.keyword_matcher import build_search_text, matches_of

    shared = _load_shared()

    kw = load_reference_json(
        "verify/V1-3-rule/check-invoice-special-rules",
        "keywords/vending-machine-kw",
        filter_meta=True,
    )

    vending_kws: list[str] = list(kw.get("vending_machine", []))

    findings: list = []

    for row in ctx.transactions:
        # 起点 1: 課税仕入系
        code = resolve_tax_code(row, ctx)
        if not shared.is_purchase_for_invoice_special(code):
            continue

        # 起点 2: 3 万円未満
        amount = shared.get_purchase_amount(row)
        if amount >= shared.VENDING_MACHINE_THRESHOLD or amount <= 0:
            continue

        # 起点 3: 自販機 KW (摘要 + 取引先)
        search_text = build_search_text(row)
        matched = matches_of(search_text, vending_kws)
        if not matched:
            continue

        findings.append(_make_is03a_finding(row, ctx, amount, matched))

    return findings


def _make_is03a_finding(row, ctx, amount, matched_kws):
    """IS-03a 自販機特例適用可能性 Finding。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-03a",
        severity="🟢 Low",
        error_type="gray_review",
        area="A14",
        sort_priority=54,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=60,
        message=(
            f"自販機特例の適用可能性があります "
            f"(税込 ¥{int(amount):,} 円、3万円未満、KW: {', '.join(matched_kws)})。"
            f"3万円未満の自動販売機・自動サービス機による課税仕入は、"
            f"適格請求書の保存なしで帳簿のみで仕入税額控除可能 "
            f"(消費税法施行規則第26条の6第1号)。"
        ),
        link_hints=link_hints,
    )
