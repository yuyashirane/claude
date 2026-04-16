"""Phase 6 Excel 出力テスト (22件)。

構造テスト(スナップショット不使用)。
生成された .xlsx を openpyxl で再オープンしてピンポイント検証。

テスト分類:
    A. シート構造    5件
    B. 列構成        4件
    C. データ配置    5件
    D. ソート        3件
    E. 視覚装飾      4件
    F. エッジケース  3件 (+ 追加 1件)
合計: 25件

実際の Finding スキーマ(schema.py v0.2) に準拠:
    - area: str (Finding.area)
    - tc_code: str (e.g. "TC-07")
    - sub_code: str (e.g. "TC-07a")
    - severity: "🔴 High" / "🟡 Medium" / "🟠 Warning" / "🟢 Low"
    - sort_priority: 1〜99
    - show_by_default: bool
"""
import sys
from datetime import date
from pathlib import Path

import pytest
from openpyxl import load_workbook

# ─────────────────────────────────────────────────────────────────────
# Finding ビルダー
# ─────────────────────────────────────────────────────────────────────

def _make_finding(
    sub_code: str = "TC-07a",
    area: str = "A10",
    severity: str = "🔴 High",
    show_by_default: bool = True,
    sort_priority: int = 12,
    error_type: str = "direct_error",
    review_level: str = "🔴必修",
    current_value: str = "課対仕入10%",
    suggested_value: str = "対象外",
    confidence: int = 80,
    message: str = "テストメッセージ:慶弔見舞金が課税仕入になっています。",
    wallet_txn_id: str = "test-txn-001",
    link_hints=None,
):
    """テスト用 Finding ビルダー(既存コードに影響しない独立ヘルパー)。

    実際の schema.py の Finding 定義に完全準拠。
    tc_code は sub_code[:5] から自動導出(TC-07a → TC-07)。
    """
    import importlib.util
    if "schema" not in sys.modules:
        _root = Path(__file__).parent.parent.parent
        _schema_path = (
            _root / "skills" / "verify" / "V1-3-rule"
            / "check-tax-classification" / "schema.py"
        )
        spec = importlib.util.spec_from_file_location("schema", _schema_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["schema"] = mod
        spec.loader.exec_module(mod)

    schema = sys.modules["schema"]

    # tc_code は sub_code の最初の5文字("TC-07a" → "TC-07")
    tc_code = sub_code[:5]

    return schema.Finding(
        tc_code=tc_code,
        sub_code=sub_code,
        severity=severity,
        error_type=error_type,
        review_level=review_level,
        area=area,
        sort_priority=sort_priority,
        wallet_txn_id=wallet_txn_id,
        current_value=current_value,
        suggested_value=suggested_value,
        confidence=confidence,
        message=message,
        show_by_default=show_by_default,
        link_hints=link_hints,
    )


def _make_finding_with_hints(sub_code="TC-07a", area="A10", **kwargs):
    """link_hints 付き Finding。取引日・勘定科目の列テスト用。"""
    import importlib.util
    if "schema" not in sys.modules:
        _root = Path(__file__).parent.parent.parent
        _schema_path = (
            _root / "skills" / "verify" / "V1-3-rule"
            / "check-tax-classification" / "schema.py"
        )
        spec = importlib.util.spec_from_file_location("schema", _schema_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["schema"] = mod
        spec.loader.exec_module(mod)

    schema = sys.modules["schema"]
    lh = schema.LinkHints(
        target="general_ledger",
        account_name="福利厚生費",
        period_start=date(2026, 2, 1),
        period_end=date(2026, 2, 28),
    )
    return _make_finding(sub_code=sub_code, area=area, link_hints=lh, **kwargs)


# ─────────────────────────────────────────────────────────────────────
# A. シート構造(5件)
# ─────────────────────────────────────────────────────────────────────

def test_summary_sheet_exists(tmp_path):
    """空 findings でもサマリーシートが生成される。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    assert "サマリー" in wb.sheetnames


def test_area_sheet_created_when_findings_exist(tmp_path):
    """TC-02 の Finding があれば A4 シートが生成される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-02c", area="A4", sort_priority=8)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    assert "A4 家賃・地代" in wb.sheetnames


def test_area_sheet_not_created_when_no_findings(tmp_path):
    """TC-02 のみの場合、TC-03 用の A5 シートは生成されない。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-02c", area="A4", sort_priority=8)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    assert "A5 人件費" not in wb.sheetnames


def test_multi_area_multi_sheet(tmp_path):
    """複数 area の Finding があれば複数シートが生成される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-02c", area="A4", sort_priority=8),
        _make_finding(sub_code="TC-07a", area="A10", sort_priority=12),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    assert "A4 家賃・地代" in wb.sheetnames
    assert "A10 その他経費" in wb.sheetnames


def test_empty_findings_only_summary(tmp_path):
    """空 findings 時はサマリーシートのみ。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    assert wb.sheetnames == ["サマリー"]


# ─────────────────────────────────────────────────────────────────────
# B. 列構成(4件)
# ─────────────────────────────────────────────────────────────────────

def test_detail_sheet_has_19_columns(tmp_path):
    """詳細シートのヘッダー行に非空セルが 19 個ある。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    header_cells = [c for c in ws[1] if c.value is not None]
    assert len(header_cells) == 19


def test_summary_sheet_has_10_columns(tmp_path):
    """サマリーシートのヘッダー行に非空セルが 10 個ある。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    header_cells = [c for c in ws[1] if c.value is not None]
    assert len(header_cells) == 10


def test_detail_sheet_header_values(tmp_path):
    """詳細シートの主要ヘッダー文字列を検証。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(1, 1).value == "優先度"
    assert ws.cell(1, 2).value == "TC"
    assert ws.cell(1, 17).value == "確認状況"


def test_column_widths_set(tmp_path):
    """詳細シートの列幅が仕様通りに設定される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.column_dimensions["A"].width == 8   # 優先度
    assert ws.column_dimensions["D"].width == 50  # チェック結果


# ─────────────────────────────────────────────────────────────────────
# C. データ配置(5件)
# ─────────────────────────────────────────────────────────────────────

def test_tc02_finding_placed_in_a4_sheet(tmp_path):
    """TC-02c の Finding が A4 シートの 2 行目 TC 列に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-02c", area="A4", sort_priority=8)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A4 家賃・地代"]
    assert ws.cell(2, 2).value == "TC-02c"


def test_tc07_finding_placed_in_a10_sheet(tmp_path):
    """TC-07f の Finding が A10 シートに配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07f", area="A10", show_by_default=False,
                               sort_priority=28)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 2).value == "TC-07f"


def test_current_and_suggested_value_placed(tmp_path):
    """現在の税区分・推奨税区分が正しい列に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(
        sub_code="TC-07a", area="A10",
        current_value="課対仕入10%", suggested_value="対象外",
    )]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 11).value == "課対仕入10%"
    assert ws.cell(2, 12).value == "対象外"


