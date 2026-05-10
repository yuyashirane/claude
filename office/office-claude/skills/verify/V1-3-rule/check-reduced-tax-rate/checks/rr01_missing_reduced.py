"""RR-01: 軽減税率 8% 漏れ検出 (主検出)。

標準税率10% で計上されているが、軽減税率対象 (食品 / 新聞 定期購読) の
可能性が高い row を検出する。Pattern: 税区分起点 + 科目フィルタ + KW 判定 +
negative match (digital サービス除外)。

3 サブタイプ:
    RR-01a: 新聞図書費 + 標準10% + 定期購読 KW
            → direct_error, 🔴 Critical, confidence=85
    RR-01b: 会議費系 (会議費/福利厚生費/接待交際費) + 標準10% + 強食品 KW
            → direct_error, 🔴 Critical, confidence=80
    RR-01c: その他関連科目 (消耗品費/通信費/雑費) + 標準10% + 弱食品 KW
            → direct_error, 🟡 Medium, confidence=60

判定要素の重要度 (035-survey §3.1 / 036.5 補修後):
    税区分コード ★★★  起点 (is_standard_purchase_10)
    勘定科目     ★★★  dispatch 軸 (新聞 / 会議費系 / その他)
    摘要 KW (強) ★★★  弁当 / 食料品 / テイクアウト / 定期購読 等
    摘要 KW (弱) ★★   コーヒー / お茶 / 飲料 等
    取引先       ★    補助情報のみ (RR-01a の判定要素からは除外、036.5 補修)

軽減税率対象の業務的根拠 (国税庁通達):
    新聞のうち軽減税率対象は、「一定の題号を用い、政治、経済、社会、文化等
    に関する一般社会的事実を掲載する週 2 回以上発行される新聞であって、
    定期購読契約に基づくものに限られます」。
    → 駅売り・コンビニ等での 1 部売り (新聞単発購入) は標準 10% が正。
    → 036.5 補修で「コンビニ + 低額」条件を削除し、定期購読 KW 必須化。

False positive 制御:
    - negative_digital KW (Amazonプライム会費等) に該当する row は検出しない。
    - 036.5 補修: 新聞単発購入を軽減対象として誤検出する条件を撤去。
      KW なしの新聞図書費は判別不能のため検出しない (false negative 許容)。

設計メモ: 035-survey §3.1 / §3.2.3 + 036.5 補修方針
配置: skills/verify/V1-3-rule/check-reduced-tax-rate/checks/rr01_missing_reduced.py
"""
from __future__ import annotations


# ═══════════════════════════════════════════════════════════════
# メイン run 関数
# ═══════════════════════════════════════════════════════════════

def run(ctx) -> list:
    """RR-01 主検出のメインエントリ。

    標準10%仕入の row のうち、軽減税率対象の可能性が高いものを Finding 化。
    """
    from skills._common.lib.finding_factory import (
        load_reference_json,
        resolve_tax_code,
    )
    from skills._common.lib.keyword_matcher import build_search_text, matches_any
    from skills._common.lib.tax_code_helpers import is_standard_purchase_10
    from skills._common.lib.account_matcher import account_equals_any

    accounts = load_reference_json(
        "verify/V1-3-rule/check-reduced-tax-rate",
        "keywords/reduced-tax-rate-accounts",
        filter_meta=True,
    )
    keywords = load_reference_json(
        "verify/V1-3-rule/check-reduced-tax-rate",
        "keywords/reduced-tax-rate-keywords",
        filter_meta=True,
    )

    newspaper_accounts: list[str] = list(accounts.get("newspaper_accounts", []))
    meeting_food_accounts: list[str] = list(accounts.get("meeting_food_accounts", []))
    other_accounts: list[str] = list(accounts.get("other_relevant_accounts", []))

    negative_digital_kws: list[str] = list(keywords.get("negative_digital", []))

    findings: list = []

    for row in ctx.transactions:
        # 1. 税区分フィルタ: 標準10%仕入のみ対象
        code = resolve_tax_code(row, ctx)
        if code is None or not is_standard_purchase_10(code):
            continue

        # 2. negative match: digital サービス系は除外 (false positive 抑制)
        search_text = build_search_text(row)
        if matches_any(search_text, negative_digital_kws):
            continue

        # 3. 科目別 dispatch (優先順位 = 確度の高い順)
        if account_equals_any(row.account, newspaper_accounts):
            f = _check_rr01a_newspaper(row, ctx, keywords, search_text)
        elif account_equals_any(row.account, meeting_food_accounts):
            f = _check_rr01b_meeting_food(row, ctx, keywords, search_text)
        elif account_equals_any(row.account, other_accounts):
            f = _check_rr01c_weak_food(row, ctx, keywords, search_text)
        else:
            f = None

        if f is not None:
            findings.append(f)

    return findings


