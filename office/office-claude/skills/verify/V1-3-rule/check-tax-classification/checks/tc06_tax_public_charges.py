"""TC-06: 租税公課の課税誤り。

仕様書 v1.2.2 §5.6 準拠。Pattern C(原則判定 + 例外KW補正型)の実装。
TC-04/05 で確立した Pattern B に、例外KW辞書と Skill間委譲を追加する。

5サブタイプ:
    TC-06a: 租税公課が課税仕入(direct_error, 🔴) ← 例外KWで除外可能
    TC-06b: 法人税等が課税区分(direct_error, 🔴, confidence=95) ← 高異常度
    TC-06c: 租税公課が非課仕入=許容(mild_warning, 🟢, show_by_default=False) ← TC-06a排他
    TC-06d: 軽油引取税の判定要確認(gray_review, 🟡, show_by_default=False) ← V1-3-30へ委譲
    TC-06e: ゴルフ場利用税・入湯税の判定要確認(gray_review, 🟡)

新要素(Pattern C の特徴):
    - taxable_exception KW による例外除外(初版空、運用で育てる)
    - note="defer_to_V1-3-30" による Skill間委譲
    - note="high_anomaly" による高異常度マーカー

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc06_tax_public_charges.py
"""
from __future__ import annotations

from typing import Optional


def run(ctx) -> list:
    """TC-06 のメインエントリ。"""
    from skills._common.lib.account_matcher import categorize_account
    from skills._common.lib.finding_factory import load_reference_json, resolve_tax_code

    accounts = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/tax-public-charges-accounts",
        filter_meta=True,  # メタキー除外を明示
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/tax-public-charges-keywords",
        filter_meta=True,
    )

    findings = []

    for row in ctx.transactions:
        category = categorize_account(row.account, accounts)
        if category is None:
            continue

        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        f = None
        if category == "tax_public_charges":
            f = _check_tax_public_charges(row, ctx, code, keywords)
        elif category == "corporate_tax":
            f = _check_corporate_tax(row, ctx, code)
        elif category == "fuel_related":
            f = _check_fuel_related(row, ctx, code, keywords)
        elif category == "entertainment":
            f = _check_entertainment(row, ctx, code, keywords)

        if f is not None:
            findings.append(f)

    return findings


def _check_tax_public_charges(row, ctx, code: int, keywords: dict):
    """tax_public_charges カテゴリ: TC-06a / TC-06c の判定。

    TC-06a: 課税仕入 → direct_error (ただし taxable_exception KWで除外)
    TC-06c: 非課仕入 → mild_warning (許容パターン、show_by_default=False)
    排他制御: TC-06a → TC-06c スキップ
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any, build_search_text
    from skills._common.lib.tax_code_helpers import is_taxable_purchase, is_non_taxable_purchase

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-06a: 課税仕入 → direct_error (taxable_exception KWマッチで除外)
    if is_taxable_purchase(code):
        # 例外KWチェック(Pattern C の拡張点。初版は空、運用で育てる)
        search_text = build_search_text(row)
        if matches_any(search_text, keywords.get("taxable_exception", [])):
            return None  # 例外KWマッチ → スキップ

        return create_finding(
            tc_code="TC-06",
            sub_code="TC-06a",
            severity="🔴 High",
            error_type="direct_error",
            area="A12",
            sort_priority=11,
            row=row,
            current_value=row.tax_label,
            suggested_value="対象外",
            confidence=90,
            message=(
                f"租税公課は対象外(不課税)です。"
                f"消費税法第2条第1項第8号の資産の譲渡等に該当しません。"
                f"科目「{row.account}」が課税仕入となっているため、対象外への変更を確認してください。"
            ),
            subarea="tax_public_charges",
            link_hints=link_hints,
        )

    # TC-06c: 非課仕入 → mild_warning(許容パターン、taxable_exception は評価しない)
    if is_non_taxable_purchase(code):
        return create_finding(
            tc_code="TC-06",
            sub_code="TC-06c",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A12",
            sort_priority=96,
            row=row,
            current_value=row.tax_label,
            suggested_value="対象外",
            confidence=60,
            message=(
                f"租税公課は「非課仕入」でも実害は限定的ですが、"
                f"より正確には「対象外」が適切です。"
                f"科目「{row.account}」の税区分の見直しを推奨します。"
            ),
            subarea="tax_public_charges",
            show_by_default=False,
            link_hints=link_hints,
        )

    return None


def _check_corporate_tax(row, ctx, code: int):
    """corporate_tax カテゴリ: TC-06b の判定。

    法人税等が課税系(仕入/売上/非課売上)になっている → 強い異常。
    confidence=95 + note="high_anomaly"
    NG税区分に売上系も含む。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.note_markers import validate_note
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_taxable_sales, is_non_taxable_sales,
    )

    if not (is_taxable_purchase(code) or is_taxable_sales(code) or is_non_taxable_sales(code)):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-06",
        sub_code="TC-06b",
        severity="🔴 High",
        error_type="direct_error",
        area="A12",
        sort_priority=3,
        row=row,
        current_value=row.tax_label,
        suggested_value="対象外",
        confidence=95,  # 高異常度
        message=(
            f"法人税等の科目が課税区分となっており、強い異常です。"
            f"法人税・住民税・事業税は対象外(不課税)で処理されるべきです。"
            f"科目「{row.account}」の入力を至急確認してください。"
        ),
        subarea="tax_public_charges",
        note=validate_note("high_anomaly"),
        link_hints=link_hints,
    )


def _check_fuel_related(row, ctx, code: int, keywords: dict):
    """fuel_related カテゴリ: TC-06d の判定(V1-3-30 へ委譲)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of, build_search_text
    from skills._common.lib.note_markers import validate_note
    from skills._common.lib.tax_code_helpers import is_taxable_purchase

    if not is_taxable_purchase(code):
        return None

    search_text = build_search_text(row)
    kw_hits = matches_of(search_text, keywords.get("diesel", []))
    if not kw_hits:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-06",
        sub_code="TC-06d",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A12",
        sort_priority=26,
        row=row,
        current_value=row.tax_label,
        suggested_value="要判断",
        confidence=70,
        message=(
            f"科目「{row.account}」に軽油関連のキーワード({', '.join(kw_hits)})が含まれています。"
            f"軽油引取税は対象外(不課税)であり、本体価格との分離が必要な可能性があります。"
            f"詳細は軽油引取税チェック(V1-3-30)で確認してください。"
        ),
        subarea="tax_public_charges",
        show_by_default=False,
        note=validate_note("defer_to_V1-3-30"),
        link_hints=link_hints,
    )


def _check_entertainment(row, ctx, code: int, keywords: dict):
    """entertainment カテゴリ: TC-06e の判定。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of, build_search_text
    from skills._common.lib.tax_code_helpers import is_taxable_purchase

    if not is_taxable_purchase(code):
        return None

    search_text = build_search_text(row)
    kw_hits = matches_of(search_text, keywords.get("usage_tax", []))
    if not kw_hits:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-06",
        sub_code="TC-06e",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A12",
        sort_priority=27,
        row=row,
        current_value=row.tax_label,
        suggested_value="要判断",
        confidence=70,
        message=(
            f"科目「{row.account}」に利用税関連のキーワード({', '.join(kw_hits)})が含まれています。"
            f"ゴルフ場利用税・入湯税は対象外(不課税)であり、本体価格との分離が必要な可能性があります。"
            f"請求書の内訳を確認してください。"
        ),
        subarea="tax_public_charges",
        link_hints=link_hints,
    )