def test_wallet_txn_id_placed(tmp_path):
    """walletTxnId が列 19 に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10", wallet_txn_id="txn-xyz-999")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 19).value == "txn-xyz-999"


def test_link_hints_account_name_in_column6(tmp_path):
    """link_hints.account_name が列 6(勘定科目)に反映される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding_with_hints(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 6).value == "福利厚生費"


# ─────────────────────────────────────────────────────────────────────
# D. ソート(3件)
# ─────────────────────────────────────────────────────────────────────

def test_rows_sorted_by_sort_priority(tmp_path):
    """同一 area 内で sort_priority 昇順にソートされる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-02f", area="A4", sort_priority=18),
        _make_finding(sub_code="TC-02a", area="A4", sort_priority=6),
        _make_finding(sub_code="TC-02c", area="A4", sort_priority=8),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A4 家賃・地代"]
    assert ws.cell(2, 2).value == "TC-02a"
    assert ws.cell(3, 2).value == "TC-02c"
    assert ws.cell(4, 2).value == "TC-02f"


def test_sort_priority_from_map_when_zero(tmp_path):
    """Finding.sort_priority が 0 の場合、SORT_PRIORITY_MAP から解決される。"""
    from skills.export.excel_report.exporter import export_to_excel
    # TC-07a は MAP で 12、TC-07b は MAP で 13 → TC-07a が先
    f_b = _make_finding(sub_code="TC-07b", area="A10", sort_priority=0)
    f_a = _make_finding(sub_code="TC-07a", area="A10", sort_priority=0)
    output = tmp_path / "out.xlsx"
    export_to_excel([f_b, f_a], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 2).value == "TC-07a"
    assert ws.cell(3, 2).value == "TC-07b"


def test_summary_sheet_sorted_by_area_order(tmp_path):
    """サマリーシートは area 順(A4→A10)にソートされる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", sort_priority=12),
        _make_finding(sub_code="TC-02c", area="A4", sort_priority=8),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    # 2行目が A4, 3行目が A10
    assert ws.cell(2, 1).value == "A4"
    assert ws.cell(3, 1).value == "A10"


