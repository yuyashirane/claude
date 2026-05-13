"""IS-02: 公共交通機関特例検出 (Public Transport Special Rule)。

法令根拠 (一次情報):
    消費税法施行令 第49条第1項第1号イ
      → 第70条の9第2項第1号 (公共交通機関特例本体)
    - 金額閾値: 税込 3万円未満
    - 対象: 鉄道 (一・二種)、軌道、一般乗合旅客自動車運送 (=路線バス)、海上運送
    - ★ 除外: 一般乗用旅客自動車運送事業 (=タクシー)、航空運送

    出典: https://laws.e-gov.go.jp/law/363CO0000000360

業務哲学 (false positive world):
    3万円未満の公共交通機関利用 (Suica/PASMO チャージ含む) は領収書なしで OK。
    税理士が「適格請求書を取得してください」と顧問先に質問する場面を抑止する。

検出 ID:
    IS-02a 公共交通機関特例適用可能性 (advisory)
        - severity=🟡 Medium, confidence=70, error_type=gray_review
        - 旅費交通費系勘定 + 3万円未満 + 公共交通 KW (positive)
    IS-02b 公共交通機関特例対象外 (タクシー等の混入警告)
        - severity=🟠 High, confidence=80, error_type=invoice_warning
        - 旅費交通費系勘定 + タクシー KW (negative)
        - タクシーは公共交通機関特例の対象外 → 通常の適格請求書要件

設計メモ: 038-survey 報告書 §焦点 8.1 (タクシー除外発見) + 一次情報構造
配置: skills/verify/V1-3-rule/check-invoice-special-rules/checks/is02_public_transport.py
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
    """IS-02 (公共交通機関特例) 主検出のメインエントリ。"""
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
        "keywords/public-transport-kw",
        filter_meta=True,
    )

    transport_accounts: list[str] = list(accounts.get("transport_accounts", []))
    positive_kws: list[str] = list(kw.get("positive", []))
    negative_kws: list[str] = list(kw.get("negative", []))

    findings: list = []

    for row in ctx.transactions:
        # 起点 1: 課税仕入系
        code = resolve_tax_code(row, ctx)
        if not shared.is_purchase_for_invoice_special(code):
            continue

        # 起点 2: 旅費交通費系勘定
        if not account_equals_any(row.account, transport_accounts):
            continue

        # 起点 3: 3 万円未満
        amount = shared.get_purchase_amount(row)
        if amount >= shared.PUBLIC_TRANSPORT_THRESHOLD or amount <= 0:
            continue

        # KW 判定
        search_text = build_search_text(row)
        negative_match = matches_of(search_text, negative_kws)
        positive_match = matches_of(search_text, positive_kws)

        # IS-02b: タクシー等 negative マッチ優先 (対象外警告)
        if negative_match:
            findings.append(_make_is02b_finding(row, ctx, amount, negative_match))
            continue

        # IS-02a: 公共交通機関 positive マッチ (適用 advisory)
        if positive_match:
            findings.append(_make_is02a_finding(row, ctx, amount, positive_match))
            continue

        # KW なし → 判定不能、検出しない (false positive 抑制)

    return findings


# ═══════════════════════════════════════════════════════════════
# Finding 生成ヘルパー
# ═══════════════════════════════════════════════════════════════

def _make_is02a_finding(row, ctx, amount, matched_kws):
    """IS-02a 公共交通機関特例適用可能性 Finding。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-02a",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A15",
        sort_priority=52,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=70,
        message=(
            f"公共交通機関特例の適用可能性があります "
            f"(税込 ¥{int(amount):,} 円、3万円未満、KW: {', '.join(matched_kws)})。"
            f"3万円未満の鉄道・路線バス・船舶等の運賃は、適格請求書の保存なしで"
            f"帳簿のみで仕入税額控除可能 (消費税法施行令第70条の9第2項第1号)。"
        ),
        link_hints=link_hints,
    )


def _make_is02b_finding(row, ctx, amount, matched_kws):
    """IS-02b 公共交通機関特例対象外 (タクシー等) Finding。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-21",
        sub_code="IS-02b",
        severity="🟠 High",
        error_type="invoice_warning",
        area="A15",
        sort_priority=53,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=80,
        message=(
            f"公共交通機関特例の対象外取引です "
            f"(KW: {', '.join(matched_kws)}、税込 ¥{int(amount):,} 円)。"
            f"タクシー (一般乗用旅客自動車運送事業) や航空券は公共交通機関特例の"
            f"対象外のため、通常の適格請求書 (インボイス) が必要です。"
            f"※ 出張旅費特例 (IS-04) の適用可否も併せてご検討ください。"
        ),
        link_hints=link_hints,
    )
