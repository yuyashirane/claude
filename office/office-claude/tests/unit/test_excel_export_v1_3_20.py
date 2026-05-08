"""V1-3-20 (TC-INV カテゴリ) の Excel 出力テスト.

E5-4 Phase 1b-ii で新設。Phase 1b-i で配線した:
    build_output → _group_v1_3_20_findings → adapt_invoice_groups
    → _fill_detail_sheet_with_groups → _write_parent_row / _write_child_row
の経路をカバーする。

テスト分類:
    - 単体: _group_v1_3_20_findings を直接呼ぶ (5 件)
    - 結合: build_output を呼んで A14 シートを openpyxl で読み戻す (3 件)

Phase 2 / 3 未実装 (子行 partner / format_invoice_memo 反映、親行 V1-3-20
対応) に依存するアサートは含めない。Phase 2 / 3 完了後に拡張可能。
"""
from __future__ import annotations

import pytest
from openpyxl import load_workbook

from skills._common.schema import Finding
from skills.export.excel_report.template_engine import (
    _group_v1_3_20_findings,
    build_output,
)


@pytest.fixture
def v1_3_20_finding_factory():
    """V1-3-20 Finding を最小限の引数で作るファクトリ.

    classification と debit_amount だけ指定すれば残りはデフォルト。
    sub_code 等を変えたい場合は overrides で渡す。
    """
    def _make(classification, debit_amount=1000, **overrides):
        defaults = dict(
            tc_code="V1-3-20",
            sub_code="01",
            area="A14",
            sort_priority=30,
            severity="🟠 High",
            error_type="invoice_warning",
            review_level="🟠 重点確認",
            message="test message",
            classification=classification,
            debit_amount=debit_amount,
            credit_amount=0,
        )
        defaults.update(overrides)
        return Finding(**defaults)
    return _make


# ═══════════════════════════════════════════════════════════════
# 単体テスト: _group_v1_3_20_findings
# ═══════════════════════════════════════════════════════════════

class TestGroupV1320Findings:
    """_group_v1_3_20_findings の単体テスト."""

    def test_empty_input_returns_empty_list(self):
        """空入力なら空リストを返す."""
        result = _group_v1_3_20_findings([])
        assert result == []

    def test_single_classification_returns_one_group(self, v1_3_20_finding_factory):
        """同じ classification の Finding 3 件は 1 グループになる."""
        findings = [
            v1_3_20_finding_factory("qualified_but_transitional_tax", debit_amount=100),
            v1_3_20_finding_factory("qualified_but_transitional_tax", debit_amount=200),
            v1_3_20_finding_factory("qualified_but_transitional_tax", debit_amount=300),
        ]
        result = _group_v1_3_20_findings(findings)
        assert len(result) == 1
        assert result[0].count == 3
        assert result[0].total_debit == 600
        assert result[0].group_key == "V1-3-20|01|A14"
        assert len(result[0].findings) == 3

    def test_three_classifications_returns_three_groups(self, v1_3_20_finding_factory):
        """3 種類の classification の Finding は 3 グループになる.

        Phase 1b-i のスモーク確認 (python -c) と同じセットアップを
        pytest テストに昇格させたケース。
        """
        f1 = v1_3_20_finding_factory(
            "qualified_but_transitional_tax", debit_amount=1000
        )
        f2 = v1_3_20_finding_factory(
            "nonqualified_but_full_deduction_tax", debit_amount=2000, sub_code="02"
        )
        f3 = v1_3_20_finding_factory(
            "partner_unknown", debit_amount=3000, sub_code="03"
        )
        result = _group_v1_3_20_findings([f1, f2, f3])
        assert len(result) == 3
        assert result[0].group_key == "V1-3-20|01|A14"
        assert result[0].count == 1
        assert result[0].total_debit == 1000
        assert result[1].count == 1
        assert result[1].total_debit == 2000
        assert result[2].count == 1
        assert result[2].total_debit == 3000

    def test_classification_order_is_preserved(self, v1_3_20_finding_factory):
        """classification の出現順がグループ順に反映される."""
        f1 = v1_3_20_finding_factory("partner_unknown", sub_code="03")
        f2 = v1_3_20_finding_factory("qualified_but_transitional_tax", sub_code="01")
        result = _group_v1_3_20_findings([f1, f2])
        assert len(result) == 2
        assert result[0].sub_code == "03"
        assert result[1].sub_code == "01"

    def test_classification_none_falls_back_to_unknown(self, v1_3_20_finding_factory):
        """classification が None の Finding は "_unknown" グループに入る."""
        f = v1_3_20_finding_factory(None)
        result = _group_v1_3_20_findings([f])
        assert len(result) == 1
        assert result[0].count == 1


