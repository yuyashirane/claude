"""Excel 出力エントリポイント。

`Finding[]` → `.xlsx` の変換を担う。
Phase 6.12: テンプレート駆動方式に移行。
    TC_template.xlsx を読み込み、Finding データを流し込む。
    スタイル（色・フォント・列幅・配置）はテンプレートから継承する。

Note:
    推奨出力パス規約: data/reports/{事業所ID}_{事業所名}/
    例: data/reports/3525430_あしたの会計事務所/消費税区分チェック_202512.xlsx
"""
from __future__ import annotations

from pathlib import Path

from skills.export.excel_report.template_engine import build_output


def export_to_excel(
    findings: list,
    output_path: Path,
    company_name: str = "",
    period: str = "",
    template_path: Path | None = None,
) -> Path:
    """Finding 配列を Excel ファイルに変換して保存する。

    Args:
        findings:      Finding オブジェクトのリスト（空リストも許容）
        output_path:   出力先 .xlsx のパス
        company_name:  会社名（レポートタイトル用、省略可）
        period:        対象期間の文字列（例: "2026/02" "2026年2月期"）
        template_path: テンプレートファイルのパス。None の場合はデフォルト使用

    Returns:
        output_path: 保存された Excel ファイルのパス（引数と同じ）

    Raises:
        FileNotFoundError: テンプレートファイルが存在しない場合
        ValueError:        output_path の親ディレクトリが存在しない場合
        TypeError:         findings が list でない場合
    """
    if not isinstance(findings, list):
        raise TypeError(f"findings must be a list, got {type(findings).__name__}")

    return build_output(
        findings=findings,
        output_path=output_path,
        company_name=company_name,
        period=period,
        template_path=template_path,
    )
