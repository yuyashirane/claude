"""V1-3-20 独自 FindingGroup → 共通 FindingGroup の変換アダプタ.

E5-4 Phase 1a で新設。V1-3-20 が共通の親子行表示経路
(_fill_detail_sheet_grouped → _write_parent_row / _write_child_row) に
乗れるよう、独自 FindingGroup (3 フィールド) を共通 FindingGroup (8
フィールド) に変換する。

設計判断:
    - 空グループ (findings_count == 0) はスキップ (β-1)
    - severity はグループ内 max (共通 SEVERITY_ORDER を流用)
    - tc_code / sub_code / area は findings[0] から取得 (グループ内一意)
    - group_key は "{tc_code}|{sub_code}|{area}" 形式
    - total_debit / total_credit は debit_amount / credit_amount を sum
      (Phase 0 で直接属性化済み)

将来 (β3) の方向性:
    - 共通 grouper の GROUP_KEY_STRATEGIES に V1-3-20 戦略を直接登録する
      方向に統合し、このアダプタを廃止する余地がある。
"""
from __future__ import annotations

from typing import Sequence

from skills._common.lib.finding_grouper import SEVERITY_ORDER
from skills._common.lib.schema import FindingGroup


def adapt_invoice_groups(invoice_groups: Sequence) -> list[FindingGroup]:
    """V1-3-20 独自 FindingGroup のシーケンスを共通 FindingGroup の list に変換する.

    空グループ (findings_count == 0) はスキップ。

    Args:
        invoice_groups: V1-3-20 run.py の find_groups() が返すシーケンス
            (要素は V1-3-20 schema.py の FindingGroup)。

    Returns:
        共通 FindingGroup の list。該当ありの分類のみ含む (β-1)。
    """
    result: list[FindingGroup] = []
    for ig in invoice_groups:
        if ig.findings_count == 0:
            continue
        findings = ig.findings
        if not findings:
            continue
        first = findings[0]
        tc_code = first.tc_code
        sub_code = first.sub_code
        area = first.area
        result.append(
            FindingGroup(
                group_key=f"{tc_code}|{sub_code}|{area}",
                tc_code=tc_code,
                sub_code=sub_code,
                severity=_max_severity(findings),
                area=area,
                count=len(findings),
                total_debit=_sum_field(findings, "debit_amount"),
                total_credit=_sum_field(findings, "credit_amount"),
                findings=tuple(findings),
            )
        )
    return result


def _sum_field(findings: Sequence, field: str) -> int:
    """findings の特定属性 (debit_amount / credit_amount) を sum する.

    None は 0 扱い。共通 grouper の _sum_amount と同じ意味論。
    """
    total = 0
    for f in findings:
        v = getattr(f, field, None)
        if v is not None:
            total += int(v)
    return total


def _max_severity(findings: Sequence) -> str:
    """findings の severity の max を返す.

    共通 SEVERITY_ORDER を流用 (未知値は rank=0)。
    """
    return max(
        (f.severity for f in findings),
        key=lambda s: SEVERITY_ORDER.get(s, 0),
    )


__all__ = ["adapt_invoice_groups"]
