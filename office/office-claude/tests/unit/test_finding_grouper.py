"""Phase 8-A finding_grouper のユニットテスト。

合計 18 件(Section A-F)。
    A  基本挙動 (4)
    B  Pattern A (単方向) の集約 (3)
    C  Pattern B (混在検知) の集約 (3)
    D  severity 代表値の選出 (3)
    E  金額集計 (3)
    F  CI: strategy 登録網羅 + 未登録フォールバック (2)

配置: tests/unit/test_finding_grouper.py
出典: docs/phase8_prestudy.md §7 Phase 8-A
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from skills._common.lib.finding_grouper import (
    GROUP_KEY_STRATEGIES,
    SEVERITY_ORDER,
    _severity_rank,
    group,
)
from skills._common.lib.schema import FindingGroup


# ─────────────────────────────────────────────────────────────
# ヘルパー: Finding ダミーを最小コストで作る
# ─────────────────────────────────────────────────────────────

def _make_link_hints(account_name: str = ""):
    return SimpleNamespace(account_name=account_name)


def _make_finding(
    *,
    tc_code: str = "TC-03",
    sub_code: str = "TC-03a",
    severity: str = "🔴 High",
    area: str = "A10",
    current_value: str = "課対仕入10%",
    suggested_value: str = "対象外",
    debit_amount: int | None = 100000,
    credit_amount: int | None = None,
    account: str = "給与手当",
):
    """Finding の属性だけを持つ軽量ダミー。FindingLike Protocol を満たす。

    本物の Finding dataclass を使うと ctx/row の準備が重くなるため、
    grouper が参照する属性のみを持つ SimpleNamespace で代替する。
    """
    return SimpleNamespace(
        tc_code=tc_code,
        sub_code=sub_code,
        severity=severity,
        area=area,
        current_value=current_value,
        suggested_value=suggested_value,
        debit_amount=debit_amount,
        credit_amount=credit_amount,
        link_hints=_make_link_hints(account),
    )


# ═════════════════════════════════════════════════════════════
# Section A: 基本挙動 (4 件)
# ═════════════════════════════════════════════════════════════

class TestBasic:

    def test_empty_input_returns_empty_list(self):
        assert group([]) == []

    def test_single_finding_yields_single_group(self):
        f = _make_finding()
        groups = group([f])
        assert len(groups) == 1
        assert isinstance(groups[0], FindingGroup)
        assert groups[0].count == 1
        assert groups[0].findings == (f,)

    def test_group_preserves_core_fields(self):
        f = _make_finding(sub_code="TC-03a", area="A10")
        g = group([f])[0]
        assert g.tc_code == "TC-03"
        assert g.sub_code == "TC-03a"
        assert g.area == "A10"

    def test_output_order_deterministic(self):
        """同じ入力に対して常に同じ順序を返す(P12)。"""
        a = _make_finding(sub_code="TC-03a", account="給与手当")
        b = _make_finding(sub_code="TC-01a", account="売上", current_value="対象外",
                          suggested_value="課税売上10%")
        first = [g.sub_code for g in group([a, b])]
        second = [g.sub_code for g in group([a, b])]
        assert first == second == ["TC-03a", "TC-01a"]


# ═════════════════════════════════════════════════════════════
# Section B: Pattern A (単方向エラー) の集約 (3 件)
# ═════════════════════════════════════════════════════════════

class TestPatternA:

    def test_same_account_same_error_merges(self):
        """同じ科目・同じ誤り税区分の Finding は 1 グループに束ねられる。"""
        f1 = _make_finding(account="給与手当")
        f2 = _make_finding(account="給与手当")
        groups = group([f1, f2])
        assert len(groups) == 1
        assert groups[0].count == 2

    def test_different_account_creates_separate_groups(self):
        """科目が違えば別グループ。"""
        f1 = _make_finding(account="給与手当")
        f2 = _make_finding(account="賞与")
        groups = group([f1, f2])
        assert len(groups) == 2

    def test_different_suggested_value_creates_separate_groups(self):
        """同じ科目でも suggested_value が違えば別グループ(Pattern A の特徴)。"""
        f1 = _make_finding(account="給与手当", suggested_value="対象外")
        f2 = _make_finding(account="給与手当", suggested_value="非課仕入")
        groups = group([f1, f2])
        assert len(groups) == 2


# ═════════════════════════════════════════════════════════════
# Section C: Pattern B (混在検知 / TC-06) の集約 (3 件)
# ═════════════════════════════════════════════════════════════

class TestPatternB:

    def test_tc06_mixed_tax_labels_merge_to_one_group(self):
        """TC-06 同一科目・異なる current_value でも 1 グループに束ねられる。"""
        f1 = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12",
            account="租税公課", current_value="課対仕入10%",
        )
        f2 = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12",
            account="租税公課", current_value="非課仕入",
        )
        f3 = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12",
            account="租税公課", current_value="対象外",
        )
        groups = group([f1, f2, f3])
        assert len(groups) == 1
        assert groups[0].count == 3

    def test_tc06_different_subcode_creates_separate_groups(self):
        """TC-06 でも sub_code が違えば別グループ(Pattern B 内の境界)。"""
        f_a = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12", account="租税公課",
        )
        f_b = _make_finding(
            tc_code="TC-06", sub_code="TC-06b", area="A12", account="法人税等",
        )
        groups = group([f_a, f_b])
        assert len(groups) == 2

    def test_tc06_different_account_creates_separate_groups(self):
        """TC-06 でも科目が違えば別グループ。"""
        f1 = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12", account="租税公課",
        )
        f2 = _make_finding(
            tc_code="TC-06", sub_code="TC-06a", area="A12", account="印紙税",
        )
        groups = group([f1, f2])
        assert len(groups) == 2


# ═════════════════════════════════════════════════════════════
# Section D: severity 代表値 (3 件)
# ═════════════════════════════════════════════════════════════

class TestSeverityRepresentative:

    def test_max_severity_wins(self):
        """子の最強 severity が親代表になる。"""
        f_low = _make_finding(severity="🟢 Low")
        f_high = _make_finding(severity="🔴 High")
        groups = group([f_low, f_high])
        assert groups[0].severity == "🔴 High"

    def test_severity_order_ranks(self):
        """SEVERITY_ORDER の序列: High/Critical=4 > Warning=3 > Medium=2 > Low=1。"""
        assert _severity_rank("🔴 Critical") == 4
        assert _severity_rank("🔴 High") == 4
        assert _severity_rank("🟠 Warning") == 3
        assert _severity_rank("🟡 Medium") == 2
        assert _severity_rank("🟢 Low") == 1

    def test_unknown_severity_fallbacks_to_zero(self):
        """未知値は rank=0。Finding は落とさず、他の既知値に代表を譲る。"""
        assert _severity_rank("🌈 Unknown") == 0
        f_unknown = _make_finding(severity="🌈 Unknown", account="A")
        f_low = _make_finding(severity="🟢 Low", account="A")
        groups = group([f_unknown, f_low])
        assert len(groups) == 1
        assert groups[0].severity == "🟢 Low"


# ═════════════════════════════════════════════════════════════
# Section E: 金額集計 (3 件)
# ═════════════════════════════════════════════════════════════

class TestAmountAggregation:

    def test_sums_debit_amounts(self):
        f1 = _make_finding(debit_amount=100000, credit_amount=None)
        f2 = _make_finding(debit_amount=50000, credit_amount=None)
        g = group([f1, f2])[0]
        assert g.total_debit == 150000
        assert g.total_credit == 0

    def test_sums_credit_amounts(self):
        f1 = _make_finding(debit_amount=None, credit_amount=200000)
        f2 = _make_finding(debit_amount=None, credit_amount=100000)
        g = group([f1, f2])[0]
        assert g.total_credit == 300000
        assert g.total_debit == 0

    def test_none_amounts_treated_as_zero(self):
        f = _make_finding(debit_amount=None, credit_amount=None)
        g = group([f])[0]
        assert g.total_debit == 0
        assert g.total_credit == 0


# ═════════════════════════════════════════════════════════════
# Section F: CI・フォールバック (2 件)
# ═════════════════════════════════════════════════════════════

class TestStrategyRegistration:
    """CI ガード: GROUP_KEY_STRATEGIES の網羅性と未登録フォールバック。"""

    def test_all_known_tcs_have_group_key_strategy(self):
        """既存 checks/tc*.py に現れる全 sub_code が戦略辞書に登録されている。

        本テストは checker 側が新 sub_code を追加したのに grouper 側の
        GROUP_KEY_STRATEGIES を更新し忘れる事故を静的に検出するためのもの。
        """
        import re
        from pathlib import Path

        checks_dir = (
            Path(__file__).parent.parent.parent
            / "skills" / "verify" / "V1-3-rule"
            / "check-tax-classification" / "checks"
        )
        pattern = re.compile(r'sub_code="(TC-0[1-8][a-g])"')

        used_sub_codes = set()
        for py in checks_dir.glob("tc*.py"):
            text = py.read_text(encoding="utf-8")
            used_sub_codes.update(pattern.findall(text))

        assert used_sub_codes, "sub_code が1つも検出できなかった(抽出ロジック破損の可能性)"

        missing = used_sub_codes - GROUP_KEY_STRATEGIES.keys()
        assert not missing, (
            f"GROUP_KEY_STRATEGIES に未登録の sub_code がある: {sorted(missing)}。"
            " finding_grouper.py の GROUP_KEY_STRATEGIES に追加してください。"
        )

    def test_unregistered_subcode_falls_back_without_raising(self):
        """未登録 sub_code でも例外を投げず、FindingGroup を返す(防御層)。"""
        f = _make_finding(sub_code="TC-99z")  # 存在しないコード
        groups = group([f])
        assert len(groups) == 1
        assert groups[0].sub_code == "TC-99z"
        assert groups[0].count == 1
