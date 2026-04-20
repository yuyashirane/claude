"""Phase 6 Excel 出力テスト（Phase 6.12 テンプレート駆動版）。

構造テスト（スナップショット不使用）。
生成された .xlsx を openpyxl で再オープンしてピンポイント検証。

テスト分類:
    A. シート構造    5件
    B. 列構成        4件
    C. データ配置    5件
    D. ソート        3件
    E. 視覚装飾      4件
    F. エッジケース  5件  (+1: テンプレートエラー)
    G. Phase 6.11a 追加テスト  5件
    H. Phase 6.11a v2 追加テスト  6件
    I. Phase 6.12 テンプレート駆動テスト  3件
    J. Phase 6.12a スタイル保持テスト  2件
    K. Phase 6.11b 金額列O/Pテスト  3件
    L. 対象月フォーマットテスト  2件
    M. Phase 7 Q/R 列ハイパーリンクテスト  5件
合計: 52件

詳細シートレイアウト（テンプレート準拠、23列）:
    Row 1: シートタイトル
    Row 2: 空行
    Row 3: ヘッダー行（23列）
    Row 4+: データ行

列マッピング（23列）:
    A=優先度, B=項目, C=項目名, D=観点, E=チェック結果,
    F=現在の税区分, G=推奨税区分, H=取引日, I=勘定科目, J=取引先,
    K=品目, L=部門, M=メモ, N=摘要, O=借方金額, P=貸方金額,
    Q=🔗総勘定元帳, R=🔗仕訳帳, S=確信度, T=エラー型,
    U=確認状況, V=担当者メモ, W=walletTxnId
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
    debit_amount=None,
    credit_amount=None,
    deal_id=None,
):
    """テスト用 Finding ビルダー（実際の schema.py の Finding 定義に完全準拠）。

    tc_code は sub_code[:5] から自動導出（TC-07a → TC-07）。
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
        debit_amount=debit_amount,
        credit_amount=credit_amount,
        deal_id=deal_id,
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
# A. シート構造（5件）
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


def test_empty_findings_summary_and_sankou(tmp_path):
    """空 findings 時はサマリーシートと参考シートが残る（area シートは削除）。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    assert "サマリー" in wb.sheetnames
    assert "参考" in wb.sheetnames
    # area シートは全削除
    for area_sheet in ["A4 家賃・地代", "A5 人件費", "A8 売上",
                       "A10 その他経費", "A11 営業外・特別損益", "A12 税金"]:
        assert area_sheet not in wb.sheetnames


# ─────────────────────────────────────────────────────────────────────
# B. 列構成（4件）
# ─────────────────────────────────────────────────────────────────────

def test_detail_sheet_has_23_columns(tmp_path):
    """詳細シートのヘッダー行（Row 3）に非空セルが 23 個ある。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    header_cells = [c for c in ws[3] if c.value is not None]
    assert len(header_cells) == 23


def test_summary_lower_table_has_11_columns(tmp_path):
    """サマリーシートの下部テーブルヘッダー行（Row 20）に非空セルが 11 個ある。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    header_cells = [c for c in ws[20] if c.value is not None]
    assert len(header_cells) == 11


def test_detail_sheet_header_values(tmp_path):
    """詳細シートのヘッダー行（Row 3）の主要ヘッダー文字列を検証。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(3, 1).value == "優先度"     # A
    assert ws.cell(3, 2).value == "項目"       # B
    assert ws.cell(3, 21).value == "確認状況"  # U（23列構成）


def test_column_widths_set(tmp_path):
    """詳細シートの列幅がテンプレートから継承される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.column_dimensions["A"].width == 8       # 優先度（テンプレート値）
    assert ws.column_dimensions["E"].width == 40.625  # チェック結果（テンプレート値）


# ─────────────────────────────────────────────────────────────────────
# C. データ配置（5件）
# ─────────────────────────────────────────────────────────────────────

def test_tc02_finding_placed_in_a4_sheet(tmp_path):
    """TC-02c の Finding が A4 シートの Row 4 項目列（B）に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-02c", area="A4", sort_priority=8)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A4 家賃・地代"]
    assert ws.cell(4, 2).value == "TC-02c"