# ═══════════════════════════════════════════════════════════════
# 結合テスト: build_output 経由で A14 シート出力
# ═══════════════════════════════════════════════════════════════

class TestBuildOutputV1320:
    """build_output 経由で A14 シートに V1-3-20 Finding が出力されることを検証."""

    def test_v1_3_20_findings_produce_a14_sheet(
        self, v1_3_20_finding_factory, tmp_path
    ):
        """V1-3-20 Finding を渡すと A14 シートに行が書き込まれる."""
        findings = [
            v1_3_20_finding_factory("qualified_but_transitional_tax"),
            v1_3_20_finding_factory(
                "nonqualified_but_full_deduction_tax", sub_code="02"
            ),
        ]
        output_path = tmp_path / "test_v1_3_20.xlsx"
        build_output(findings, output_path)

        wb = load_workbook(output_path)
        a14_sheet_name = next(
            (s for s in wb.sheetnames if s.startswith("A14")),
            None,
        )
        assert a14_sheet_name is not None, (
            f"A14 シートが見つからない: {wb.sheetnames}"
        )

        ws = wb[a14_sheet_name]
        # row 1-3 はヘッダ、row 4 から実データ。最低限 row 4 にデータが
        # 書き込まれていることを確認 (親行に severity ラベル等が入る)。
        row4_has_value = any(
            ws.cell(row=4, column=c).value is not None for c in range(1, 24)
        )
        assert row4_has_value, "A14 シートの row 4 に何も書き込まれていない"

    def test_no_v1_3_20_findings_no_a14_sheet(self, tmp_path):
        """V1-3-20 Finding がない場合、A14 シートは出力されない (削除される).

        build_output は area_findings に含まれない area のシートを
        wb.remove する仕様。
        """
        output_path = tmp_path / "test_empty.xlsx"
        build_output([], output_path)

        wb = load_workbook(output_path)
        a14_sheets = [s for s in wb.sheetnames if s.startswith("A14")]
        assert len(a14_sheets) == 0, (
            f"A14 シートが想定外に残っている: {a14_sheets}"
        )

    def test_a14_parent_row_contains_classification_grouping(
        self, v1_3_20_finding_factory, tmp_path
    ):
        """A14 シートに classification 単位のグルーピングが反映されている.

        2 種類の classification を持つ Finding (3 件) を渡すと、A14 シート
        に親行 2 つ + 子行 3 つ = 計 5 行のデータが書かれることを確認する。
        """
        findings = [
            v1_3_20_finding_factory(
                "qualified_but_transitional_tax", debit_amount=500
            ),
            v1_3_20_finding_factory(
                "qualified_but_transitional_tax", debit_amount=500
            ),
            v1_3_20_finding_factory(
                "nonqualified_but_full_deduction_tax",
                debit_amount=2000,
                sub_code="02",
            ),
        ]
        output_path = tmp_path / "test_grouping.xlsx"
        build_output(findings, output_path)

        wb = load_workbook(output_path)
        a14_sheet_name = next(s for s in wb.sheetnames if s.startswith("A14"))
        ws = wb[a14_sheet_name]

        last_row = ws.max_row
        non_empty_rows = sum(
            1 for r in range(4, last_row + 1)
            if any(ws.cell(row=r, column=c).value is not None for c in range(1, 24))
        )
        # 親 2 + 子 3 = 5 行が理想。テンプレ残置等の影響を考慮し最低 5 行を確認。
        assert non_empty_rows >= 5, (
            f"想定行数以上のデータが書かれていない: {non_empty_rows}"
        )
