"""freee の画面 URL を生成する純粋関数群。

Finding.link_hints を受け取り、freee の該当画面 URL を組み立てる。
ctx や外部状態には依存しない（テスト容易性のため）。

設計原則:
    - 引数に LinkHints オブジェクトを取るが、import は行わない（duck typing）
    - schema.py は hyphen-path のため通常 import 不可
    - getattr() 経由で属性にアクセスすることで、any LinkHints-like オブジェクトを受け入れる

使用例:
    from skills._common.lib.freee_link_generator import generate_gl_url, generate_jnl_url

    url_gl  = generate_gl_url(finding.link_hints)
    url_jnl = generate_jnl_url(finding.link_hints)

対象 URL:
    総勘定元帳: https://secure.freee.co.jp/reports/general_ledgers/show
    仕訳帳:     https://secure.freee.co.jp/reports/journals
"""
from __future__ import annotations

import urllib.parse
from typing import Optional

_BASE_URL = "https://secure.freee.co.jp"


def _fmt(val) -> Optional[str]:
    """date / str / int 値を URL パラメータ用文字列に変換する。

    date オブジェクトは ISO 形式（YYYY-MM-DD）に変換。
    None や空文字列は None を返す（URL パラメータから除外するため）。
    """
    if val is None:
        return None
    # date / datetime は isoformat() で文字列化
    s = val.isoformat() if hasattr(val, "isoformat") else str(val)
    return s if s else None


def generate_gl_url(link_hints) -> Optional[str]:
    """総勘定元帳 URL を生成する。

    account_name が存在しない場合は None を返す（総勘定元帳は科目名が必須）。
    呼び出し側（template_engine）は戻り値が None かどうかで
    「リンクなし」を判断できる。

    生成 URL 例:
        https://secure.freee.co.jp/reports/general_ledgers/show
            ?name=%E6%94%AF%E6%89%95%E6%89%8B%E6%95%B0%E6%96%99
            &start_date=2025-12-01&end_date=2025-12-31
            &fiscal_year_id=9842248&company_id=3525430

    Args:
        link_hints: LinkHints オブジェクト（または属性互換の任意オブジェクト）

    Returns:
        URL 文字列。link_hints が None または account_name 未設定なら None。
    """
    if link_hints is None:
        return None

    account_name = getattr(link_hints, "account_name", None)
    if not account_name:
        return None

    params: dict[str, str] = {"name": account_name}

    if v := _fmt(getattr(link_hints, "period_start", None)):
        params["start_date"] = v
    if v := _fmt(getattr(link_hints, "period_end", None)):
        params["end_date"] = v
    if v := _fmt(getattr(link_hints, "fiscal_year_id", None)):
        params["fiscal_year_id"] = v
    if v := _fmt(getattr(link_hints, "company_id", None)):
        params["company_id"] = v

    return f"{_BASE_URL}/reports/general_ledgers/show?{urllib.parse.urlencode(params)}"


def generate_jnl_url(link_hints, deal_id: Optional[str] = None) -> Optional[str]:
    """仕訳帳 URL を生成する。

    deal_id が存在する場合はピンポイント遷移 URL を優先する。
    これにより「ワンクリックで該当取引を開ける」UX が実現される。

    deal_id の解決優先順位:
        1. deal_id 引数（直接渡し） — Finding.deal_id を template_engine から渡す用途
        2. link_hints.deal_id     — checker が明示的に deal_detail リンクを設定した場合
        3. None → 期間ベースフォールバック

    背景: build_link_hints("general_ledger", ...) は deal_id を含まないため、
    template_engine が Finding.deal_id を直接渡す必要がある。

    優先 1 — deal_id あり（ピンポイント）:
        https://secure.freee.co.jp/reports/journals?deal_id=2730330344&company_id=3525430

    優先 2 — deal_id なし（期間ベースフォールバック）:
        https://secure.freee.co.jp/reports/journals
            ?start_date=2025-12-01&end_date=2025-12-31
            &fiscal_year_id=9842248&company_id=3525430

    account_name は仕訳帳 URL には不要なため含めない。

    Args:
        link_hints: LinkHints オブジェクト（または属性互換の任意オブジェクト）
        deal_id: Finding.deal_id など、link_hints 外から渡す deal_id（優先）

    Returns:
        URL 文字列。link_hints が None なら None。
    """
    if link_hints is None:
        return None

    # deal_id の解決: 引数 > link_hints.deal_id の順
    effective_deal_id = _fmt(deal_id) or _fmt(getattr(link_hints, "deal_id", None))

    params: dict[str, str] = {}

    if effective_deal_id:
        # 優先 1: deal_id によるピンポイント遷移
        params["deal_id"] = effective_deal_id
        if v := _fmt(getattr(link_hints, "company_id", None)):
            params["company_id"] = v
    else:
        # 優先 2: 期間ベースフォールバック
        if v := _fmt(getattr(link_hints, "period_start", None)):
            params["start_date"] = v
        if v := _fmt(getattr(link_hints, "period_end", None)):
            params["end_date"] = v
        if v := _fmt(getattr(link_hints, "fiscal_year_id", None)):
            params["fiscal_year_id"] = v
        if v := _fmt(getattr(link_hints, "company_id", None)):
            params["company_id"] = v

    return f"{_BASE_URL}/reports/journals?{urllib.parse.urlencode(params)}"


