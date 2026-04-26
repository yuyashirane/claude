"""TC-04: 受取利息・配当・保険金・補助金の課税誤り。

仕様書 v1.2.2 §5.4 準拠。Pattern B（科目カテゴリ × 税区分マトリクス型）の模範実装。
TC-05/06 のテンプレートになる構造。

判定の主語: 勘定科目カテゴリ + 現在の税区分
    ① categorize_account で科目カテゴリ（interest / non_consideration / damage / misc）を判定
    ② カテゴリ × 現税区分で2次元マトリクスによりサブタイプを決定
    ③ 排他制御: direct_error が発火したら mild_warning をスキップ

6サブタイプ(error_type 4種類を全網羅):
    TC-04a: 受取利息が課税売上(direct_error, 🔴)
    TC-04b: 配当金等が課税売上(direct_error, 🔴) ← message分岐あり
    TC-04c: 受取利息が対象外=許容(mild_warning, 🟢) ← TC-04a排他
    TC-04d: 配当金等が非課売上=許容(mild_warning, 🟢) ← TC-04b排他
    TC-04e: 損害賠償金の課税性要確認(gray_review, 🟡)
    TC-04f: 雑収入でKWマッチ(reverse_suspect, 🟡) ← matches_of使用

配置: skills/verify/V1-3-rule/check-tax-classification/checks/tc04_non_taxable_revenue.py
"""
from __future__ import annotations

from typing import Optional


def run(ctx) -> list:
    """TC-04 のメインエントリ。

    処理フロー:
        1. 科目辞書・KW辞書を読み込み
        2. 各仕訳を categorize_account でカテゴリ分類
        3. カテゴリ別のチェック関数に振り分け
        4. Finding のリストを返す
    """
    from skills._common.lib.account_matcher import categorize_account
    from skills._common.lib.finding_factory import load_reference_json, resolve_tax_code

    account_categories = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/non-taxable-revenue-accounts",
        filter_meta=True,  # メタキー除外を明示
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/non-taxable-revenue-keywords",
        filter_meta=True,
    )

    findings = []

    for row in ctx.transactions:
        category = categorize_account(row.account, account_categories)
        if category is None:
            continue  # TC-04 の対象外科目

        code = resolve_tax_code(row, ctx)
        if code is None:
            continue

        f = None
        if category == "interest":
            f = _check_interest(row, ctx, code)
        elif category == "non_consideration":
            f = _check_non_consideration(row, ctx, code)
        elif category == "damage_compensation":
            f = _check_damage_compensation(row, ctx, code)
        elif category == "misc_revenue":
            f = _check_misc_revenue(row, ctx, code, keywords)

        if f is not None:
            findings.append(f)

    return findings


