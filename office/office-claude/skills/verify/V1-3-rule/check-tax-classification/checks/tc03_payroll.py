"""TC-03: 給与・法定福利費の課税誤り。

仕様書 v1.2.2 §5.3 準拠。3つのサブタイプ:
    TC-03a: 給与系が課税区分(direct_error, 🔴)
    TC-03b: 法定福利費が課税区分(direct_error, 🔴)
    TC-03c: 法定福利費が対象外=許容パターン(mild_warning, 🟢)

判定の核心: 勘定科目の完全一致のみ。KW検索は不使用。
account_equals_any を使い、account_includes_any は使わない。
「法定福利費」が「福利厚生費」に部分一致する事故を防ぐ。

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc03_payroll.py
"""
from __future__ import annotations

from typing import Optional


def run(ctx) -> list:
    """TC-03 のメインエントリ。CheckContext の全仕訳を走査し、Finding のリストを返す。

    処理フロー:
        1. payroll-accounts.json を読み込み
        2. 各仕訳に対して:
           a. 科目が salary リストに完全一致 → _check_salary
           b. 科目が social_insurance リストに完全一致 → _check_social_insurance
           c. どちらにも一致しない → スキップ
        3. Finding のリストを返す
    """
    from skills._common.lib.finding_factory import load_reference_json

    accounts = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/payroll-accounts",
    )
    salary_accounts = accounts["salary"]
    social_insurance_accounts = accounts["social_insurance"]

    findings = []

    for row in ctx.transactions:
        # TC-03a: 給与系
        f = _check_salary(row, ctx, salary_accounts)
        if f is not None:
            findings.append(f)
            continue  # 同一仕訳で TC-03b/c は検査しない

        # TC-03b / TC-03c: 法定福利費系
        f = _check_social_insurance(row, ctx, social_insurance_accounts)
        if f is not None:
            findings.append(f)

    return findings


def _check_salary(row, ctx, salary_accounts: list[str]):
    """TC-03a: 給与系科目が課税区分になっていないかチェック。

    NG条件: is_taxable_purchase(code) or is_non_taxable_purchase(code)
    正解: 対象外(コード2)
    confidence: 90（退職給付費用のみ80）
    """
    from skills._common.lib.account_matcher import account_equals_any
    from skills._common.lib.finding_factory import create_finding, build_link_hints, resolve_tax_code
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_non_taxable_purchase,
    )

    if not account_equals_any(row.account, salary_accounts):
        return None

    code = resolve_tax_code(row, ctx)
    if code is None:
        return None  # 税区分コード不明 → 判定不能、スキップ

    if not (is_taxable_purchase(code) or is_non_taxable_purchase(code)):
        return None  # NG税区分に該当しない → 正常

    confidence = 80 if row.account == "退職給付費用" else 90

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-03",
        sub_code="TC-03a",
        severity="🔴 High",
        error_type="direct_error",
        area="A5",
        sort_priority=1,
        row=row,
        current_value=row.tax_label,
        suggested_value="対象外",
        confidence=confidence,
        message=(
            f"給与・賞与・役員報酬等は対象外です。"
            f"労働の対価は資産の譲渡等に該当しないため、消費税の対象外です。"
            f"科目「{row.account}」が課税仕入となっているため、対象外への変更を確認してください。"
        ),
        subarea="payroll",
        link_hints=link_hints,
    )


def _check_social_insurance(row, ctx, social_insurance_accounts: list[str]):
    """TC-03b / TC-03c: 法定福利費系科目のチェック。

    TC-03b: 課税区分ならNG(direct_error)
    TC-03c: 対象外なら許容パターン(mild_warning)
    TC-03b が発火したら TC-03c はスキップ(排他制御 §13.4.7 R1)
    """
    from skills._common.lib.account_matcher import account_equals_any
    from skills._common.lib.finding_factory import create_finding, build_link_hints, resolve_tax_code
    from skills._common.lib.tax_code_helpers import (
        is_taxable_purchase, is_taxable_sales, is_non_taxable_sales,
        is_non_subject,
    )

    if not account_equals_any(row.account, social_insurance_accounts):
        return None

    code = resolve_tax_code(row, ctx)
    if code is None:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-03b: 課税区分NG
    if is_taxable_purchase(code) or is_taxable_sales(code) or is_non_taxable_sales(code):
        return create_finding(
            tc_code="TC-03",
            sub_code="TC-03b",
            severity="🔴 High",
            error_type="direct_error",
            area="A5",
            sort_priority=2,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=90,
            message=(
                f"法定福利費は非課税仕入です。"
                f"社会保険料は消費税法別表第一第3号の非課税取引に該当します。"
                f"科目「{row.account}」が課税区分となっているため、非課仕入への変更を確認してください。"
            ),
            subarea="payroll",
            link_hints=link_hints,
        )

    # TC-03c: 対象外は許容パターン(mild_warning)
    if is_non_subject(code):
        return create_finding(
            tc_code="TC-03",
            sub_code="TC-03c",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A5",
            sort_priority=92,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課仕入",
            confidence=60,
            message=(
                f"法定福利費は「対象外」でも消費税計算上の影響は通常ありません。"
                f"帳簿の整合性の観点では「非課仕入」の方がより明確です。"
                f"科目「{row.account}」の税区分を「非課仕入」にすることをお勧めします。"
            ),
            subarea="payroll",
            show_by_default=False,
            note="tax_impact_negligible",
            link_hints=link_hints,
        )

    return None  # 非課仕入等の正常パターン → 検出なし
