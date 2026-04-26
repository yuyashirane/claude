"""TC-05: 支払利息・保険料の非課税漏れ。

仕様書 v1.2.2 §5.5 準拠。TC-04 の派生(Pattern B + 動的エリア + デュアルルート)。

判定の主語: 勘定科目カテゴリ + 現在の税区分
    ① categorize_account で科目カテゴリ判定(interest / insurance / guarantee_direct / payment_fee)
    ② カテゴリ × 現税区分でサブタイプを決定
    ③ 排他制御: direct_error が発火したら mild_warning をスキップ
    ④ TC-05e はデュアルルート(Route A: guarantee_direct科目 / Route B: 支払手数料+KW)
    ⑤ 動的エリア: interest→A11 / insurance・guarantee→A10

5サブタイプ:
    TC-05a: 支払利息が課税仕入/課税売上/非課売上(direct_error, 🟡, A11, subarea=non_operating_expense)
    TC-05b: 保険料が課税仕入/課税売上/非課売上(direct_error, 🟡, A10)
            ← 生命保険料は conf=72 + "積立型" message variant
    TC-05c: 支払利息が対象外=許容(mild_warning, 🟢, A11) ← TC-05a排他
    TC-05d: 保険料が対象外=許容(mild_warning, 🟢, A10) ← TC-05b排他
    TC-05e: 保証料疑い(gray_review, 🟡, A10) ← デュアルルート
        Route A: guarantee_direct科目 + 課税仕入 (conf=85)
        Route B: 支払手数料 + 課税仕入 + guarantee KWマッチ (conf=70)

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc05_non_taxable_expense.py
"""
from __future__ import annotations

from typing import Optional


def run(ctx) -> list:
    """TC-05 のメインエントリ。"""
    from skills._common.lib.account_matcher import categorize_account
    from skills._common.lib.finding_factory import load_reference_json, resolve_tax_code

    account_categories = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/non-taxable-expense-accounts",
        filter_meta=True,  # メタキー除外を明示
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/non-taxable-expense-keywords",
        filter_meta=True,
    )

    findings = []

    for row in ctx.transactions:
        category = categorize_account(row.account, account_categories)
        if category is None:
            continue

        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        f = None
        if category == "interest":
            f = _check_interest(row, ctx, code)
        elif category == "insurance":
            f = _check_insurance(row, ctx, code)
        elif category == "guarantee_direct":
            f = _check_guarantee_direct(row, ctx, code)
        elif category == "payment_fee":
            f = _check_payment_fee_for_guarantee(row, ctx, code, keywords)

        if f is not None:
            findings.append(f)

    return findings


def _is_ng_for_non_taxable_expense(code: int) -> bool:
    """支払利息・保険料にとって NG な税区分(課税仕入 or 課税売上 or 非課売上)。"""
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_taxable_sales, is_non_taxable_sales,
    )
    return is_taxable_purchase(code) or is_taxable_sales(code) or is_non_taxable_sales(code)


