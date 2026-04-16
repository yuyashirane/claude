"""TC-07: 福利厚生費の不課税・非課税判定誤り。

仕様書 v1.2.2 §5.7 準拠。Pattern D(KW優先順位ディスパッチ型)の実装。
同一科目(福利厚生費/福利費)内に複数の税区分が混在することを前提に、
摘要 KW の優先順位でサブタイプを決定する。

6サブタイプ:
    TC-07a: 慶弔見舞金が課税仕入(direct_error, 🔴 High, confidence=90)
    TC-07b: 商品券等が課税仕入(direct_error, 🔴 High, confidence=90)
    TC-07c: 慶弔見舞金が非課仕入(direct_error, 🟡 Med, confidence=80,
            note=tax_impact_negligible)
    TC-07d: 商品券等が対象外(direct_error, 🟡 Med, confidence=80,
            note=tax_impact_negligible)
    TC-07e: 課税相当の福利厚生 KW が対象外/非課仕入(reverse_suspect, 🟡 Med,
            confidence=60)
    TC-07f: 食品関連 KW が標準税率10%(direct_error, 🟡 Med, confidence=70,
            note=defer_to_V1-3-20, show_by_default=False)

設計の核(事前合意事項、変更禁止):
    - KW優先順位: condolence > gift_certificate > food_takeout
                  > food_dine_in > taxable_welfare
      (軸: 「目的 > 手段」)
    - classify_welfare は純粋関数(副作用なし、I/O なし)
    - TC-07c/d は必ず note=tax_impact_negligible + 「税額影響は軽微です」
    - TC-07f は必ず note=defer_to_V1-3-20 + show_by_default=False

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc07_welfare.py
"""
from __future__ import annotations

from typing import Optional


# ═══════════════════════════════════════════════════════════════
# モジュールレベル定数
# ═══════════════════════════════════════════════════════════════

# Pattern D = KW優先順位ディスパッチ型
# この順序は設計原則「目的 > 手段」に基づく(事前合意済み)。
# welfare-keywords.json の _priority_order と必ず一致させること。
KEYWORD_PRIORITY_ORDER: tuple[str, ...] = (
    "condolence",         # 慶弔見舞金 — 目的優先(最強)
    "gift_certificate",   # 商品券 — 媒体
    "food_takeout",       # 軽減税率対象 — 明確
    "food_dine_in",       # 標準税率 — ケータリング含む
    "taxable_welfare",    # reverse_suspect 用 — 最後の砦
)

# KW カテゴリごとの基準 confidence(classify_welfare の返り値用)
# 最終 confidence は _dispatch_subtype で sub_code 別に決定。
KEYWORD_BASE_CONFIDENCE: dict[str, int] = {
    "condolence": 90,
    "gift_certificate": 90,
    "food_takeout": 70,
    "food_dine_in": 70,
    "taxable_welfare": 60,
}


# ═══════════════════════════════════════════════════════════════
# 純粋関数 classify_welfare(モジュールレベル export、テスト対象)
# ═══════════════════════════════════════════════════════════════

def classify_welfare(
    search_text: str,
    keywords: dict,
) -> Optional[tuple[str, int]]:
    """福利厚生費の KW 優先順位ディスパッチ。

    同一科目内に複数の税区分が混在する福利厚生費について、摘要の KW から
    どのカテゴリに該当するかを優先順位に従って判定する純粋関数。

    Args:
        search_text: `build_search_text(row)` で生成した検索対象テキスト
        keywords: welfare-keywords.json をロードした dict
                  (`load_reference_json(filter_meta=True)` で _ プレフィックス除外済み)

    Returns:
        None: いずれの KW にもマッチしない
        (kw_category, base_confidence): マッチした場合

    優先順位(KEYWORD_PRIORITY_ORDER):
        1. condolence       (慶弔見舞金 — 目的優先、最強)
        2. gift_certificate (商品券 — 媒体)
        3. food_takeout     (軽減税率対象)
        4. food_dine_in     (標準税率 — ケータリング含む)
        5. taxable_welfare  (reverse_suspect 用 — 最後の砦)

    設計原則:
        - 「目的 > 手段」の原則に基づく。
        - 例:「結婚祝金 商品券で贈呈」→ condolence 勝ち(媒体ではなく目的を見る)。
        - 例:「忘年会 ケータリング」→ food_dine_in(dine_in カテゴリ優先)。
        - 例:「忘年会用 弁当」→ food_takeout 勝ち(明確な軽減税率対象を優先)。

    Examples:
        >>> kw = {"condolence": ["慶弔"], "gift_certificate": ["商品券"]}
        >>> classify_welfare("慶弔見舞金 商品券", kw)
        ('condolence', 90)
        >>> classify_welfare("事務用品", kw)
        # -> None
    """
    from skills._common.lib.keyword_matcher import matches_any

    if not search_text:
        return None

    for category in KEYWORD_PRIORITY_ORDER:
        kw_list = keywords.get(category, [])
        if not kw_list:
            continue
        if matches_any(search_text, kw_list):
            return (category, KEYWORD_BASE_CONFIDENCE[category])

    return None


