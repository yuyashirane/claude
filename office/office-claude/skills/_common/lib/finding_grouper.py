"""Phase 8-A Finding 集約層。

checker が返す Finding のリストを、TC ごとに定義された group_key 戦略で
束ね、FindingGroup のリストに変換する。Excel 層の親子行(アウトライン)
描画はこの FindingGroup を読む。

責務境界(R3 二層責務):
    checker  → Finding (既存、本ファイルでは不変)
    grouper  → FindingGroup (本ファイル)
    Excel    → FindingGroup を読んで親子行を描画

group_key 戦略(K4: TC 固有の動的戦略):
    - Pattern A (単方向エラー): sub_code|area|account|current|suggested
        同じ誤り税区分の仕訳を 1 親行に束ねる。TC-01/03/04/05/07 等。
    - Pattern B (混在検知): sub_code|area|account
        同一科目に複数の税区分が混在している異常を 1 親行で示す。TC-06。
    - 将来 TC 追加時は GROUP_KEY_STRATEGIES に 1 行追加するだけで拡張可能。
      登録漏れは CI テスト(test_all_known_tcs_have_group_key_strategy)が検出。

severity 代表値:
    親行は子 Finding 中で最強の severity を採用(SEVERITY_ORDER を参照)。
    未知の severity 値は rank=0 にフォールバックし、落とさない。

配置: skills/_common/lib/finding_grouper.py
出典: docs/phase8_prestudy.md §6.2 K4 + §6.3 E1
"""
from __future__ import annotations

from typing import Callable, Sequence

from skills._common.lib.schema import FindingGroup, FindingLike


# ═══════════════════════════════════════════════════════════════
# Section A: severity 順序
# ═══════════════════════════════════════════════════════════════

SEVERITY_ORDER: dict[str, int] = {
    "🔴 Critical": 4,
    "🔴 High":     4,  # 既存 Finding は "🔴 High" を使う。Critical は同ランク
    "🟠 Warning":  3,
    "🟡 Medium":   2,
    "🟢 Low":      1,
}
"""severity 文字列 → 序列値の対応表。大きいほど強い。

既存 Finding は "🔴 High" / "🟡 Medium" / "🟠 Warning" / "🟢 Low" を使う
(check-tax-classification/schema.py の Severity Literal 参照)。
戦略 Claude の指示により "🔴 Critical" も同じ rank=4 で受け入れる。
未知値は _severity_rank() が 0 にフォールバック。
"""


def _severity_rank(value: str) -> int:
    """severity 文字列を序列値に変換する。未知値は 0 にフォールバック。"""
    return SEVERITY_ORDER.get(value, 0)


# ═══════════════════════════════════════════════════════════════
# Section B: Finding 属性アクセサ
# ═══════════════════════════════════════════════════════════════

def _account_of(f: FindingLike) -> str:
    """Finding から勘定科目名を取り出す。

    Finding 本体には `account` フィールドが存在せず、link_hints.account_name を
    経由する設計(check-tax-classification/schema.py §2.3)。link_hints が None
    または account_name が未設定の場合は空文字列を返す(グループキー衝突を
    避けるため、例外は投げない)。

    本ヘルパー経由で全 strategy が勘定科目を参照することで、将来 Finding の
    構造が変わった場合も本関数 1 箇所の修正で吸収できる。
    """
    link_hints = getattr(f, "link_hints", None)
    if link_hints is None:
        return ""
    return getattr(link_hints, "account_name", "") or ""


# ═══════════════════════════════════════════════════════════════
# Section C: group_key 戦略(K4)
# ═══════════════════════════════════════════════════════════════

GroupKeyFn = Callable[[FindingLike], str]


def _pattern_a(f: FindingLike) -> str:
    """Pattern A: 単方向エラー。誤り税区分(current→suggested)まで一致で束ねる。

    例: TC-03a 給与手当に課対仕入10% を当てている誤りを、
        同じ科目・同じ誤り税区分の仕訳群として 1 親行に集約する。
    """
    return (
        f"{f.sub_code}|{f.area}|{_account_of(f)}"
        f"|{f.current_value}|{f.suggested_value}"
    )


def _pattern_b(f: FindingLike) -> str:
    """Pattern B: 混在検知。同一科目に複数税区分が存在する異常を 1 行に束ねる。

    current_value / suggested_value をキーに含めないため、
    同一科目・同一 sub_code の仕訳はすべて同じ group_key になる。
    子行で税区分の差を表示する想定(Excel 層の役割)。
    """
    return f"{f.sub_code}|{f.area}|{_account_of(f)}"