def _extract_tax_group_code(finding, ctx) -> Optional[str]:
    """Finding から税区分コード (文字列) を逆引きする pure helper。

    Phase 8-C 視覚確認後修正 v2 の確定仕様:
        1. Finding.current_value == row.tax_label (TC-01〜07 で共通保証)
        2. ctx.tax_code_master[tax_label] → コード文字列 (例: "136")
        3. ctx が None / tax_code_master 不在 / 逆引き失敗 → None

    checker 層・Finding スキーマは一切変更せず、既存の ctx.tax_code_master を
    Excel 層側で活用するアプローチ。

    Args:
        finding: Finding オブジェクト（current_value 属性を持つ想定）
        ctx:     CheckContext（tax_code_master 辞書を持つ想定）

    Returns:
        税区分コード文字列。解決できない場合は None。
    """
    if ctx is None:
        return None
    tax_label = getattr(finding, "current_value", None)
    if not tax_label:
        return None
    tax_code_master = getattr(ctx, "tax_code_master", None)
    if not tax_code_master:
        return None
    return tax_code_master.get(tax_label)


def _collect_group_tax_codes(group, ctx) -> list:
    """FindingGroup 内の全税区分コードを収集する pure helper。

    処理順序（Phase 8-C Fix v2 確定仕様）:
        1. グループ内の各 Finding から _extract_tax_group_code で税区分コードを抽出
        2. None を除外
        3. set で重複排除
        4. sorted でソートして安定化（決定的動作 P12）

    Args:
        group: FindingGroup
        ctx:   CheckContext（None 可）

    Returns:
        ソート済み・重複排除済みの税区分コード文字列リスト。
        全件解決できない場合は空リスト（呼び出し側でフィルタなし扱い）。
    """
    codes = []
    for finding in group.findings:
        code = _extract_tax_group_code(finding, ctx)
        if code is not None:
            codes.append(code)
    return sorted(set(codes))


def build_group_gl_link(group, ctx=None) -> Optional[str]:
    """FindingGroup に対する総勘定元帳リンクを生成する (Phase 8-C 親行 Q 列用)。

    Step 3-C C-2 改修後の確定仕様:
        期間:
            ctx.period_start / ctx.period_end（会計期間全体）を優先。
            ctx がない、または ctx の期間値が欠落していれば
            グループ代表 link_hints.period_start / period_end（単月）にフォールバック。
        税区分:
            FindingGroup 内の全税区分を tax_group_codes として複数指定
            （ctx.tax_code_master 経由で Finding.current_value から逆引き）。
            全件解決できなければフィルタなし。
        勘定科目:
            group.findings[0].link_hints.account_name
        会計期 ID / 会社 ID:
            ctx 優先、link_hints フォールバック

    設計思想:
        親行 GL は「期間全体 × 勘定科目 × グループ税区分」で
        会計期間を通したフィルタビューを開く。子行 GL は単月で精密に。

    Args:
        group: FindingGroup
        ctx:   CheckContext（None 可。ctx がなければ tax_group_codes は付与されず、
               期間も link_hints の単月にフォールバック）

    Returns:
        URL 文字列。group.findings 空 / account_name 欠落時は None。
    """
    if not group.findings:
        return None

    first = group.findings[0]
    link_hints = getattr(first, "link_hints", None)

    # 勘定科目名: link_hints.account_name が必須 (GL リンクの必須パラメタ)
    account_name = (
        getattr(link_hints, "account_name", None) if link_hints is not None else None
    )
    if not account_name:
        return None

    # 期間: ctx の会計期間全体を優先、欠落時 link_hints の単月にフォールバック
    def _pick_period(attr):
        if ctx is not None:
            v = getattr(ctx, attr, None)
            if v is not None:
                return v
        return getattr(link_hints, attr, None) if link_hints is not None else None

    period_start = _pick_period("period_start")
    period_end = _pick_period("period_end")

    # 会計期 / 会社 ID: ctx 優先、link_hints フォールバック
    def _pick(attr):
        if ctx is not None:
            v = getattr(ctx, attr, None)
            if v is not None:
                return v
        return getattr(link_hints, attr, None) if link_hints is not None else None

    fiscal_year_id = _pick("fiscal_year_id")
    company_id = _pick("company_id")

    # 税区分コード: ctx.tax_code_master 経由で逆引き（複数可）
    tax_codes = _collect_group_tax_codes(group, ctx)

    # urlencode(params, doseq=True) は list value を複数クエリに展開する。
    # ただし順序保証のため list of tuples 形式で組み立てる。
    params: list[tuple[str, str]] = [("name", account_name)]
    if v := _fmt(period_start):
        params.append(("start_date", v))
    if v := _fmt(period_end):
        params.append(("end_date", v))
    if v := _fmt(fiscal_year_id):
        params.append(("fiscal_year_id", v))
    if v := _fmt(company_id):
        params.append(("company_id", v))

    # 税区分は list of tuples で複数クエリ展開: tax_group_codes=2&tax_group_codes=20
    for code in tax_codes:
        params.append(("tax_group_codes", str(code)))

    return f"{_BASE_URL}/reports/general_ledgers/show?{urllib.parse.urlencode(params)}"