def test_tc07_finding_placed_in_a10_sheet(tmp_path):
    """TC-07f の Finding が A10 シートの Row 4 に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07f", area="A10", show_by_default=False,
                               sort_priority=28)]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 2).value == "TC-07f"


def test_current_and_suggested_value_placed(tmp_path):
    """現在の税区分（F列）・推奨税区分（G列）が Row 4 に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(
        sub_code="TC-07a", area="A10",
        current_value="課対仕入10%", suggested_value="対象外",
    )]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 6).value == "課対仕入10%"   # F列
    assert ws.cell(4, 7).value == "対象外"          # G列


def test_wallet_txn_id_placed(tmp_path):
    """walletTxnId が W列（23列目）の Row 4 に配置される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10", wallet_txn_id="txn-xyz-999")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 23).value == "txn-xyz-999"


def test_link_hints_account_name_in_column9(tmp_path):
    """link_hints.account_name が I列（9列目, 勘定科目）の Row 4 に反映される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding_with_hints(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 9).value == "福利厚生費"


# ─────────────────────────────────────────────────────────────────────
# D. ソート（3件）
# ─────────────────────────────────────────────────────────────────────

def test_rows_sorted_by_sort_priority(tmp_path):
    """同一 area 内で sort_priority 昇順にソートされる。データは Row 4 から。"""
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
    assert ws.cell(4, 2).value == "TC-02a"
    assert ws.cell(5, 2).value == "TC-02c"
    assert ws.cell(6, 2).value == "TC-02f"


def test_sort_priority_from_map_when_zero(tmp_path):
    """Finding.sort_priority が 0 の場合、SORT_PRIORITY_MAP から解決される。"""
    from skills.export.excel_report.exporter import export_to_excel
    f_b = _make_finding(sub_code="TC-07b", area="A10", sort_priority=0)
    f_a = _make_finding(sub_code="TC-07a", area="A10", sort_priority=0)
    output = tmp_path / "out.xlsx"
    export_to_excel([f_b, f_a], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 2).value == "TC-07a"
    assert ws.cell(5, 2).value == "TC-07b"


def test_summary_sheet_sorted_by_area_order(tmp_path):
    """サマリーシートは area 順（A4→A10）にソートされる。データは Row 21 から始まる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", sort_priority=12),
        _make_finding(sub_code="TC-02c", area="A4", sort_priority=8),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    assert ws.cell(21, 1).value == "A4"
    assert ws.cell(22, 1).value == "A10"


# ─────────────────────────────────────────────────────────────────────
# E. 視覚装飾（4件）
# ─────────────────────────────────────────────────────────────────────

def test_high_severity_row_has_red_fill(tmp_path):
    """🔴 High の行が赤系（FFC7CE）で塗られる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10", severity="🔴 High")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    cell = ws.cell(4, 1)
    rgb = str(cell.fill.start_color.rgb).upper()
    assert "FFC7CE" in rgb


def test_show_by_default_false_row_visible(tmp_path):
    """show_by_default=False でも初期は全行表示（hidden=False）。"""
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
    assert ws.row_dimensions[4].hidden is False
    assert ws.row_dimensions[5].hidden is False


def test_header_row_frozen(tmp_path):
    """詳細シートのヘッダーが A4 で固定される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.freeze_panes == "A4"


def test_confirmation_column_has_dropdown(tmp_path):
    """確認状況列（U=21列目）にプルダウンが設定される。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    has_dv = any(
        "U" in str(dv.sqref)
        for dv in ws.data_validations.dataValidation
    )
    assert has_dv


# ─────────────────────────────────────────────────────────────────────
# F. エッジケース（5件）
# ─────────────────────────────────────────────────────────────────────

def test_url_none_leaves_link_cells_empty(tmp_path):
    """freee URL が None の場合、リンク列（Q=17, R=18）が空欄になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    f = _make_finding(sub_code="TC-07a", area="A10")
    output = tmp_path / "out.xlsx"
    export_to_excel([f], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 17).value in (None, "", "-")   # Q: 🔗総勘定元帳
    assert ws.cell(4, 18).value in (None, "", "-")   # R: 🔗仕訳帳


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


def test_template_not_found_raises_error(tmp_path):
    """存在しないテンプレートパスを渡すと FileNotFoundError が発生する。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    with pytest.raises(FileNotFoundError):
        export_to_excel([], output, template_path=tmp_path / "no_such_template.xlsx")