# ═══════════════════════════════════════════════════════════════
# サブタイプ別 check 関数
# ═══════════════════════════════════════════════════════════════

def _check_rr01a_newspaper(row, ctx, keywords: dict, search_text: str):
    """RR-01a: 新聞図書費 + 標準10% + 定期購読 KW。

    軽減税率対象は「定期購読契約に基づく新聞」のみ (国税庁通達)。
    駅売り・コンビニ等での 1 部売り (新聞単発購入) は標準 10% が正しいため、
    定期購読 KW がない row は検出しない (036.5 補修)。

    note: 「新聞」「日刊」「朝刊」等の KW のみでは定期購読か単発か判別不能の
    ため、必ず「定期購読」「月極」等の購読契約を示す KW とのコンテキストで
    検出する設計。これにより新聞単発購入の false positive を撲滅。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of

    newspaper_subscription = keywords.get("newspaper_subscription", [])

    matched = matches_of(search_text, newspaper_subscription)
    if not matched:
        return None  # 定期購読 KW なし → 単発購入 or 書籍購入の可能性、検出しない

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-11",
        sub_code="RR-01a",
        severity="🔴 Critical",
        error_type="direct_error",
        area="A10",
        sort_priority=22,
        row=row,
        current_value=row.tax_label,
        suggested_value="課対仕入8%(軽)",
        confidence=85,
        message=(
            f"科目「{row.account}」が標準税率10%で計上されていますが、"
            f"摘要に定期購読 KW ({', '.join(matched)}) が含まれています。"
            f"定期購読契約に基づく新聞は軽減税率8%(軽)対象のため、確認してください。"
        ),
        link_hints=link_hints,
    )


def _check_rr01b_meeting_food(row, ctx, keywords: dict, search_text: str):
    """RR-01b: 会議費系 + 標準10% + 強食品 KW (弁当/食料品/テイクアウト等)。

    社内向けの食品購入は軽減税率対象。会議費・福利厚生費・接待交際費の
    科目で標準10%計上 + 強食品 KW があれば高確度の 8% 漏れ。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of

    food_strong = keywords.get("food_strong", [])
    matched = matches_of(search_text, food_strong)
    if not matched:
        return None  # 強食品 KW なし → false positive 回避

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-11",
        sub_code="RR-01b",
        severity="🔴 Critical",
        error_type="direct_error",
        area="A10",
        sort_priority=23,
        row=row,
        current_value=row.tax_label,
        suggested_value="課対仕入8%(軽)",
        confidence=80,
        message=(
            f"科目「{row.account}」が標準税率10%で計上されていますが、"
            f"摘要に食品系 KW ({', '.join(matched)}) が含まれています。"
            f"軽減税率8%(軽)対象の可能性があるため、確認してください "
            f"(店内飲食の場合は標準10%が正)。"
        ),
        link_hints=link_hints,
    )


def _check_rr01c_weak_food(row, ctx, keywords: dict, search_text: str):
    """RR-01c: その他関連科目 + 標準10% + 弱食品 KW (コーヒー/お茶/飲料等)。

    確度は低めだが、消耗品費等で食品系 KW があれば軽減税率対象の可能性。
    severity Medium、confidence 60 で「要確認」レベルの Finding。
    """
    from skills._common.lib.finding_factory import create_finding, build_link_hints
    from skills._common.lib.keyword_matcher import matches_of

    food_weak = keywords.get("food_weak", [])
    food_strong = keywords.get("food_strong", [])
    # 強・弱どちらでもマッチすれば候補
    matched = matches_of(search_text, food_strong + food_weak)
    if not matched:
        return None

    link_hints = build_link_hints("general_ledger", row, ctx)

    return create_finding(
        tc_code="V1-3-11",
        sub_code="RR-01c",
        severity="🟡 Medium",
        error_type="direct_error",
        area="A10",
        sort_priority=32,
        row=row,
        current_value=row.tax_label,
        suggested_value="",
        confidence=60,
        message=(
            f"科目「{row.account}」が標準税率10%で計上されていますが、"
            f"摘要に食品関連 KW ({', '.join(matched)}) が含まれています。"
            f"軽減税率8%(軽)対象の可能性があるため、内容を確認してください。"
        ),
        link_hints=link_hints,
    )


