"""TC-02: 土地・住宅家賃の課税誤り。

仕様書 v1.2.2 §5.2 準拠。Phase 4 の山場、最も判定ロジックが複雑な TC。

6サブタイプ (mixed は初版スコープ外):
    TC-02a: 土地取引が課税 (direct_error, 🔴, subarea=land)
    TC-02b: 受取家賃(住宅)が課税売上 (direct_error, 🔴, subarea=rent)
    TC-02c: 支払家賃(住宅用)が課税仕入 (direct_error, 🔴, subarea=rent)
    TC-02d: 駐車場・付随設備の判定要確認 (gray_review, 🟡, subarea=parking) 内部2分岐
    TC-02e: 受取家賃が非課売上 + 事業用KW (reverse_suspect, 🟡, subarea=rent)
    TC-02f: 支払家賃が非課仕入 + 事業用KW (reverse_suspect, 🟡, subarea=rent)

新要素:
    - 3層キーワード判定 (strong / weak / business_use)
    - 駐車場の優先ディスパッチ (住宅判定の前)
    - 売上側/仕入側の両方を扱う (他TCと異なる)
    - reverse_suspect の双方向対応
    - classify_residential() による純粋判定関数の導入

Phase 4-1 までの設計判断 (戦略Claude + 悠皓さん レビュー済み):
    - mixed (strong + business) は初版スコープ外、誤検知防止優先
    - キーワードはマージ版採用 (仕様書 + 悠皓さん運用案)
    - 駐車場は住宅判定では除外、TC-02d で別処理

Phase 3-R 成果を全面活用:
    - resolve_tax_code を import
    - load_reference_json(filter_meta=True) でメタキー自動除外

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc02_land_rent.py
"""
from __future__ import annotations

from typing import Optional


def run(ctx) -> list:
    """TC-02 のメインエントリ。"""
    from skills._common.lib.finding_factory import (
        load_reference_json, resolve_tax_code, is_credit_side, is_debit_side,
    )
    from skills._common.lib.keyword_matcher import build_search_text

    accounts = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/rent-accounts",
        filter_meta=True,
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/rent-keywords",
        filter_meta=True,
    )

    revenue_accounts = set(accounts.get("revenue", []))
    expense_accounts = set(accounts.get("expense", []))
    land_accounts = set(accounts.get("land_accounts", []))

    findings = []

    for row in ctx.transactions:
        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        # ステップ1: 土地系判定
        if row.account in land_accounts:
            f = _check_tc02a_land(row, ctx, code)
            if f is not None:
                findings.append(f)
            continue  # 土地系は他のサブと排他

        # ステップ2: 家賃系科目の判定
        is_revenue = row.account in revenue_accounts
        is_expense = row.account in expense_accounts

        if not (is_revenue or is_expense):
            continue  # TC-02 のスコープ外

        # 貸方/借方の整合性チェック
        if is_revenue and not is_credit_side(row):
            continue
        if is_expense and not is_debit_side(row):
            continue

        # ステップ3/4: 売上側 or 仕入側ディスパッチ
        search_text = build_search_text(row)

        # 駐車場優先ディスパッチ (TC-02d)
        if _matches_parking(search_text, keywords):
            f = _check_tc02d_parking(row, ctx, code, keywords, is_revenue, search_text)
            if f is not None:
                findings.append(f)
            continue

        # 住宅判定
        residential = classify_residential(search_text, keywords)
        if residential is None:
            continue

        result_type, confidence = residential
        if is_revenue:
            f = _check_revenue_side(row, ctx, code, result_type, confidence, search_text, keywords)
        else:
            f = _check_expense_side(row, ctx, code, result_type, confidence, search_text, keywords)

        if f is not None:
            findings.append(f)

    return findings


# ═══════════════════════════════════════════════════════════════
# 住宅判定の3層ロジック (mixed はスコープ外)
# ═══════════════════════════════════════════════════════════════

