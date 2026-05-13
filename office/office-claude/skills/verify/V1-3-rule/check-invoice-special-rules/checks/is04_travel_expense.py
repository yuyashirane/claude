"""IS-04: 出張旅費特例検出 (Travel Expense Special Rule)。

法令根拠 (一次情報):
    消費税法施行令 第49条第1項第1号ニ
      → 施行規則 第15条の4 第2号
    - 金額閾値: なし (「通常必要であると認められる部分」)
    - 対象: 法人税法 第2条第15号に規定する役員・使用人への出張旅費・転居旅費
        (実費精算・支給金品)

    出典: https://laws.e-gov.go.jp/law/363M50000040053

業務哲学 (false positive world):
    従業員の出張精算は個別領収書ごとに適格判定するのが非現実的。
    旅費交通費系勘定 + 従業員精算 KW があれば「特例適用 OK」を advisory 提示。

検出 ID:
    IS-04a 出張旅費特例適用可能性 (advisory)
        - severity=🟡 Medium, confidence=60, error_type=gray_review
        - 課税仕入 + 旅費交通費系勘定 + 従業員精算 KW

IS-04b は 039 スコープ外:
    「通常必要範囲超過」(金額閾値の主観性) は悠皓判断 8 で除外決定。
    第 10 ラウンド以降に分離検討。

False positive 抑制:
    - 「従業員」「精算」「立替」「出張」等の KW が必要
    - 通常の取引先請求書 (例: 旅行代理店経由) は対象外 → 取引先 KW で区別

設計メモ: 038-survey 報告書 §2.2 + 悠皓判断 8 (IS-04b 除外)
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checks/is04_travel_expense.py
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
    """IS-04 (出張旅費特例) 主検出のメインエントリ。"""
    from skills._common.lib.finding_factory import (
        load_reference_json,
        resolve_tax_code,
    )
    from skills._common.lib.keyword_matcher import build_search_text, matches_of
    from skills._common.lib.account_matcher import account_equals_any

    shared = _load_shared()

    accounts = load_reference_json(
        "verify/V1-3-rule/check-invoice-special-rules",
        "accounts/special-rules-accounts",
        filter_meta=True,
    )
    kw = load_reference_json(
        "verify/V1-3-rule/check-invoice-special-rules",
        "keywords/travel-expense-kw",
        filter_meta=True,
    )

    transport_accounts: list[str] = list(accounts.get("transport_accounts", []))
    travel_kws: list[str] = list(kw.get("employee_reimbursement", []))

    findings: list = []

    for row in ctx.transactions:
        # 起点 1: 課税仕入系
        code = resolve_tax_code(row, ctx)
        if not shared.is_purchase_for_invoice_special(code):
            continue

        # 起点 2: 旅費交通費系勘定
        if not account_equals_any(row.account, transport_accounts):
            continue

        # 起点 3: 金額 > 0 (返品等の戻し仕訳除外)
        amount = shared.get_purchase_amount(row)
        if amount <= 0:
            continue

        # KW 判定: 従業員精算 KW
        search_text = build_search_text(row)
        matched = matches_of(search_text, travel_kws)
        if not matched:
            continue

        findings.append(_make_is04a_finding(row, ctx, amount, matched))

    return findings


def _make_is04a_finding(row, ctx, amount, matched_kws):
    """IS-04a 出張旅費特例適用可能性 Finding。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-04a",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A14",
        sort_priority=55,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=60,
        message=(
            f"出張旅費特例の適用可能性があります "
            f"(税込 ¥{int(amount):,} 円、KW: {', '.join(matched_kws)})。"
            f"従業員への出張旅費・転居旅費の実費精算については、"
            f"通常必要であると認められる部分について、適格請求書なしで"
            f"帳簿のみで仕入税額控除可能 (消費税法施行規則第15条の4第2号)。"
            f"※ 通常必要範囲を逸脱する高額分は別途確認 (IS-04b、本ラウンドでは未実装)。"
        ),
        link_hints=link_hints,
    )
