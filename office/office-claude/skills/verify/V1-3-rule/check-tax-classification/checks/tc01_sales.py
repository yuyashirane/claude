"""TC-01: 売上の税区分検証。

仕様書 v1.2.2 §5.1 準拠。Pattern B の派生実装(税区分起点 + KW双方向検出)。
TC-04 の収益側ペアとして対称構造を持つが、起点が「現在の税区分」である点が異なる。

5サブタイプ:
    TC-01a: 課税売上10% + 別区分の特徴KWあり (reverse_suspect, 🟡)
    TC-01b: 課税売上8%(軽) + 食品系でない (direct_error, 🔴)
    TC-01c: 輸出売上 + 海外KWなし (direct_error, 🔴)
    TC-01d: 非課売上 + 例外KWなし (direct_error, 🔴)
    TC-01e: 対象外 + 例外KWなし (direct_error, 🔴)

スコープ前提:
    - 貸方計上の売上のみ対象 (借方は本TCスコープ外)
    - included(general/construction/medical/transport)に含まれる科目のみチェック
    - excluded科目は他TCの責務(TC-04等)、ここではスキップ

Phase 3-R 共通化を全面活用:
    - resolve_tax_code を import
    - load_reference_json(filter_meta=True) でメタキー自動除外

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc01_sales.py
"""
from __future__ import annotations


def run(ctx) -> list:
    """TC-01 のメインエントリ。"""
    from skills._common.lib.finding_factory import (
        load_reference_json, resolve_tax_code, is_credit_side,
    )

    accounts = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/sales-accounts",
        filter_meta=True,
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/tax-exception-keywords",
        filter_meta=True,
    )

    # included のフラット展開(general/construction/medical/transport を統合)
    included_flat: set[str] = set()
    for category_accounts in accounts.get("included", {}).values():
        included_flat.update(category_accounts)

    excluded_set: set[str] = set(accounts.get("excluded", []))
    food_business_accounts: set[str] = set(accounts.get("food_business_accounts", []))

    findings = []

    for row in ctx.transactions:
        # 貸方計上のみ対象
        if not is_credit_side(row):
            continue

        # 科目フィルタ
        if row.account in excluded_set:
            continue  # 他TCの責務
        if row.account not in included_flat:
            continue  # 売上科目でない

        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        f = _dispatch_by_tax_code(row, ctx, code, keywords, food_business_accounts)
        if f is not None:
            findings.append(f)

    return findings


def _dispatch_by_tax_code(row, ctx, code: int, keywords: dict, food_business_accounts: set):
    """現在の税区分コードからサブタイプを振り分ける。"""
    from skills._common.lib.tax_code_helpers import (
        is_standard_taxable_sales, is_reduced_taxable_sales,
        is_export_sales, is_non_taxable_sales, is_non_subject,
    )

    if is_standard_taxable_sales(code):
        return _check_01a_standard_with_kw(row, ctx, keywords)
    elif is_reduced_taxable_sales(code):
        return _check_01b_reduced_not_food(row, ctx, keywords, food_business_accounts)
    elif is_export_sales(code):
        return _check_01c_export_no_overseas_kw(row, ctx, keywords)
    elif is_non_taxable_sales(code):
        return _check_01d_non_taxable_no_exception_kw(row, ctx, keywords)
    elif is_non_subject(code):
        return _check_01e_non_subject_no_exception_kw(row, ctx, keywords)
    else:
        return None


def _check_01a_standard_with_kw(row, ctx, keywords: dict):
    """TC-01a: 課税売上10% + 別区分の特徴KWあり (reverse_suspect)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of, build_search_text

    search_text = build_search_text(row)

    all_hits: list[str] = []
    for kw_category in ["legitimately_non_taxable", "overseas", "food_keywords"]:
        all_hits.extend(matches_of(search_text, keywords.get(kw_category, [])))

    if not all_hits:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-01",
        sub_code="TC-01a",
        severity="🟡 Medium",
        error_type="reverse_suspect",
        area="A8",
        sort_priority=21,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=50,
        message=(
            f"売上が課税売上10%で計上されていますが、"
            f"摘要に別区分の可能性を示すキーワード({', '.join(all_hits)})が含まれています。"
            f"非課売上・輸出売上・軽減税率(8%)の可能性があるため、税区分を確認してください。"
        ),
        link_hints=link_hints,
    )


def _check_01b_reduced_not_food(row, ctx, keywords: dict, food_business_accounts: set):
    """TC-01b: 課税売上8%(軽) + 食品系でない (direct_error)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any, build_search_text

    if row.account in food_business_accounts:
        return None  # 食品系科目 → 軽減税率は正当

    search_text = build_search_text(row)
    if matches_any(search_text, keywords.get("food_keywords", [])):
        return None  # 食品KWあり → 軽減税率の可能性あり

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-01",
        sub_code="TC-01b",
        severity="🔴 High",
        error_type="direct_error",
        area="A8",
        sort_priority=6,
        row=row,
        current_value=row.tax_label,
        suggested_value="課税売上10%",
        confidence=90,
        message=(
            f"売上が軽減税率(8%)で計上されていますが、"
            f"科目「{row.account}」は軽減税率対象の食品系業種ではなく、"
            f"摘要にも食品関連のキーワードが含まれていません。"
            f"標準税率(10%)の可能性があります。"
        ),
        link_hints=link_hints,
    )


def _check_01c_export_no_overseas_kw(row, ctx, keywords: dict):
    """TC-01c: 輸出売上 + 海外取引KWなし (direct_error)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any, build_search_text

    search_text = build_search_text(row)
    if matches_any(search_text, keywords.get("overseas", [])):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-01",
        sub_code="TC-01c",
        severity="🔴 High",
        error_type="direct_error",
        area="A8",
        sort_priority=7,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=80,
        message=(
            f"売上が輸出免税で計上されていますが、摘要に海外取引を示すキーワードが含まれていません。"
            f"輸出証憑(B/L、インボイス等)の保存が必須です。"
            f"国内取引の可能性も含め確認してください。"
        ),
        link_hints=link_hints,
    )


def _check_01d_non_taxable_no_exception_kw(row, ctx, keywords: dict):
    """TC-01d: 非課売上 + 例外KWなし (direct_error)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any, build_search_text

    search_text = build_search_text(row)
    if matches_any(search_text, keywords.get("legitimately_non_taxable", [])):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-01",
        sub_code="TC-01d",
        severity="🔴 High",
        error_type="direct_error",
        area="A8",
        sort_priority=8,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=85,
        message=(
            f"売上が非課税売上で計上されていますが、"
            f"摘要に非課税取引(住宅家賃、土地売却、有価証券、社会保険診療等)を示すキーワードが"
            f"含まれていません。課税売上の誤りの可能性があるため、確認してください。"
        ),
        link_hints=link_hints,
    )


def _check_01e_non_subject_no_exception_kw(row, ctx, keywords: dict):
    """TC-01e: 対象外 + 例外KWなし (direct_error)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any, build_search_text

    search_text = build_search_text(row)
    if matches_any(search_text, keywords.get("legitimately_non_taxable", [])):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-01",
        sub_code="TC-01e",
        severity="🔴 High",
        error_type="direct_error",
        area="A8",
        sort_priority=9,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=85,
        message=(
            f"売上が対象外(不課税)で計上されていますが、"
            f"摘要に対象外取引を示すキーワードが含まれていません。"
            f"資産の譲渡等に該当する課税売上の可能性があるため、確認してください。"
        ),
        link_hints=link_hints,
    )