# ═══════════════════════════════════════════════════════════════
# メイン run 関数
# ═══════════════════════════════════════════════════════════════

def run(ctx) -> list:
    """TC-07 福利厚生費の不課税・非課税判定誤りをチェック。

    Pattern D = KW優先順位ディスパッチ型。
    科目フィルタ(福利厚生費/福利費)で絞り込み、摘要 KW の優先順位で
    サブタイプを決定する。
    """
    from skills._common.lib.finding_factory import load_reference_json, resolve_tax_code
    from skills._common.lib.account_matcher import account_equals_any
    from skills._common.lib.keyword_matcher import build_search_text

    accounts_data = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/welfare-accounts",
        filter_meta=True,
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/welfare-keywords",
        filter_meta=True,
    )

    welfare_accounts = list(accounts_data.get("welfare", []))

    findings: list = []
    for row in ctx.transactions:
        # 1. 科目チェック(福利厚生費/福利費 のみ対象)
        if not account_equals_any(row.account, welfare_accounts):
            continue

        # 2. 現税区分コード解決
        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        # 3. KW 優先順位ディスパッチ(純粋関数)
        search_text = build_search_text(row)
        result = classify_welfare(search_text, keywords)
        if result is None:
            continue
        kw_category, _base_confidence = result

        # 4. 実際にマッチした具体 KW を抽出(message 格納用)
        matched_kw = _find_first_matched_keyword(
            search_text, keywords.get(kw_category, [])
        )

        # 5. サブタイプ決定(KW カテゴリ × 現税区分)
        finding = _dispatch_subtype(
            row, ctx, code, kw_category, matched_kw
        )
        if finding is not None:
            findings.append(finding)

    return findings


# ═══════════════════════════════════════════════════════════════
# ヘルパー関数
# ═══════════════════════════════════════════════════════════════

def _find_first_matched_keyword(
    search_text: str, kw_list: list[str]
) -> Optional[str]:
    """kw_list のうち search_text に最初にマッチした KW を返す。

    リスト順で先勝ち。該当なしの場合は None。
    matches_any と同じ部分一致(大文字小文字を区別しない)判定。
    """
    if not search_text or not kw_list:
        return None
    text_lower = search_text.lower()
    for kw in kw_list:
        if kw and kw.lower() in text_lower:
            return kw
    return None


def _dispatch_subtype(row, ctx, code: int, kw_category: str, matched_kw: Optional[str]):
    """KW カテゴリ × 現税区分 から TC-07a〜f を決定し Finding を生成。

    戻り値: Finding または None(どの条件にも該当しなければ None = スルー)。
    """
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_standard_purchase_10,
        is_non_taxable_purchase, is_non_subject,
    )

    # TC-07a/b/f: 課税仕入(10%) 系
    if is_taxable_purchase(code):
        if kw_category == "condolence":
            return _make_finding_07a(row, ctx, code, matched_kw)
        if kw_category == "gift_certificate":
            return _make_finding_07b(row, ctx, code, matched_kw)
        if kw_category in ("food_takeout", "food_dine_in"):
            # 標準税率10% の課税仕入 → 軽減税率の疑いあり(V1-3-20 へ委譲)
            if is_standard_purchase_10(code):
                return _make_finding_07f(row, ctx, code, kw_category, matched_kw)
            return None
        # taxable_welfare が課税仕入 → 正常(Finding なし)
        return None

    # TC-07c: 非課税仕入 + condolence → 区分誤り(税額影響軽微)
    # TC-07e: 非課税仕入 + taxable_welfare → reverse_suspect
    if is_non_taxable_purchase(code):
        if kw_category == "condolence":
            return _make_finding_07c(row, ctx, code, matched_kw)
        if kw_category == "taxable_welfare":
            return _make_finding_07e(row, ctx, code, matched_kw)
        return None

    # TC-07d: 対象外 + gift_certificate → 区分誤り(税額影響軽微)
    # TC-07e: 対象外 + taxable_welfare → reverse_suspect
    # condolence が対象外 → 正常(Finding なし)
    if is_non_subject(code):
        if kw_category == "gift_certificate":
            return _make_finding_07d(row, ctx, code, matched_kw)
        if kw_category == "taxable_welfare":
            return _make_finding_07e(row, ctx, code, matched_kw)
        return None

    return None


# ═══════════════════════════════════════════════════════════════
# 個別 Finding 生成関数(6個)
# ═══════════════════════════════════════════════════════════════