def classify_residential(search_text: str, keywords: dict) -> Optional[tuple[str, int]]:
    """住宅判定の3層ロジック。

    Returns:
        None: 住宅と判定しない
        ("strong", 85): 強い住宅シグナル
        ("weak", 70): 弱い住宅シグナル
        ("business", 65): 事業用KWのみ → reverse_suspect 用
        ("mixed_business", 45): 住宅KW + 事業用KW → reverse_suspect 用 (確度低)
    """
    from skills._common.lib.keyword_matcher import matches_any

    has_strong = matches_any(search_text, keywords.get("residential_strong", []))
    has_weak = matches_any(search_text, keywords.get("residential_weak", []))
    has_business = matches_any(search_text, keywords.get("business_use", []))

    if has_business:
        if has_strong or has_weak:
            return ("mixed_business", 45)
        return ("business", 65)

    if has_strong:
        return ("strong", 85)

    if has_weak:
        return ("weak", 70)

    return None


def _matches_parking(search_text: str, keywords: dict) -> bool:
    """parking KW のマッチを確認。"""
    from skills._common.lib.keyword_matcher import matches_any
    return matches_any(search_text, keywords.get("parking", []))


# ═══════════════════════════════════════════════════════════════
# TC-02a: 土地取引が課税
# ═══════════════════════════════════════════════════════════════

def _check_tc02a_land(row, ctx, code: int):
    """TC-02a: 土地取引が課税。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_taxable_sales, is_taxable_purchase

    is_sales = is_taxable_sales(code)
    is_purchase = is_taxable_purchase(code)

    if not (is_sales or is_purchase):
        return None

    suggested = "非課売上" if is_sales else "非課仕入"
    side_str = "売上" if is_sales else "仕入"

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-02",
        sub_code="TC-02a",
        severity="🔴 High",
        error_type="direct_error",
        area="A4",
        sort_priority=10,
        row=row,
        current_value=row.tax_label,
        suggested_value=suggested,
        confidence=90,
        message=(
            f"土地取引は非課税です。"
            f"消費税法別表第一第1号により、土地の譲渡・貸付けは非課税取引に該当します。"
            f"科目「{row.account}」が課税{side_str}となっているため、{suggested}への変更を確認してください。"
        ),
        subarea="land",
        link_hints=link_hints,
    )


# ═══════════════════════════════════════════════════════════════
# TC-02d: 駐車場・付随設備 (内部2分岐)
# ═══════════════════════════════════════════════════════════════

def _check_tc02d_parking(row, ctx, code: int, keywords: dict, is_revenue: bool, search_text: str):
    """TC-02d: 駐車場の判定要確認。仕様書 §5.2.6 の2分岐。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_any
    from skills._common.lib.tax_code_helpers import (
        is_taxable_sales, is_taxable_purchase,
        is_non_taxable_sales, is_non_taxable_purchase,
    )

    has_residential = (
        matches_any(search_text, keywords.get("residential_strong", []))
        or matches_any(search_text, keywords.get("residential_weak", []))
    )

    if is_revenue:
        is_taxable = is_taxable_sales(code)
        is_non_taxable = is_non_taxable_sales(code)
    else:
        is_taxable = is_taxable_purchase(code)
        is_non_taxable = is_non_taxable_purchase(code)

    if has_residential and is_taxable:
        message = (
            f"駐車場と住宅関連キーワードが両方含まれています。"
            f"住宅付随駐車場の場合、家賃と一体で非課税となる可能性があります。"
            f"分離契約か一体契約かを確認してください。"
            f"科目「{row.account}」の取引内容を確認してください。"
        )
    elif not has_residential and is_non_taxable:
        message = (
            f"駐車場のみで非課税処理されていますが、独立した駐車場貸付けは課税対象となる可能性があります。"
            f"用途を確認してください。"
            f"科目「{row.account}」の取引内容を確認してください。"
        )
    else:
        message = (
            f"駐車場関連の取引です。住宅付随か独立駐車場かによって税区分が異なります。"
            f"契約形態を確認してください。"
            f"科目「{row.account}」の取引内容を確認してください。"
        )

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-02",
        sub_code="TC-02d",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A4",
        sort_priority=18,
        row=row,
        current_value=row.tax_label,
        suggested_value="要判断",
        confidence=70,
        message=message,
        subarea="parking",
        link_hints=link_hints,
    )