# ─────────────────────────────────────────────────────────────────────
# G. Phase 6.11a 追加テスト（5件）
# ─────────────────────────────────────────────────────────────────────

def test_summary_header_title_in_row1(tmp_path):
    """サマリー Row 1 にレポートタイトルが入る（company_name なし）。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    assert ws.cell(1, 1).value == "消費税区分チェックレポート"


def test_summary_header_title_with_company_name(tmp_path):
    """company_name を渡すと Row 1 に '{名前} 消費税区分チェックレポート' が入る。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output, company_name="テスト株式会社")
    wb = load_workbook(output)
    ws = wb["サマリー"]
    assert "テスト株式会社" in ws.cell(1, 1).value
    assert "消費税区分チェックレポート" in ws.cell(1, 1).value


def test_summary_tc_matrix_tc07_row16(tmp_path):
    """サマリー Row 16（TC-07）に severity 別件数が入る。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", severity="🔴 High"),
        _make_finding(sub_code="TC-07b", area="A10", severity="🟢 Low"),
        _make_finding(sub_code="TC-07c", area="A10", severity="🟢 Low"),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    assert ws.cell(16, 1).value == "TC-07"   # A列: TC コード
    assert ws.cell(16, 4).value == 1          # D列: 重大
    assert ws.cell(16, 5).value == 0          # E列: 要注意
    assert ws.cell(16, 6).value == 2          # F列: 要確認
    assert ws.cell(16, 7).value == 3          # G列: 合計


def test_summary_tc_matrix_header_row9(tmp_path):
    """サマリー Row 9 に TC 別集計ヘッダーが入る。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    assert ws.cell(9, 1).value == "項目"
    assert ws.cell(9, 7).value == "合計"


def test_header_fill_is_dark_blue(tmp_path):
    """詳細シートのヘッダー行（Row 3）が濃紺（2F5496）で塗られる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    rgb = str(ws.cell(3, 1).fill.start_color.rgb).upper()
    assert "2F5496" in rgb


# ─────────────────────────────────────────────────────────────────────
# H. Phase 6.11a v2 追加テスト（6件）
# ─────────────────────────────────────────────────────────────────────

def test_detail_sheet_title_in_row1(tmp_path):
    """詳細シート Row 1 にシートタイトルが入る。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(1, 1).value == "A10 その他経費"


def test_detail_sheet_item_name_column(tmp_path):
    """詳細シート C列（3列目, 項目名）に TC 名称が入る。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-03c", area="A5")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    assert ws.cell(4, 3).value == "給与/人件費"


def test_detail_sheet_same_sub_code_shows_dou_jou(tmp_path):
    """直前行と同じ sub_code が連続する場合、観点・チェック結果は「同上」になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-03c", area="A5", message="給与が課税仕入になっています"),
        _make_finding(sub_code="TC-03c", area="A5", message="給与が課税仕入になっています"),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    assert ws.cell(4, 4).value != "同上"   # D: 観点（1行目は通常）
    assert ws.cell(4, 5).value != "同上"   # E: チェック結果（1行目は通常）
    assert ws.cell(5, 4).value == "同上"   # D: 観点（2行目は同上）
    assert ws.cell(5, 5).value == "同上"   # E: チェック結果（2行目は同上）


def test_detail_sheet_diff_sub_code_not_dou_jou(tmp_path):
    """異なる sub_code の行は「同上」にならない。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-03a", area="A5", message="メッセージA"),
        _make_finding(sub_code="TC-03b", area="A5", message="メッセージB"),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    assert ws.cell(5, 4).value != "同上"
    assert ws.cell(5, 5).value != "同上"


def test_summary_legend_in_l_m_columns(tmp_path):
    """サマリーシートの凡例が L 列（12）に配置される（テンプレート構造準拠）。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output, company_name="テスト会社")
    wb = load_workbook(output)
    ws = wb["サマリー"]
    # Row 2: L="【判定凡例】"（テンプレートでは Row 2 に配置）
    assert ws.cell(2, 12).value == "【判定凡例】"
    # Row 3: L="重大", Row 4: L="要注意", Row 5: L="要確認"
    assert ws.cell(3, 12).value == "重大"
    assert ws.cell(4, 12).value == "要注意"
    assert ws.cell(5, 12).value == "要確認"