def _make_finding_07a(row, ctx, code: int, matched_kw: Optional[str]):
    """TC-07a: 慶弔見舞金が課税仕入。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07a",
        severity="🔴 High",
        error_type="direct_error",
        area="A10",
        sort_priority=14,
        row=row,
        current_value=row.tax_label,
        suggested_value="対象外",
        confidence=90,
        message=(
            f"福利厚生費に計上された慶弔見舞金等(摘要KW:{matched_kw})が"
            f"課税仕入になっています。慶弔金は対象外(不課税)が原則です。"
            f"科目「{row.account}」の税区分を確認してください。"
        ),
        subarea="welfare",
        link_hints=link_hints,
    )


def _make_finding_07b(row, ctx, code: int, matched_kw: Optional[str]):
    """TC-07b: 商品券・ギフト券等が課税仕入。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07b",
        severity="🔴 High",
        error_type="direct_error",
        area="A10",
        sort_priority=15,
        row=row,
        current_value=row.tax_label,
        suggested_value="非課仕入",
        confidence=90,
        message=(
            f"福利厚生費に計上された商品券・ギフト券等(摘要KW:{matched_kw})が"
            f"課税仕入になっています。物品切手等は非課税仕入が原則です。"
            f"科目「{row.account}」の税区分を確認してください。"
        ),
        subarea="welfare",
        link_hints=link_hints,
    )


def _make_finding_07c(row, ctx, code: int, matched_kw: Optional[str]):
    """TC-07c: 慶弔見舞金が非課税仕入(区分誤り、税額影響軽微)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.note_markers import validate_note

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07c",
        severity="🟡 Medium",
        error_type="direct_error",
        area="A10",
        sort_priority=30,
        row=row,
        current_value=row.tax_label,
        suggested_value="対象外",
        confidence=80,
        message=(
            f"福利厚生費に計上された慶弔見舞金等(摘要KW:{matched_kw})が"
            f"非課税仕入になっています。慶弔金は対象外(不課税)が正しい区分です。"
            f" なお、税額影響は軽微です。"
        ),
        subarea="welfare",
        note=validate_note("tax_impact_negligible"),
        link_hints=link_hints,
    )


def _make_finding_07d(row, ctx, code: int, matched_kw: Optional[str]):
    """TC-07d: 商品券等が対象外(区分誤り、税額影響軽微)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.note_markers import validate_note

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07d",
        severity="🟡 Medium",
        error_type="direct_error",
        area="A10",
        sort_priority=31,
        row=row,
        current_value=row.tax_label,
        suggested_value="非課仕入",
        confidence=80,
        message=(
            f"福利厚生費に計上された商品券・ギフト券等(摘要KW:{matched_kw})が"
            f"対象外になっています。物品切手等は非課税仕入が正しい区分です。"
            f" なお、税額影響は軽微です。"
        ),
        subarea="welfare",
        note=validate_note("tax_impact_negligible"),
        link_hints=link_hints,
    )


def _make_finding_07e(row, ctx, code: int, matched_kw: Optional[str]):
    """TC-07e: 課税相当の福利厚生 KW が対象外/非課税仕入(reverse_suspect)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07e",
        severity="🟡 Medium",
        error_type="reverse_suspect",
        area="A10",
        sort_priority=28,
        row=row,
        current_value=row.tax_label,
        suggested_value="課税仕入の可能性",
        confidence=60,
        message=(
            f"福利厚生費が対象外/非課仕入として処理されていますが、"
            f"課税仕入の特徴(摘要KW:{matched_kw})があります。"
            f"課税仕入が正しい可能性があります。"
            f"科目「{row.account}」の取引内容を確認してください。"
        ),
        subarea="welfare",
        link_hints=link_hints,
    )


def _make_finding_07f(row, ctx, code: int, kw_category: str, matched_kw: Optional[str]):
    """TC-07f: 食品関連 KW が標準税率10%(軽減税率の可能性、V1-3-20 委譲)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.note_markers import validate_note

    link_hints = build_link_hints("general_ledger", row, ctx)
    return create_finding(
        tc_code="TC-07",
        sub_code="TC-07f",
        severity="🟡 Medium",
        error_type="direct_error",
        area="A10",
        sort_priority=29,
        row=row,
        current_value=row.tax_label,
        suggested_value="要判断(軽減税率の可能性)",
        confidence=70,
        message=(
            f"福利厚生費に食品関連の摘要(KW:{matched_kw})があり、"
            f"軽減税率対象の可能性があります。"
            f"V1-3-20(軽減税率判定)で詳細確認してください。"
        ),
        subarea="welfare",
        show_by_default=False,  # ← 他5サブと異なる
        note=validate_note("defer_to_V1-3-20"),
        link_hints=link_hints,
    )