# ═══════════════════════════════════════════════════════════════
# 売上側ディスパッチ (TC-02b / TC-02e)
# ═══════════════════════════════════════════════════════════════

def _check_revenue_side(row, ctx, code: int, result_type: str, confidence: int,
                        search_text: str, keywords: dict):
    """売上側 (受取家賃) の判定。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import (
        is_standard_taxable_sales, is_reduced_taxable_sales, is_non_taxable_sales,
    )

    is_taxable = is_standard_taxable_sales(code) or is_reduced_taxable_sales(code)
    is_non_taxable = is_non_taxable_sales(code)

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-02b: 住宅 + 課税売上 → direct_error
    if result_type in ("strong", "weak") and is_taxable:
        return create_finding(
            tc_code="TC-02",
            sub_code="TC-02b",
            severity="🔴 High",
            error_type="direct_error",
            area="A4",
            sort_priority=12,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課売上",
            confidence=confidence,
            message=(
                f"受取家賃が課税売上として処理されていますが、"
                f"摘要に住宅用を示すキーワードが含まれています。"
                f"住宅家賃は非課税売上(消費税法別表第一第13号)です。"
                f"科目「{row.account}」の税区分を「非課売上」に変更することを確認してください。"
            ),
            subarea="rent",
            link_hints=link_hints,
        )

    # TC-02e: 事業用KW + 非課売上 → reverse_suspect
    if result_type in ("business", "mixed_business") and is_non_taxable:
        return create_finding(
            tc_code="TC-02",
            sub_code="TC-02e",
            severity="🟡 Medium",
            error_type="reverse_suspect",
            area="A4",
            sort_priority=22,
            row=row,
            current_value=row.tax_label,
            suggested_value="課税売上の可能性",
            confidence=confidence,
            message=(
                f"受取家賃が非課税売上として処理されていますが、"
                f"摘要に事業用を示すキーワードが含まれています。"
                f"事業用建物の賃貸は課税売上の可能性があります。"
                f"科目「{row.account}」の税区分を確認してください。"
            ),
            subarea="rent",
            link_hints=link_hints,
        )

    return None


# ═══════════════════════════════════════════════════════════════
# 仕入側ディスパッチ (TC-02c / TC-02f)
# ═══════════════════════════════════════════════════════════════

def _check_expense_side(row, ctx, code: int, result_type: str, confidence: int,
                        search_text: str, keywords: dict):
    """仕入側 (支払家賃) の判定。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_non_taxable_purchase,
    )

    is_taxable = is_taxable_purchase(code)
    is_non_taxable = is_non_taxable_purchase(code)

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-02c: 住宅 + 課税仕入 → direct_error
    if result_type in ("strong", "weak") and is_taxable:
        return create_finding(
            tc_code="TC-02",
            sub_code="TC-02c",
            severity="🔴 High",
            error_type="direct_error",
            area="A4",
            sort_priority=13,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=confidence,
            message=(
                f"支払家賃が課税仕入として処理されていますが、"
                f"摘要に住宅用を示すキーワードが含まれています。"
                f"住宅家賃は非課税仕入です。"
                f"科目「{row.account}」の税区分を「非課仕入」に変更することを確認してください。"
            ),
            subarea="rent",
            link_hints=link_hints,
        )

    # TC-02f: 事業用KW + 非課仕入 → reverse_suspect
    if result_type in ("business", "mixed_business") and is_non_taxable:
        return create_finding(
            tc_code="TC-02",
            sub_code="TC-02f",
            severity="🟡 Medium",
            error_type="reverse_suspect",
            area="A4",
            sort_priority=23,
            row=row,
            current_value=row.tax_label,
            suggested_value="課税仕入の可能性",
            confidence=confidence,
            message=(
                f"支払家賃が非課税仕入として処理されていますが、"
                f"摘要に事業用を示すキーワードが含まれています。"
                f"事業用建物の賃借は課税仕入の可能性があります。"
                f"科目「{row.account}」の税区分を確認してください。"
            ),
            subarea="rent",
            link_hints=link_hints,
        )

    return None
