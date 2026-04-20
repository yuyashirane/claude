"""Phase 7: freee_link_generator ユニットテスト。

generate_gl_url / generate_jnl_url の純粋関数テスト。
LinkHints は schema.py から importlib 経由で取得（hyphen-path 対応）。

テスト分類:
    A. generate_gl_url  — 5件
    B. generate_jnl_url — 5件
    C. _fmt ヘルパー    — 2件
合計: 12件
"""
import sys
import urllib.parse
from datetime import date
from pathlib import Path

import pytest

# ─────────────────────────────────────────────────────────────────────
# LinkHints ファクトリ（schema.py を動的ロード）
# ─────────────────────────────────────────────────────────────────────

def _load_schema():
    """schema.py を sys.modules["schema"] にロードして返す。"""
    import importlib.util
    if "schema" not in sys.modules:
        root = Path(__file__).parent.parent.parent
        schema_path = (
            root / "skills" / "verify" / "V1-3-rule"
            / "check-tax-classification" / "schema.py"
        )
        spec = importlib.util.spec_from_file_location("schema", schema_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["schema"] = mod
        spec.loader.exec_module(mod)
    return sys.modules["schema"]


def _make_link_hints(
    target="general_ledger",
    account_name="支払手数料",
    period_start=date(2025, 12, 1),
    period_end=date(2025, 12, 31),
    fiscal_year_id="9842248",
    company_id="3525430",
    deal_id=None,
):
    schema = _load_schema()
    return schema.LinkHints(
        target=target,
        account_name=account_name,
        period_start=period_start,
        period_end=period_end,
        fiscal_year_id=fiscal_year_id,
        company_id=company_id,
        deal_id=deal_id,
    )


# ─────────────────────────────────────────────────────────────────────
# A. generate_gl_url（5件）
# ─────────────────────────────────────────────────────────────────────

def test_gl_url_full_params():
    """総勘定元帳 URL が全パラメータで正しく生成される。"""
    from skills._common.lib.freee_link_generator import generate_gl_url

    lh = _make_link_hints()
    url = generate_gl_url(lh)

    assert url is not None
    assert "secure.freee.co.jp/reports/general_ledgers/show" in url
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    # 勘定科目名がエンコードされていること
    assert params["name"] == ["支払手数料"]
    assert params["start_date"] == ["2025-12-01"]
    assert params["end_date"] == ["2025-12-31"]
    assert params["fiscal_year_id"] == ["9842248"]
    assert params["company_id"] == ["3525430"]


def test_gl_url_none_link_hints():
    """link_hints が None なら None を返す。"""
    from skills._common.lib.freee_link_generator import generate_gl_url
    assert generate_gl_url(None) is None


def test_gl_url_empty_account_name():
    """account_name が空文字なら None を返す（総勘定元帳は科目名が必須）。"""
    from skills._common.lib.freee_link_generator import generate_gl_url
    lh = _make_link_hints(account_name="")
    assert generate_gl_url(lh) is None


def test_gl_url_none_account_name():
    """account_name が None なら None を返す。"""
    from skills._common.lib.freee_link_generator import generate_gl_url
    lh = _make_link_hints(account_name=None)
    assert generate_gl_url(lh) is None


def test_gl_url_japanese_account_name_encoded():
    """日本語の科目名（仮払消費税等）が正しく URL エンコードされる。"""
    from skills._common.lib.freee_link_generator import generate_gl_url
    lh = _make_link_hints(account_name="仮払消費税等")
    url = generate_gl_url(lh)
    assert url is not None
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    # parse_qs がデコードするのでデコード後の日本語で確認
    assert params["name"] == ["仮払消費税等"]
    # URL 中にパーセントエンコードが含まれることを確認
    assert "%" in url


# ─────────────────────────────────────────────────────────────────────
# B. generate_jnl_url（5件）
# ─────────────────────────────────────────────────────────────────────

def test_jnl_url_with_deal_id_pinpoint():
    """deal_id が存在する場合、ピンポイント URL（?deal_id=...）が生成される。"""
    from skills._common.lib.freee_link_generator import generate_jnl_url

    lh = _make_link_hints(deal_id="2730330344")
    url = generate_jnl_url(lh)

    assert url is not None
    assert "secure.freee.co.jp/reports/journals" in url
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    assert params["deal_id"] == ["2730330344"]
    assert params["company_id"] == ["3525430"]
    # ピンポイント URL には start_date/end_date を含めない
    assert "start_date" not in params
    assert "end_date" not in params
    # account_name は journal に不要
    assert "name" not in params


def test_jnl_url_fallback_to_period():
    """deal_id がない場合、期間ベース URL にフォールバックする。"""
    from skills._common.lib.freee_link_generator import generate_jnl_url

    lh = _make_link_hints(deal_id=None)
    url = generate_jnl_url(lh)

    assert url is not None
    assert "secure.freee.co.jp/reports/journals" in url
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    assert "deal_id" not in params
    assert params["start_date"] == ["2025-12-01"]
    assert params["end_date"] == ["2025-12-31"]
    assert params["fiscal_year_id"] == ["9842248"]
    assert params["company_id"] == ["3525430"]
    assert "name" not in params


def test_jnl_url_none_link_hints():
    """link_hints が None なら None を返す。"""
    from skills._common.lib.freee_link_generator import generate_jnl_url
    assert generate_jnl_url(None) is None


def test_jnl_url_accepts_general_ledger_hints():
    """target=general_ledger の link_hints でも仕訳帳 URL を生成できる（パターン 2 設計確認）。"""
    from skills._common.lib.freee_link_generator import generate_jnl_url

    lh = _make_link_hints(target="general_ledger", deal_id=None)
    url = generate_jnl_url(lh)

    assert url is not None
    assert "/reports/journals" in url
    # account_name（総勘定元帳用）は journal URL に含めない
    assert "name=" not in url


def test_jnl_url_deal_id_not_include_period():
    """deal_id あり → 期間パラメータが URL に入らない（ピンポイント純粋化確認）。"""
    from skills._common.lib.freee_link_generator import generate_jnl_url

    lh = _make_link_hints(
        deal_id="9999",
        period_start=date(2025, 12, 1),
        period_end=date(2025, 12, 31),
    )
    url = generate_jnl_url(lh)
    assert url is not None
    assert "start_date=" not in url
    assert "end_date=" not in url
    assert "deal_id=9999" in url


def test_jnl_url_deal_id_override_takes_priority():
    """deal_id 引数が link_hints.deal_id より優先される（Finding.deal_id 直接渡しパターン）。

    背景: build_link_hints("general_ledger") は deal_id を含まない。
    template_engine は Finding.deal_id を deal_id 引数で渡すことでピンポイント URL を生成する。
    """
    from skills._common.lib.freee_link_generator import generate_jnl_url

    # link_hints には deal_id なし（general_ledger target の通常状態）
    lh = _make_link_hints(deal_id=None)
    url = generate_jnl_url(lh, deal_id="3237332503")
    assert url is not None
    assert "deal_id=3237332503" in url
    assert "start_date=" not in url  # ピンポイントなので期間パラメータ不要


# ─────────────────────────────────────────────────────────────────────
# C. _fmt ヘルパー（2件）
# ─────────────────────────────────────────────────────────────────────

def test_fmt_date_converted_to_iso():
    """date オブジェクトが YYYY-MM-DD 形式の文字列に変換される。"""
    from skills._common.lib.freee_link_generator import _fmt
    assert _fmt(date(2025, 12, 1)) == "2025-12-01"
    assert _fmt(date(2026, 1, 31)) == "2026-01-31"


def test_fmt_none_returns_none():
    """None および空文字列は None を返す。"""
    from skills._common.lib.freee_link_generator import _fmt
    assert _fmt(None) is None
    assert _fmt("") is None
