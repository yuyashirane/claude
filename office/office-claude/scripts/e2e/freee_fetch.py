"""Phase 6.7: freee-MCP 取得結果の整形ヘルパーモジュール。

役割分担:
    - freee-MCP 呼び出し: Claude Code セッションが担当
    - 整形・マージ・保存: このモジュールの関数が担当

このモジュールから freee REST API を直接叩かない。
Claude Code が MCP 経由で取得した dict/list を受け取り、
adapter(freee_to_context.py)が読める 5 ファイルを保存する。

出力ファイル構成:
    data/e2e/<company_id>/YYYYMM/
        deals_YYYYMM.json        ← merge_deals_pages() の出力
        partners_all.json        ← normalize_partners() の出力
        account_items_all.json   ← account_items 配列をそのまま
        company_info.json        ← 6 キーを含む単一 dict
        taxes_codes.json         ← normalize_taxes_codes() の出力(Phase 6.10 追加)
"""
from __future__ import annotations

import json
from pathlib import Path


def merge_deals_pages(pages: list[dict]) -> dict:
    """複数ページの deals レスポンスを 1 つの統合 dict にマージする。

    Args:
        pages: 各ページの API レスポンス dict のリスト。
               各要素は {"deals": [...], "meta": {"total_count": N}} の形。

    Returns:
        統合 dict: {"deals": [全 deals 配列], "meta": {"total_count": N}}
        meta.total_count は最初のページの値を採用。

    Raises:
        ValueError: pages が空、または total_count と実際の件数が不一致。
    """
    if not pages:
        raise ValueError("pages が空です。少なくとも 1 ページのレスポンスが必要です。")

    # total_count は最初のページから取得
    first_page = pages[0]
    total_count = first_page.get("meta", {}).get("total_count")

    # 全ページの deals を連結
    all_deals: list[dict] = []
    for page in pages:
        all_deals.extend(page.get("deals", []))

    # total_count と実件数の検証
    if total_count is not None and len(all_deals) != total_count:
        raise ValueError(
            f"total_count と実際の deals 件数が一致しません。"
            f"total_count={total_count}, 実件数={len(all_deals)}"
        )

    return {
        "deals": all_deals,
        "meta": {"total_count": len(all_deals)},
    }


def normalize_partners(raw_pages: list[dict]) -> list[dict]:
    """partners の複数ページレスポンスを 1 つの配列にまとめる。

    Args:
        raw_pages: 各ページの API レスポンス dict のリスト。
                   各要素は {"partners": [...]} の形。
                   空レスポンス {"partners": []} が末尾に含まれる想定。

    Returns:
        partners dict のリスト(空レスポンスは除外)。

    Raises:
        ValueError: ページに "partners" キーが存在しない場合。
    """
    all_partners: list[dict] = []
    for i, page in enumerate(raw_pages):
        if "partners" not in page:
            raise ValueError(
                f"ページ {i} に 'partners' キーがありません。"
                f"レスポンスキー: {list(page.keys())}"
            )
        partners = page["partners"]
        # 空レスポンスは除外(ループ終了判定用の空ページが含まれるため)
        if partners:
            all_partners.extend(partners)

    return all_partners


def save_json(data: dict | list, path: Path) -> None:
    """data を JSON ファイルに保存する。

    - 親ディレクトリが存在しない場合は自動作成
    - UTF-8 エンコーディング、ensure_ascii=False、indent=2 で保存
    - 既存ファイルは上書き

    Args:
        data: 保存対象の dict または list。
        path: 保存先パス(Path オブジェクト)。
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_taxes_codes(raw_response: dict) -> list[dict]:
    """freee `/api/1/taxes/codes` のレスポンスを配列として整形する。

    Args:
        raw_response: API のレスポンス dict。
                      期待形: {"taxes": [{"code": int, "name": str, "name_ja": str}, ...]}

    Returns:
        taxes dict のリスト(ラップ無しの配列、§1.1 準拠)。
        各要素は code / name / name_ja の 3 フィールドを含む。

    Raises:
        ValueError: "taxes" キーが存在しない、または配列でない場合。
    """
    if "taxes" not in raw_response:
        raise ValueError(
            "'taxes' キーが存在しません。"
            f"レスポンスキー: {list(raw_response.keys())}"
        )
    taxes = raw_response["taxes"]
    if not isinstance(taxes, list):
        raise ValueError(
            f"'taxes' が配列ではありません。"
            f"実際の型: {type(taxes).__name__}"
        )
    return taxes


def validate_completeness(
    deals_json: dict,
    expected_count: int | None = None,
) -> dict:
    """取得した deals JSON の妥当性をチェックする。

    チェック項目:
    - deals 配列が存在すること
    - 各 deal に id / issue_date / details が存在すること
    - expected_count が指定されていれば、件数一致をチェック
    - 各 deal の issue_date が月次範囲内にあるか(引数で期間チェックはしない。
      deal の日付分布のサマリを返す)

    Args:
        deals_json: merge_deals_pages の出力。
        expected_count: 期待件数(省略可)。指定時は件数不一致で警告情報に含める。

    Returns:
        {
            "total": int,
            "issue_date_min": str,
            "issue_date_max": str,
            "details_empty_count": int,   # details が空の deal 件数
            "partner_id_null_count": int, # partner_id が null の deal 件数
            "warnings": list[str],        # 異常検知の説明リスト
        }
    """
    warnings: list[str] = []

    deals = deals_json.get("deals", [])
    total = len(deals)

    # expected_count 不一致チェック
    if expected_count is not None and total != expected_count:
        warnings.append(
            f"件数不一致: expected={expected_count}, actual={total}"
        )

    # 日付分布・カウント集計
    issue_dates: list[str] = []
    details_empty_count = 0
    partner_id_null_count = 0

    for deal in deals:
        # issue_date の収集
        issue_date = deal.get("issue_date")
        if issue_date:
            issue_dates.append(issue_date)

        # details が空・null・欠落のカウント
        details = deal.get("details")
        if not details:
            details_empty_count += 1

        # partner_id が null のカウント
        if deal.get("partner_id") is None:
            partner_id_null_count += 1

    issue_date_min = min(issue_dates) if issue_dates else ""
    issue_date_max = max(issue_dates) if issue_dates else ""

    # 日付が存在しない deal が多い場合は警告
    if total > 0 and len(issue_dates) < total:
        warnings.append(
            f"issue_date が欠落している deal が {total - len(issue_dates)} 件あります。"
        )

    return {
        "total": total,
        "issue_date_min": issue_date_min,
        "issue_date_max": issue_date_max,
        "details_empty_count": details_empty_count,
        "partner_id_null_count": partner_id_null_count,
        "warnings": warnings,
    }
