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