def _check_interest(row, ctx, code: int):
    """interest カテゴリ: TC-04a / TC-04c の判定。

    排他制御: TC-04a(direct_error)が発火したら TC-04c(mild_warning)はスキップ。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_taxable_sales, is_non_subject

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-04a: 課税売上 → direct_error
    if is_taxable_sales(code):
        return create_finding(
            tc_code="TC-04",
            sub_code="TC-04a",
            severity="🔴 High",
            error_type="direct_error",
            area="A11",
            sort_priority=4,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課売上",
            confidence=90,
            message=(
                f"受取利息は非課税売上です。"
                f"消費税法別表第一第3号の非課税取引に該当します。"
                f"科目「{row.account}」が課税売上となっているため、非課売上への変更を確認してください。"
            ),
            subarea="non_operating_revenue",
            link_hints=link_hints,
        )

    # TC-04c: 対象外 → mild_warning（TC-04a が出なかった場合のみ）
    if is_non_subject(code):
        return create_finding(
            tc_code="TC-04",
            sub_code="TC-04c",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A11",
            sort_priority=92,
            row=row,
            current_value=row.tax_label,
            suggested_value="非課売上",
            confidence=60,
            message=(
                f"受取利息は「対象外」でも消費税計算上の大きな影響が出ない場合がありますが、"
                f"より正確には「非課売上」が適切です。"
                f"課税売上割合の計算に影響する可能性があります。"
            ),
            subarea="non_operating_revenue",
            show_by_default=False,
            note="affects_taxable_sales_ratio",
            link_hints=link_hints,
        )

    return None  # 非課売上等の正常 → 検出なし


def _check_non_consideration(row, ctx, code: int):
    """non_consideration カテゴリ: TC-04b / TC-04d の判定。

    排他制御: TC-04b(direct_error)が発火したら TC-04d(mild_warning)はスキップ。
    TC-04b は message 分岐あり(variant=dividend vs insurance_subsidy)。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_taxable_sales, is_non_taxable_sales

    link_hints = build_link_hints("general_ledger", row, ctx)

    # TC-04b: 課税売上 → direct_error
    if is_taxable_sales(code):
        # message 分岐: 配当金系 vs 保険金・補助金系
        if "配当" in row.account:
            message = (
                f"配当金は資産の譲渡等の対価ではないため対象外です。"
                f"消費税法第2条第1項第8号に該当します。"
                f"科目「{row.account}」が課税売上となっているため、対象外への変更を確認してください。"
            )
        else:
            message = (
                f"保険金・補助金は対価性のない収入のため対象外です。"
                f"消費税法第2条第1項第8号に該当します。"
                f"科目「{row.account}」が課税売上となっているため、対象外への変更を確認してください。"
            )

        return create_finding(
            tc_code="TC-04",
            sub_code="TC-04b",
            severity="🔴 High",
            error_type="direct_error",
            area="A11",
            sort_priority=5,
            row=row,
            current_value=row.tax_label,
            suggested_value="対象外",
            confidence=90,
            message=message,
            subarea="non_operating_revenue",
            link_hints=link_hints,
        )

    # TC-04d: 非課売上 → mild_warning（TC-04b が出なかった場合のみ）
    if is_non_taxable_sales(code):
        return create_finding(
            tc_code="TC-04",
            sub_code="TC-04d",
            severity="🟢 Low",
            error_type="mild_warning",
            area="A11",
            sort_priority=93,
            row=row,
            current_value=row.tax_label,
            suggested_value="対象外",
            confidence=60,
            message=(
                f"配当金・保険金・補助金等は「非課売上」でも申告が直ちに大きく崩れるとは限りませんが、"
                f"より正確には「対象外」が適切です。"
                f"課税売上割合の計算区分にも注意が必要です。"
            ),
            subarea="non_operating_revenue",
            show_by_default=False,
            note="affects_taxable_sales_ratio",
            link_hints=link_hints,
        )

    return None


def _check_damage_compensation(row, ctx, code: int):
    """damage_compensation カテゴリ: TC-04e の判定(gray_review)。"""
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.tax_code_helpers import is_taxable_sales

    if not is_taxable_sales(code):
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-04",
        sub_code="TC-04e",
        severity="🟡 Medium",
        error_type="gray_review",
        area="A11",
        sort_priority=19,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=70,
        message=(
            f"損害賠償金が課税売上として処理されています。"
            f"損害賠償金は原則として対価性がなく対象外ですが、"
            f"資産の損壊に伴う補填や逸失利益の場合は課税対象になることがあります。"
            f"科目「{row.account}」の内容を確認してください。"
        ),
        subarea="non_operating_revenue",
        link_hints=link_hints,
    )


def _check_misc_revenue(row, ctx, code: int, keywords: dict):
    """misc_revenue カテゴリ: TC-04f の判定(reverse_suspect)。

    雑収入が課税売上で、かつ摘要に非対価性KWがマッチする場合のみ検出。
    KWマッチしなければ検出しない(ノイズ防止)。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of, build_search_text
    from skills._common.lib.tax_code_helpers import is_taxable_sales

    if not is_taxable_sales(code):
        return None

    search_text = build_search_text(row)
    kw_hits = matches_of(search_text, keywords.get("non_consideration", []))
    if not kw_hits:
        return None  # KW マッチなし → ノイズ防止でスキップ

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="TC-04",
        sub_code="TC-04f",
        severity="🟡 Medium",
        error_type="reverse_suspect",
        area="A11",
        sort_priority=20,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=50,
        message=(
            f"雑収入が課税売上として処理されていますが、"
            f"摘要に対価性のない収入を示すキーワード（{', '.join(kw_hits)}）が含まれています。"
            f"対象外の可能性があります。科目「{row.account}」の内容を確認してください。"
        ),
        subarea="non_operating_revenue",
        note="reverse_detection",
        link_hints=link_hints,
    )