def test_severity_display_low_is_youkakunin(tmp_path):
    """🟢 Low の優先度列表示が「要確認」になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [_make_finding(sub_code="TC-07a", area="A10", severity="🟢 Low")]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 1).value == "要確認"


# ─────────────────────────────────────────────────────────────────────
# I. Phase 6.12 テンプレート駆動テスト（3件）
# ─────────────────────────────────────────────────────────────────────

def test_sankou_sheet_preserved(tmp_path):
    """参考シートがテンプレートからそのままコピーされる。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    assert "参考" in wb.sheetnames
    ws = wb["参考"]
    # 参考シートに TC-01 などの参照データが残っていること
    values = [ws.cell(r, 1).value for r in range(1, ws.max_row + 1)]
    assert any(v and "TC-01" in str(v) for v in values)


def test_custom_template_path_works(tmp_path):
    """template_path 引数でカスタムテンプレートを指定できる。"""
    from skills.export.excel_report.exporter import export_to_excel
    from skills.export.excel_report.template_engine import DEFAULT_TEMPLATE_PATH
    output = tmp_path / "out.xlsx"
    # デフォルトテンプレートを明示的に渡しても同じ結果
    result = export_to_excel([], output, template_path=DEFAULT_TEMPLATE_PATH)
    assert result == output
    wb = load_workbook(output)
    assert "サマリー" in wb.sheetnames


def test_tc_code_no_trailing_spaces(tmp_path):
    """サマリーシートの TC コード列（A列）に末尾スペースがない。"""
    from skills.export.excel_report.exporter import export_to_excel
    output = tmp_path / "out.xlsx"
    export_to_excel([], output)
    wb = load_workbook(output)
    ws = wb["サマリー"]
    for row in range(10, 17):   # TC-01〜TC-07 の行
        val = ws.cell(row, 1).value
        if val:
            assert val == val.strip(), f"Row {row}: '{val}' に末尾スペースあり"


# ─────────────────────────────────────────────────────────────────────
# J. Phase 6.12a スタイル保持テスト（2件）
# ─────────────────────────────────────────────────────────────────────

def test_area_sheet_preserves_template_font(tmp_path):
    """エリア別シートのデータ行がテンプレートのフォント（Meiryo UI/10pt）を保持する。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", sort_priority=12),
        _make_finding(sub_code="TC-07b", area="A10", sort_priority=14),
        _make_finding(sub_code="TC-07c", area="A10", sort_priority=16),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    for data_row in range(4, 7):   # rows 4-6（3件分）
        for col in (1, 5, 14, 23):   # 代表列：優先度/チェック結果/摘要/walletTxnId
            cell = ws.cell(data_row, col)
            assert cell.font.name == "Meiryo UI", \
                f"row {data_row} col {col}: font={cell.font.name!r} (expected 'Meiryo UI')"
            assert cell.font.size == 10.0, \
                f"row {data_row} col {col}: size={cell.font.size} (expected 10.0)"
            assert cell.alignment.vertical == "center", \
                f"row {data_row} col {col}: v_align={cell.alignment.vertical!r} (expected 'center')"


def test_summary_sheet_unaffected_by_area_fix(tmp_path):
    """エリアシート修正後もサマリーシートが正常動作する（回帰確認）。"""
    from skills.export.excel_report.exporter import export_to_excel
    findings = [
        _make_finding(sub_code="TC-07a", area="A10", severity="🔴 High"),
        _make_finding(sub_code="TC-03c", area="A5", severity="🟢 Low"),
    ]
    output = tmp_path / "out.xlsx"
    export_to_excel(findings, output, company_name="回帰テスト株式会社", period="202512")
    wb = load_workbook(output)
    ws = wb["サマリー"]
    # タイトルに会社名が含まれる
    assert "回帰テスト株式会社" in ws.cell(1, 1).value
    # TC-07 行（Row 16）: 重大=1
    assert ws.cell(16, 4).value == 1
    # TC-03 行（Row 12）: 要確認=1
    assert ws.cell(12, 6).value == 1
    # 両エリアシートが存在する
    assert "A5 人件費" in wb.sheetnames
    assert "A10 その他経費" in wb.sheetnames


# ─────────────────────────────────────────────────────────────────────
# K. Phase 6.11b 金額列O/Pテスト（3件）
# ─────────────────────────────────────────────────────────────────────

def test_debit_amount_written_to_col_O(tmp_path):
    """借方金額が O 列（col=15）に書き込まれ、P 列は空になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    finding = _make_finding(sub_code="TC-03a", area="A5", debit_amount=150000)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    cell_o = ws.cell(4, 15)
    cell_p = ws.cell(4, 16)
    assert cell_o.value == 150000, f"O4: expected 150000, got {cell_o.value!r}"
    assert cell_p.value in (None, ""), f"P4: expected empty, got {cell_p.value!r}"
    # 桁区切り書式が設定されていること
    assert cell_o.number_format == "#,##0", \
        f"O4 number_format: expected '#,##0', got {cell_o.number_format!r}"