def _check_interest(row, ctx, code: int):
    """interest カテゴリ: TC-05a / TC-05c。area=A11, subarea=non_operating_expense。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_non_subject

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-05a: 支払利息が NG 税区分 → direct_error
    if _is_ng_for_non_taxable_expense(code):
        return create_finding(
            tc_code="TC-05",
            sub_code="TC-05a",
            severity="🟡 Medium",
            error_type="direct_error",
            area="A11",
            sort_priority=14,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=90,
            message=(
                f"支払利息は非課税仕入です。"
                f"消費税法別表第一第3号の非課税取引に該当します。"
                f"科目「{row.account}」の税区分を「非課仕入」に変更してください。"
            ),
            subarea="non_operating_expense",
            link_hints=link_hints,
        )

    # TC-05c: 支払利息が対象外 → mild_warning
    if is_non_subject(code):
        return create_finding(
            tc_code="TC-05",
            sub_code="TC-05c",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A11",
            sort_priority=94,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=60,
            message=(
                f"支払利息は「対象外」でも消費税計算上の大きな影響が出ない場合がありますが、"
                f"より正確には「非課仕入」が適切です。"
                f"課税売上割合の計算に影響する可能性があります。"
            ),
            subarea="non_operating_expense",
            show_by_default=False,
            note="affects_taxable_sales_ratio",
            link_hints=link_hints,
        )

    return None


def _check_insurance(row, ctx, code: int):
    """insurance カテゴリ: TC-05b / TC-05d。area=A10。

    生命保険料は confidence=72 + "積立型" message variant。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_non_subject

    link_hints = build_link_hints("general_ledger", row, ctx)
    is_life = "生命保険" in row.account

    # TC-05b: 保険料が NG 税区分 → direct_error
    if _is_ng_for_non_taxable_expense(code):
        if is_life:
            message = (
                f"保険料は非課税仕入です。"
                f"消費税法別表第一第3号の非課税取引に該当します。"
                f"ただし、生命保険料の場合は積立型(貯蓄性)の可能性があり、"
                f"その場合は保険料ではなく保険積立金等の資産計上が必要となることがあります。"
                f"科目「{row.account}」の内容と税区分を確認してください。"
            )
            confidence = 72
        else:
            message = (
                f"保険料は非課税仕入です。"
                f"消費税法別表第一第3号の非課税取引に該当します。"
                f"科目「{row.account}」の税区分を「非課仕入」に変更してください。"
            )
            confidence = 90

        return create_finding(
            tc_code="TC-05",
            sub_code="TC-05b",
            severity="🟡 Medium",
            error_type="direct_error",
            area="A10",
            sort_priority=15,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=confidence,
            message=message,
            link_hints=link_hints,
        )

    # TC-05d: 保険料が対象外 → mild_warning
    if is_non_subject(code):
        return create_finding(
            tc_code="TC-05",
            sub_code="TC-05d",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A10",
            sort_priority=95,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=60,
            message=(
                f"保険料は「対象外」でも消費税計算上の大きな影響が出ない場合がありますが、"
                f"より正確には「非課仕入」が適切です。"
                f"課税売上割合の計算に影響する可能性があります。"
            ),
            show_by_default=False,
            note="affects_taxable_sales_ratio",
            link_hints=link_hints,
        )

    return None


def _check_guarantee_direct(row, ctx, code: int):
    """guarantee_direct カテゴリ: TC-05e Route A。area=A10, confidence=85。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_taxable_purchase

    if not is_taxable_purchase(code):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-05",
        sub_code="TC-05e",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A10",
        sort_priority=25,
        row=row,
        current_value=row.tax_label,
        suggested_value="非課仕入",
        confidence=85,
        message=(
            f"保証料は原則として非課税仕入です(消費税法別表第一第3号)。"
            f"科目「{row.account}」が課税仕入となっているため、非課仕入への変更を確認してください。"
            f"ただし、一部の保証役務は課税対象となる場合があるため内容確認が必要です。"
        ),
        link_hints=link_hints,
    )


def _check_payment_fee_for_guarantee(row, ctx, code: int, keywords: dict):
    """payment_fee カテゴリ: TC-05e Route B。area=A10, confidence=70。

    支払手数料 + 課税仕入 + guarantee KWマッチの場合のみ検出。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of, build_search_text
    from skills._common.lib.tax_code_helpers import is_taxable_purchase

    if not is_taxable_purchase(code):
        return None

    search_text = build_search_text(row)
    kw_hits = matches_of(search_text, keywords.get("guarantee", []))
    if not kw_hits:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-05",
        sub_code="TC-05e",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A10",
        sort_priority=25,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=70,
        message=(
            f"支払手数料が課税仕入として処理されていますが、"
            f"摘要に保証料関連のキーワード({', '.join(kw_hits)})が含まれています。"
            f"保証料は非課税仕入のため、内容を確認して必要に応じて税区分を変更してください。"
        ),
        link_hints=link_hints,
    )


