"""勘定科目判定ヘルパー。

出典: v1.2.2 §13.4.6
配置: skills/_common/lib/account_matcher.py (§13.4.5 準拠)
"""
from __future__ import annotations

from typing import Literal, Optional

from skills._common.lib.keyword_matcher import normalize_account_name


def account_equals_any(name: str, accounts: list[str]) -> bool:
    """科目名が accounts のいずれかと完全一致するか判定する。

    正規化後に比較する。TC-03(給与系)等で使用。
    「福利厚生費」が「法定福利費」に部分一致する事故を防ぐため、
    完全一致判定を優先して使う。

    Examples:
        >>> account_equals_any("給与手当", ["給与手当", "賞与", "役員報酬"])
        True
        >>> account_equals_any("福利厚生費", ["法定福利費"])
        False
    """
    if not name:
        return False
    normalized = normalize_account_name(name)
    return any(
        normalize_account_name(acc) == normalized
        for acc in accounts
        if acc
    )


def account_includes_any(name: str, accounts: list[str]) -> bool:
    """科目名が accounts のいずれかを部分文字列として含むか判定する。

    TC-01/02 等で使用。完全一致よりも広い判定が必要な場合に使う。

    Examples:
        >>> account_includes_any("地代家賃", ["家賃"])
        True
        >>> account_includes_any("消耗品費", ["家賃"])
        False
    """
    if not name:
        return False
    normalized = normalize_account_name(name)
    return any(
        normalize_account_name(acc) in normalized
        for acc in accounts
        if acc
    )


def categorize_account(
    name: str,
    categories: dict[str, list[str]],
    match_mode: Literal["equals", "includes"] = "equals",
) -> Optional[str]:
    """科目名をカテゴリに分類する。

    categories の各キー(カテゴリ名)に対応する科目リストと照合し、
    最初にマッチしたカテゴリ名を返す。マッチしなければ None。

    TC-04/05/06/07 で科目カテゴリ × 税区分の2次元マトリクス判定に使用。

    Args:
        name: 勘定科目名
        categories: カテゴリ名 → 科目リストの辞書
            例: {"interest": ["受取利息", "受取利息配当金"],
                 "non_consideration": ["受取配当金", "保険金収入"]}
        match_mode: "equals"(完全一致）or "includes"（部分一致）

    Examples:
        >>> cats = {"salary": ["給与手当", "賞与"], "welfare": ["福利厚生費"]}
        >>> categorize_account("給与手当", cats)
        'salary'
        >>> categorize_account("消耗品費", cats)
        None
    """
    if not name:
        return None
    matcher = account_equals_any if match_mode == "equals" else account_includes_any
    for category, account_list in categories.items():
        if matcher(name, account_list):
            return category
    return None