def test_credit_amount_written_to_col_P(tmp_path):
    """貸方金額が P 列（col=16）に書き込まれ、O 列は空になる。"""
    from skills.export.excel_report.exporter import export_to_excel
    finding = _make_finding(sub_code="TC-05a", area="A11", credit_amount=50000)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    # A11 シートのシート名を取得
    sheet_name = next(n for n in wb.sheetnames if n.startswith("A11"))
    ws = wb[sheet_name]
    cell_o = ws.cell(4, 15)
    cell_p = ws.cell(4, 16)
    assert cell_o.value in (None, ""), f"O4: expected empty, got {cell_o.value!r}"
    assert cell_p.value == 50000, f"P4: expected 50000, got {cell_p.value!r}"
    # 貸方列に桁区切り書式が設定されていること
    assert cell_p.number_format == "#,##0", \
        f"P4 number_format: expected '#,##0', got {cell_p.number_format!r}"


def test_amount_none_writes_empty_cells(tmp_path):
    """debit_amount / credit_amount が None のとき O/P 列は空（既存挙動維持）。"""
    from skills.export.excel_report.exporter import export_to_excel
    finding = _make_finding(sub_code="TC-07a", area="A10")  # debit/credit=None
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 15).value in (None, ""), "O4 should be empty when debit_amount=None"
    assert ws.cell(4, 16).value in (None, ""), "P4 should be empty when credit_amount=None"


# ─────────────────────────────────────────────────────────────────────
# L. 対象月フォーマットテスト（2件）
# ─────────────────────────────────────────────────────────────────────

def test_format_target_month_standard():
    """'YYYYMM' 文字列を '年月' 表記に正しく変換する。"""
    from skills.export.excel_report.template_engine import format_target_month
    assert format_target_month("202512") == "2025年12月"
    assert format_target_month("202504") == "2025年4月"   # 月の先頭ゼロは除く
    assert format_target_month("202601") == "2026年1月"


def test_format_target_month_fallback():
    """不正な入力はそのまま返す（防御的実装の確認）。"""
    from skills.export.excel_report.template_engine import format_target_month
    assert format_target_month("invalid") == "invalid"
    assert format_target_month("2025-12") == "2025-12"   # ハイフン区切りは変換しない
    assert format_target_month("") == ""


# ─────────────────────────────────────────────────────────────────────
# M. Phase 7 Q/R 列ハイパーリンクテスト（4件）
# ─────────────────────────────────────────────────────────────────────

def _make_link_hints_for_test(
    target="general_ledger",
    account_name="支払手数料",
    period_start=date(2025, 12, 1),
    period_end=date(2025, 12, 31),
    fiscal_year_id="9842248",
    company_id="3525430",
    deal_id=None,
):
    """Section M 用 LinkHints ファクトリ。"""
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
    return schema.LinkHints(
        target=target,
        account_name=account_name,
        period_start=period_start,
        period_end=period_end,
        fiscal_year_id=fiscal_year_id,
        company_id=company_id,
        deal_id=deal_id,
    )


