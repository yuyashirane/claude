"""サマリーシート・詳細シート生成モジュール。

仕様書 §11.2〜§11.7 に基づき、Finding リストから openpyxl ワークシートを組み立てる。
責務はシート構造の生成のみ。ファイル保存は exporter.py が行う。

Finding スキーマ v0.2(実際の schema.py)との対応:
    - area タグ: Finding.area (str, e.g. "A10")
    - TC コード: Finding.tc_code (e.g. "TC-07") / sub_code (e.g. "TC-07a")
    - severity:   Finding.severity (e.g. "🔴 High")
    - 金額:       Finding に total_amount なし → "-" で代替(Phase 6 制約)
    - 取引日:     Finding.link_hints.period_start があれば使用、なければ "-"
    - 勘定科目:   Finding.link_hints.account_name があれば使用、なければ "-"
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

from skills.export.excel_report.styles import (
    DETAIL_COLUMNS,
    SUMMARY_COLUMNS,
    HEADER_FILL,
    HEADER_FONT,
    HEADER_ALIGNMENT,
    THIN_BORDER,
    MEDIUM_BOTTOM_BORDER,
    AMOUNT_ALIGNMENT,
    AMOUNT_NUMBER_FORMAT,
    get_row_fill,
)
from skills.export.excel_report.sort_priority_map import get_sort_priority

# ─────────────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────────────

_REFS_DIR = Path(__file__).parent / "references"

# area → シート名マッピング(area-sheet-mapping.json から読み込み)
def _load_area_mapping() -> dict[str, str]:
    path = _REFS_DIR / "area-sheet-mapping.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("mappings", {})

AREA_SHEET_MAPPING: dict[str, str] = _load_area_mapping()

# area の表示順(仕様書 §11.2)
AREA_ORDER: list[str] = ["A4", "A5", "A8", "A10", "A11", "A12"]

# ─────────────────────────────────────────────────────────────────────
# Finding 属性ヘルパー
# ─────────────────────────────────────────────────────────────────────

def _get_area(finding) -> str:
    return getattr(finding, "area", "")

def _get_sort_priority(finding) -> int:
    """Finding.sort_priority を優先使用、0以下なら SORT_PRIORITY_MAP から解決。"""
    sp = getattr(finding, "sort_priority", 0)
    if sp and sp > 0:
        return sp
    return get_sort_priority(getattr(finding, "sub_code", ""))

def _get_transaction_date(finding) -> str:
    """取引日: link_hints.period_start があれば YYYY/MM/DD、なければ '-'。"""
    lh = getattr(finding, "link_hints", None)
    if lh is None:
        return "-"
    ps = getattr(lh, "period_start", None)
    if ps is None:
        return "-"
    return ps.strftime("%Y/%m/%d") if hasattr(ps, "strftime") else str(ps)

def _get_account_name(finding) -> str:
    """勘定科目: link_hints.account_name があれば使用、なければ '-'。"""
    lh = getattr(finding, "link_hints", None)
    if lh is None:
        return "-"
    return getattr(lh, "account_name", None) or "-"

def _get_wallet_txn_id(finding) -> str:
    v = getattr(finding, "wallet_txn_id", None)
    return v if v else "-"

def _is_medium_or_orange(severity: str) -> bool:
    """🟠 Warning を 🟡 Medium にマージするための判定。"""
    return "🟡" in severity or "🟠" in severity

# ─────────────────────────────────────────────────────────────────────
# 詳細シート生成
# ─────────────────────────────────────────────────────────────────────

def build_detail_sheet(ws, findings: list) -> None:
    """詳細シートを生成する。

    Args:
        ws: openpyxl の Worksheet オブジェクト
        findings: 当該 area の Finding リスト(ソート済み)
    """
    # 1. ヘッダー行
    _write_header_row(ws, DETAIL_COLUMNS)

    # 2. 列幅設定
    for col_idx, _, width in DETAIL_COLUMNS:
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    # 3. ヘッダー行固定(A2 で freeze)
    ws.freeze_panes = "A2"

    # 4. オートフィルタ設定
    last_col = get_column_letter(len(DETAIL_COLUMNS))
    ws.auto_filter.ref = f"A1:{last_col}1"

    # 5. データ行
    for row_offset, finding in enumerate(findings):
        excel_row = row_offset + 2  # ヘッダーが1行目なので2行目から
        _write_detail_data_row(ws, excel_row, finding)

    # 6. 確認状況列(Q列=17列目)にデータ検証(プルダウン)
    if findings:
        last_data_row = len(findings) + 1
        dv = DataValidation(
            type="list",
            formula1='"〇,×,保留"',
            allow_blank=True,
            showDropDown=False,
        )
        dv.sqref = f"Q2:Q{last_data_row}"
        ws.add_data_validation(dv)


def _write_header_row(ws, columns: list) -> None:
    """ヘッダー行を書き込む。"""
    for col_idx, header, _ in columns:
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = HEADER_ALIGNMENT
        cell.border = THIN_BORDER


def _write_detail_data_row(ws, row: int, finding) -> None:
    """詳細シートのデータ行を書き込む。"""
    severity = getattr(finding, "severity", "")
    sub_code = getattr(finding, "sub_code", "")
    message = getattr(finding, "message", "")
    current_value = getattr(finding, "current_value", "")
    suggested_value = getattr(finding, "suggested_value", "")
    confidence = getattr(finding, "confidence", 0)
    error_type = getattr(finding, "error_type", "")

    # 取引日・勘定科目はヘルパーで解決
    txn_date = _get_transaction_date(finding)
    account = _get_account_name(finding)
    wallet_txn_id = _get_wallet_txn_id(finding)

    # 行の背景色
    row_fill = get_row_fill(severity)

    data_values = [
        (1,  severity),
        (2,  sub_code),
        (3,  message[:40] if message else ""),   # 観点: message 先頭40文字
        (4,  message),                            # チェック結果: message 全文
        (5,  txn_date),
        (6,  account),
        (7,  "-"),                               # 取引先: row_data なし → "-"
        (8,  message[:80] if message else ""),   # 摘要: message 先頭80文字
        (9,  "-"),                               # 借方金額: total_amount なし → "-"
        (10, "-"),                               # 貸方金額: "-"
        (11, current_value),
        (12, suggested_value),
        (13, ""),                                # 🔗総勘定元帳: Phase 6 は空欄
        (14, ""),                                # 🔗仕訳帳:    Phase 6 は空欄
        (15, confidence),
        (16, error_type),
        (17, ""),                                # 確認状況: プルダウン用空欄
        (18, ""),                                # 担当者メモ: 空欄
        (19, wallet_txn_id),
    ]

    for col_idx, value in data_values:
        cell = ws.cell(row=row, column=col_idx, value=value)
        cell.fill = row_fill
        cell.border = THIN_BORDER

        # 列固有の書式
        if col_idx in (9, 10):
            cell.alignment = AMOUNT_ALIGNMENT
            if isinstance(value, (int, float)):
                cell.number_format = AMOUNT_NUMBER_FORMAT
        elif col_idx == 4:
            cell.alignment = __import__(
                "openpyxl.styles", fromlist=["Alignment"]
            ).Alignment(wrap_text=True)

    # show_by_default=False の行を非表示(row_hidden 方式)
    if not getattr(finding, "show_by_default", True):
        ws.row_dimensions[row].hidden = True


# ─────────────────────────────────────────────────────────────────────
# サマリーシート生成
# ─────────────────────────────────────────────────────────────────────

def build_summary_sheet(ws, all_findings: list, area_sheet_names: dict[str, str]) -> None:
    """サマリーシートを生成する。

    Args:
        ws: openpyxl の Worksheet オブジェクト
        all_findings: 全 Finding のリスト
        area_sheet_names: area → 実際に生成されたシート名のマップ
    """
    # 1. ヘッダー行
    _write_header_row(ws, SUMMARY_COLUMNS)

    # 2. 列幅設定
    for col_idx, _, width in SUMMARY_COLUMNS:
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    # 3. ヘッダー行固定
    ws.freeze_panes = "A2"

    # 4. area × tc_code グルーピング
    groups: dict[tuple[str, str], list] = {}
    for f in all_findings:
        area = _get_area(f)
        tc_code = getattr(f, "tc_code", "")
        key = (area, tc_code)
        groups.setdefault(key, []).append(f)

    # 5. サマリー行を area order → tc_code order で書き込む
    row = 2
    for area in AREA_ORDER:
        # この area の tc_code たちを取得(tc_code 昇順)
        area_tcs = sorted(
            {key[1] for key in groups if key[0] == area}
        )
        for tc in area_tcs:
            findings_in_group = groups.get((area, tc), [])
            area_name = AREA_SHEET_MAPPING.get(area, area)

            high_count = sum(1 for f in findings_in_group if "🔴" in getattr(f, "severity", ""))
            medium_count = sum(1 for f in findings_in_group if _is_medium_or_orange(getattr(f, "severity", "")))
            low_count = sum(1 for f in findings_in_group if "🟢" in getattr(f, "severity", ""))
            total = len(findings_in_group)
            sub_type_count = len({getattr(f, "sub_code", "") for f in findings_in_group})

            row_data = [
                (1,  area),
                (2,  area_name),
                (3,  tc),
                (4,  sub_type_count),
                (5,  high_count),
                (6,  medium_count),
                (7,  low_count),
                (8,  total),
                (9,  "-"),    # 影響金額合計: total_amount なし → "-"
                (10, ""),     # 確認進捗: 手動入力(数式は Phase 7 以降)
            ]

            for col_idx, value in row_data:
                cell = ws.cell(row=row, column=col_idx, value=value)
                cell.border = THIN_BORDER
                if col_idx in (4, 5, 6, 7, 8):
                    cell.alignment = __import__(
                        "openpyxl.styles", fromlist=["Alignment"]
                    ).Alignment(horizontal="right")

            row += 1

    # findings が空の場合、サマリー行なし(ヘッダーのみ)


# ─────────────────────────────────────────────────────────────────────
# Finding ソート
# ─────────────────────────────────────────────────────────────────────

def sort_findings_for_sheet(findings: list) -> list:
    """area → tc_code → sort_priority の3階層でソート。"""
    def sort_key(f):
        area = _get_area(f)
        tc = getattr(f, "tc_code", "")
        sp = _get_sort_priority(f)
        return (area, tc, sp)

    return sorted(findings, key=sort_key)
