"""文字列・キーワード判定ヘルパー。

出典: v1.2.2 §13.4.6(3関数) + Step 4-C v0.2.1 §3.A(4関数)
配置: skills/_common/lib/keyword_matcher.py (§13.4.5 準拠)

関数一覧:
    matches_any          - 単純キーワード一致（§3.A.1）
    matches_any_weighted - 重み付きキーワード判定（§3.A.2）
    normalize_account_name - 勘定科目名の正規化（§3.A.3）
    normalize_tax_label  - 税区分名の正規化（§3.A.4）
    contains_any         - §13.4.6 名称。matches_any のエイリアス
    matches_of           - マッチしたキーワード群を返す（§13.4.6 v0.2 新規）
    build_search_text    - 仕訳から検索用テキストを組み立てる（§13.4.6 v0.2 新規）
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # 型ヒント用のみ。実行時は getattr で属性アクセス
    pass


# ── 正規化ヘルパー（内部用） ──

_FULL_TO_HALF_SPACE = str.maketrans({"　": " "})
_HALF_PAREN_TO_FULL = str.maketrans({"(": "（", ")": "）"})


def _normalize_text(text: str) -> str:
    """内部用の汎用テキスト正規化。strip + 全角空白→半角 + 連続空白圧縮。"""
    if not text:
        return ""
    result = text.translate(_FULL_TO_HALF_SPACE).strip()
    result = re.sub(r" {2,}", " ", result)
    return result


# ── 公開 API（7関数） ──

def matches_any(text: str, keywords: list[str]) -> bool:
    """text にキーワードのいずれかが含まれるか判定する（部分一致）。

    大文字小文字は区別しない。text または keywords が空なら False。

    Examples:
        >>> matches_any("2026年3月分給与", ["給与", "賞与"])
        True
        >>> matches_any("備品購入", ["給与", "賞与"])
        False
    """
    if not text or not keywords:
        return False
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in keywords if kw)


def matches_any_weighted(
    text: str,
    keyword_groups: dict[str, list[str]],
) -> dict[str, bool]:
    """複数のキーワード群それぞれについてマッチの有無を返す。

    TC-02 の3層住宅判定(strong/weak/business_use)等で使用。
    各群に対して matches_any() を適用するのと等価。

    Examples:
        >>> groups = {"strong": ["社宅", "寮"], "weak": ["マンション"], "business": ["事務所"]}
        >>> matches_any_weighted("田町マンション事務所", groups)
        {'strong': False, 'weak': True, 'business': True}
    """
    if not text:
        return {group: False for group in keyword_groups}
    return {
        group: matches_any(text, kws)
        for group, kws in keyword_groups.items()
    }


def normalize_account_name(name: str) -> str:
    """勘定科目名の表記揺れを正規化する。

    処理: strip → 全角空白→半角 → 連続空白圧縮 → 半角括弧→全角括弧

    Examples:
        >>> normalize_account_name("  給与手当  ")
        '給与手当'
        >>> normalize_account_name("支払利息(割引料)")
        '支払利息（割引料）'
    """
    if not name:
        return ""
    result = _normalize_text(name)
    result = result.translate(_HALF_PAREN_TO_FULL)
    return result


def normalize_tax_label(label: str) -> str:
    """税区分名の表記揺れを正規化する。

    処理: strip → 全角空白→半角 → 半角括弧→全角括弧 → 半角%はそのまま保持

    Examples:
        >>> normalize_tax_label("課対仕入10%")
        '課対仕入10%'
        >>> normalize_tax_label(" 非課売上 ")
        '非課売上'
        >>> normalize_tax_label("課対仕入8%(軽)")
        '課対仕入8%（軽）'
    """
    if not label:
        return ""
    result = _normalize_text(label)
    result = result.translate(_HALF_PAREN_TO_FULL)
    return result


# contains_any は matches_any のエイリアス（§13.4.6 の名称に合わせる）
contains_any = matches_any


def matches_of(text: str, keywords: list[str]) -> list[str]:
    """text に含まれるキーワードのリストを返す。

    matches_any と異なり、「どのキーワードがマッチしたか」を返す。
    TC-04/05/06/07 の KW 依存 TC で、マッチ根拠を Finding に記録するために使う。

    Examples:
        >>> matches_of("社員忘年会 飲食代", ["忘年会", "飲食", "旅行"])
        ['忘年会', '飲食']
        >>> matches_of("備品購入", ["忘年会", "飲食"])
        []
    """
    if not text or not keywords:
        return []
    text_lower = text.lower()
    return [kw for kw in keywords if kw and kw.lower() in text_lower]


def build_search_text(row) -> str:
    """仕訳から検索用テキストを組み立てる。

    description + partner + item + memo_tag + notes を連結する。
    None のフィールドは空文字列として扱う。

    §13.4.6 の元シグネチャは (deal, det) だが、TransactionRow に統一
    (Q3 で合意済み、Node.js 由来の引数形式を Python 向けに吸収)。

    Examples:
        >>> # row.description="家賃4月分", row.partner="〇〇不動産", row.item=None
        >>> build_search_text(row)
        '家賃4月分 〇〇不動産'
    """
    parts = [
        getattr(row, "description", "") or "",
        getattr(row, "partner", "") or "",
        getattr(row, "item", "") or "",
        getattr(row, "memo_tag", "") or "",
        getattr(row, "notes", "") or "",
    ]
    return " ".join(p for p in parts if p).strip()