def test_q_column_has_gl_hyperlink(tmp_path):
    """Q 列（col=17）に総勘定元帳のハイパーリンクが設定される。"""
    import urllib.parse
    from skills.export.excel_report.exporter import export_to_excel

    lh = _make_link_hints_for_test()
    finding = _make_finding(sub_code="TC-03a", area="A5", link_hints=lh)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    cell = ws.cell(4, 17)
    assert cell.value == "🔗", f"Q4 value: expected '🔗', got {cell.value!r}"
    assert cell.hyperlink is not None, "Q4 should have a hyperlink"
    url = cell.hyperlink.target
    assert "general_ledgers/show" in url, f"Q4 URL should contain 'general_ledgers/show': {url}"
    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert parsed["name"] == ["支払手数料"]
    assert parsed["start_date"] == ["2025-12-01"]
    assert parsed["company_id"] == ["3525430"]


def test_r_column_has_jnl_hyperlink_with_deal_id(tmp_path):
    """R 列（col=18）に deal_id ピンポイント仕訳帳 URL が設定される。"""
    import urllib.parse
    from skills.export.excel_report.exporter import export_to_excel

    lh = _make_link_hints_for_test(deal_id="2730330344")
    finding = _make_finding(sub_code="TC-03a", area="A5", link_hints=lh)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    cell = ws.cell(4, 18)
    assert cell.value == "🔗", f"R4 value: expected '🔗', got {cell.value!r}"
    assert cell.hyperlink is not None, "R4 should have a hyperlink"
    url = cell.hyperlink.target
    assert "/reports/journals" in url, f"R4 URL should contain '/reports/journals': {url}"
    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert parsed["deal_id"] == ["2730330344"], f"deal_id missing from R4 URL: {url}"
    assert "start_date" not in parsed, "ピンポイント URL に start_date は不要"
    assert "name" not in parsed, "journal URL に name（科目名）は不要"


def test_q_r_no_hyperlink_when_link_hints_none(tmp_path):
    """link_hints が None の Finding では Q/R 列にハイパーリンクが設定されない。"""
    from skills.export.excel_report.exporter import export_to_excel

    finding = _make_finding(sub_code="TC-07a", area="A10", link_hints=None)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A10 その他経費"]
    assert ws.cell(4, 17).hyperlink is None, "Q4: link_hints=None のとき hyperlink なし"
    assert ws.cell(4, 18).hyperlink is None, "R4: link_hints=None のとき hyperlink なし"


def test_r_column_fallback_url_when_no_deal_id(tmp_path):
    """deal_id なしの場合、R 列が期間ベース URL にフォールバックする。"""
    import urllib.parse
    from skills.export.excel_report.exporter import export_to_excel

    lh = _make_link_hints_for_test(deal_id=None)
    finding = _make_finding(sub_code="TC-03a", area="A5", link_hints=lh)
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    cell = ws.cell(4, 18)
    assert cell.hyperlink is not None, "R4: deal_id なしでも期間ベース URL でリンクが設定される"
    url = cell.hyperlink.target
    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert "deal_id" not in parsed
    assert parsed["start_date"] == ["2025-12-01"]
    assert parsed["end_date"] == ["2025-12-31"]


def test_r_column_uses_finding_deal_id_for_pinpoint(tmp_path):
    """finding.deal_id が設定されていれば、R 列にピンポイント URL が生成される。

    背景: build_link_hints("general_ledger") は link_hints.deal_id を設定しないため、
    Finding.deal_id を template_engine が直接参照してピンポイント URL を生成する必要がある。
    これが Phase 7 の主要 UX 目的「ワンクリックで該当取引を開ける」の実現に不可欠。
    """
    import urllib.parse
    from skills.export.excel_report.exporter import export_to_excel

    # link_hints.deal_id は None（general_ledger target の通常状態）
    # finding.deal_id のみ設定
    lh = _make_link_hints_for_test(deal_id=None)
    finding = _make_finding(
        sub_code="TC-03a", area="A5",
        link_hints=lh,
        deal_id="3237332503",  # Finding 側に直接設定
    )
    output = tmp_path / "out.xlsx"
    export_to_excel([finding], output)
    wb = load_workbook(output)
    ws = wb["A5 人件費"]
    cell = ws.cell(4, 18)
    assert cell.value == "🔗", f"R4 value: expected '🔗', got {cell.value!r}"
    assert cell.hyperlink is not None, "R4 should have a hyperlink"
    url = cell.hyperlink.target
    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert parsed.get("deal_id") == ["3237332503"], \
        f"finding.deal_id should produce pinpoint URL, got: {url}"
    assert "start_date" not in parsed, "ピンポイント URL に start_date は不要"