# ─────────────────────────────────────────────────────────────────────
# E. 視覚装飾(4件)
# ─────────────────────────────────────────────────────────────────────

def test_high_severity_row_has_red_fill(tmp_path):
    """🔴 High の行が薄赤(FFEBEE)で塗られる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10", severity="🔴 High")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    cell = ws.cell(2, 1)
    rgb = str(cell.fill.start_color.rgb).upper()
    assert "FFEBEE" in rgb


def test_show_by_default_false_row_hidden(tmp_path):
    """show_by_default=False の行が非表示(row_hidden)になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", show_by_default=True,
                       sort_priority=12),
        _make_finding(sub_code="TC-07f", area="A10", show_by_default=False,
                       sort_priority=28),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    # 2行目(TC-07a, show=True): 非表示でない
    assert ws.row_dimensions[2].hidden is False
    # 3行目(TC-07f, show=False): 非表示
    assert ws.row_dimensions[3].hidden is True


def test_header_row_frozen(tmp_path):
    """詳細シートのヘッダー行が A2 で固定される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.freeze_panes == "A2"


def test_confirmation_column_has_dropdown(tmp_path):
    """列 Q(17列目)に確認状況プルダウンが設定される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    has_dv = any(
        "Q" in str(dv.sqref)
        for dv in ws.data_validations.dataValidation
    )
    assert has_dv


# ─────────────────────────────────────────────────────────────────────
# F. エッジケース(4件)
# ─────────────────────────────────────────────────────────────────────

def test_url_none_leaves_link_cells_empty(tmp_path):
    """freee URL が None の場合、リンク列(13,14)が空欄になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    f = _make_finding(sub_code="TC-07a", area="A10")
    output = tmp_path / "out.xlsx"
    export_to_excel([f], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(2, 13).value in (None, "", "-")
    assert ws.cell(2, 14).value in (None, "", "-")


def test_single_finding_generates_valid_file(tmp_path):
    """Finding 1件で有効な .xlsx が生成される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    result = export_to_excel(findings, output)
    assert result == output
    assert output.exists()
    assert output.stat().st_size > 0


def test_output_path_parent_must_exist(tmp_path):
    """親ディレクトリが存在しない場合は ValueError が発生する。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    invalid = tmp_path / "nonexistent_dir" / "out.xlsx"
    with pytest.raises(ValueError):
        export_to_excel(findings, invalid)


def test_type_error_when_findings_not_list(tmp_path):
    """findings が list でない場合は TypeError が発生する。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    with pytest.raises(TypeError):
        export_to_excel("not a list", output)  # type: ignore