GROUP_KEY_STRATEGIES: dict[str, GroupKeyFn] = {
    # TC-01 売上関連(単方向エラー)
    "TC-01a": _pattern_a,
    "TC-01b": _pattern_a,
    "TC-01c": _pattern_a,
    "TC-01d": _pattern_a,
    "TC-01e": _pattern_a,
    # TC-02 土地賃料
    "TC-02a": _pattern_a,
    "TC-02b": _pattern_a,
    "TC-02c": _pattern_a,
    "TC-02d": _pattern_a,
    "TC-02e": _pattern_a,
    "TC-02f": _pattern_a,
    # TC-03 給与
    "TC-03a": _pattern_a,
    "TC-03b": _pattern_a,
    "TC-03c": _pattern_a,
    # TC-04 非課税売上
    "TC-04a": _pattern_a,
    "TC-04b": _pattern_a,
    "TC-04c": _pattern_a,
    "TC-04d": _pattern_a,
    "TC-04e": _pattern_a,
    "TC-04f": _pattern_a,
    # TC-05 非課税仕入
    "TC-05a": _pattern_a,
    "TC-05b": _pattern_a,
    "TC-05c": _pattern_a,
    "TC-05d": _pattern_a,
    "TC-05e": _pattern_a,
    # TC-06 租税公課(混在検知: Pattern B)
    "TC-06a": _pattern_b,
    "TC-06b": _pattern_b,
    "TC-06c": _pattern_b,
    "TC-06d": _pattern_b,
    "TC-06e": _pattern_b,
    # TC-07 福利厚生
    "TC-07a": _pattern_a,
    "TC-07b": _pattern_a,
    "TC-07c": _pattern_a,
    "TC-07d": _pattern_a,
    "TC-07e": _pattern_a,
    "TC-07f": _pattern_a,
}
"""sub_code → group_key 生成関数の辞書。

新 TC / 新 sub_code を追加するときは、対応するエントリを必ずここに追加すること。
登録漏れは tests/unit/test_finding_grouper.py::test_all_known_tcs_have_group_key_strategy
が検出する。
"""


# ═══════════════════════════════════════════════════════════════
# Section D: group() 本体
# ═══════════════════════════════════════════════════════════════

def _make_group_key(f: FindingLike) -> str:
    """Finding から group_key を生成する。戦略未登録は例外を投げず、
    sub_code 単独をキーにしてフォールバック(データを落とさない防御層)。

    ※ 未登録を許容しつつ CI テストで静的に検知する二段構え。
    """
    strategy = GROUP_KEY_STRATEGIES.get(f.sub_code)
    if strategy is None:
        return f"{f.sub_code}|{f.area}|{_account_of(f)}"
    return strategy(f)


def _sum_amount(findings: Sequence[FindingLike], field: str) -> int:
    """debit_amount / credit_amount の合計。None は 0 扱い。"""
    total = 0
    for f in findings:
        v = getattr(f, field, None)
        if v is not None:
            total += int(v)
    return total


def is_mixing_pattern(group_or_subcode) -> bool:
    """指定 FindingGroup(または sub_code 文字列)が Pattern B(混在検知)かを判定する。

    Phase 8-B の Excel 層は、親行の D/E 列文言を生成する際にパターン種別を
    参照する(単方向エラー vs 混在検知で文言が異なる)。その唯一の判定窓口。

    Args:
        group_or_subcode: FindingGroup か sub_code 文字列(例: "TC-06a")

    Returns:
        Pattern B(混在検知)なら True、Pattern A または未登録なら False。
    """
    sub_code = (
        group_or_subcode.sub_code
        if hasattr(group_or_subcode, "sub_code")
        else group_or_subcode
    )
    return GROUP_KEY_STRATEGIES.get(sub_code) is _pattern_b


def group(findings: Sequence[FindingLike]) -> list[FindingGroup]:
    """Finding のリストを FindingGroup のリストに集約する。

    動作:
        1. 各 Finding に GROUP_KEY_STRATEGIES で group_key を付与
        2. 同じ group_key を持つ Finding を束ねる(挿入順を保持 = 決定的)
        3. 親行代表値を算出:
            - tc_code / sub_code / area: 子の共通値(同じキーなら自動的に一致)
            - severity: max(SEVERITY_ORDER) で代表を決定
            - count / total_debit / total_credit: 子から集計
        4. 出現順(最初の子が現れた順)で FindingGroup のリストを返す

    Args:
        findings: checker が返した Finding のシーケンス(不変)

    Returns:
        FindingGroup のリスト。元 findings の挿入順序に依存するが、
        同じ入力に対しては常に同じ順序を返す(P12 決定的動作)。
    """
    buckets: dict[str, list[FindingLike]] = {}
    order: list[str] = []

    for f in findings:
        key = _make_group_key(f)
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(f)

    groups: list[FindingGroup] = []
    for key in order:
        members = buckets[key]
        representative = max(members, key=lambda f: _severity_rank(f.severity))
        groups.append(
            FindingGroup(
                group_key=key,
                tc_code=members[0].tc_code,
                sub_code=members[0].sub_code,
                area=members[0].area,
                severity=representative.severity,
                count=len(members),
                total_debit=_sum_amount(members, "debit_amount"),
                total_credit=_sum_amount(members, "credit_amount"),
                findings=tuple(members),
            )
        )

    return groups


__all__ = [
    "SEVERITY_ORDER",
    "GROUP_KEY_STRATEGIES",
    "GroupKeyFn",
    "group",
]
