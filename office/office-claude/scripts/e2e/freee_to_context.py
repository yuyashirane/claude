"""Phase 6.5: freee JSON → CheckContext Adapter（最小版）。

入力: Claude Code が事前保存した4つの JSON ファイル
    - deals_YYYYMM.json       月次取引（ページネーション済み統合版）
    - partners_all.json       全取引先マスタ
    - account_items_all.json  全勘定科目マスタ
    - company_info.json       会社基本情報

出力: CheckContext（deals の行レベルに展開済み）

対応範囲: deals のみ（manual_journals / wallet_txns / journals は非対応）

設計原則:
    - freee API を直接叩かない（JSON 読み込みのみ）
    - partner_id=null は空文字 "" で統一
    - details が空/null/欠落の deal は例外なしでスキップ
    - amount は常に Decimal（float は使わない）
    - tax_code は details[].tax_code を正とし、account_items の tax_code は使わない
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Optional

# ─────────────────────────────────────────────────────────────
# schema.py のロード（パスにハイフンが含まれるため importlib を使用）
# ─────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_SCHEMA_PATH = (
    _PROJECT_ROOT
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
)


def _load_schema():
    """schema.py を安全にロードし、sys.modules に登録して返す。"""
    mod_name = "schema"
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    spec = importlib.util.spec_from_file_location(mod_name, _SCHEMA_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"schema.py をロードできません: {_SCHEMA_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


_schema = _load_schema()
CheckContext = _schema.CheckContext
TransactionRow = _schema.TransactionRow


# ─────────────────────────────────────────────────────────────
# 純粋関数 1: resolve_partner_name
# ─────────────────────────────────────────────────────────────

def resolve_partner_name(
    partner_id: Optional[int],
    partners_cache: dict[int, str],
) -> str:
    """partner_id を partner_name に解決する。

    Args:
        partner_id: deal.partner_id。null（None）の場合もある。
        partners_cache: {partner_id: partner_name} の辞書。

    Returns:
        partner_name。partner_id が None または未知の場合は空文字 ""。
    """
    if partner_id is None:
        return ""
    return partners_cache.get(partner_id, "")


# ─────────────────────────────────────────────────────────────
# 純粋関数 2: resolve_account_name
# ─────────────────────────────────────────────────────────────

def resolve_account_name(
    account_item_id: int,
    account_items_cache: dict[int, str],
) -> str:
    """account_item_id を account_name に解決する。

    Args:
        account_item_id: details[].account_item_id。
        account_items_cache: {account_item_id: account_name} の辞書。

    Returns:
        account_name。未知 ID の場合は空文字 ""。
    """
    return account_items_cache.get(account_item_id, "")


# ─────────────────────────────────────────────────────────────
# 純粋関数 3: split_entry_side
# ─────────────────────────────────────────────────────────────

def split_entry_side(
    entry_side: str,
    amount: Decimal,
) -> tuple[Decimal, Decimal]:
    """entry_side から (debit_amount, credit_amount) を算出する。

    Args:
        entry_side: "debit" または "credit"。
        amount: 明細行金額（Decimal）。

    Returns:
        (debit_amount, credit_amount) のタプル。
        entry_side="debit"  → (amount, Decimal("0"))
        entry_side="credit" → (Decimal("0"), amount)

    Raises:
        ValueError: entry_side が "debit" / "credit" 以外の場合。
    """
    if entry_side == "debit":
        return (amount, Decimal("0"))
    elif entry_side == "credit":
        return (Decimal("0"), amount)
    else:
        raise ValueError(
            f'entry_side は "debit" または "credit" である必要があります。'
            f'受け取った値: {entry_side!r}'
        )


# ─────────────────────────────────────────────────────────────
# 純粋関数 4: transform_deal_to_rows
# ─────────────────────────────────────────────────────────────

def transform_deal_to_rows(
    deal: dict,
    partners_cache: dict[int, str],
    account_items_cache: dict[int, str],
) -> list:
    """1 deal を details[] を展開して TransactionRow リストに変換する。

    - partner_name は deal レベルで解決（全 details 行で共通）
    - partner_id が null の場合、partner_name は ""
    - account_name は details 行ごとに解決
    - debit_amount / credit_amount は entry_side から算出
    - date は deal.issue_date を全 details 行に付与
    - details が空配列 / null / キー欠落の場合は空リスト [] を返す（例外禁止）

    Args:
        deal: freee deals API の1取引レスポンス dict。
        partners_cache: {partner_id: partner_name}。
        account_items_cache: {account_item_id: account_name}。

    Returns:
        TransactionRow のリスト。details が空/欠落の場合は空リスト []。
    """
    # ── details の取得（空/null/欠落すべて空リストとして扱う）
    details = deal.get("details") or []
    if not details:
        return []

    # ── deal レベルで共通の情報を先に解決
    deal_id = str(deal["id"])
    issue_date_str = deal.get("issue_date", "")
    try:
        transaction_date = date.fromisoformat(issue_date_str)
    except (ValueError, TypeError):
        transaction_date = None

    partner_id = deal.get("partner_id")  # deal レベル（details[] には存在しない）
    partner_name = resolve_partner_name(partner_id, partners_cache)

    # ── 各 detail 行を TransactionRow に変換
    rows = []
    for detail in details:
        wallet_txn_id = str(detail["id"])
        account_item_id = detail["account_item_id"]
        account_name = resolve_account_name(account_item_id, account_items_cache)
        tax_code = detail.get("tax_code", 0)
        description = detail.get("description", "")
        entry_side = detail["entry_side"]

        # amount は文字列で来る場合があるため Decimal に変換
        raw_amount = detail.get("amount", 0)
        amount = Decimal(str(raw_amount))

        debit_amount, credit_amount = split_entry_side(entry_side, amount)

        row = TransactionRow(
            wallet_txn_id=wallet_txn_id,
            deal_id=deal_id,
            transaction_date=transaction_date,
            account=account_name,           # account_name → account フィールド
            tax_label=str(tax_code),        # tax_code → tax_label フィールド（文字列化）
            partner=partner_name,           # partner_name → partner フィールド
            description=description,
            debit_amount=debit_amount,
            credit_amount=credit_amount,
            raw={                           # 元データ保持（デバッグ用、非スキーマフィールドもここに）
                "deal_id": deal["id"],
                "row_id": detail["id"],
                "account_item_id": account_item_id,
                "partner_id": partner_id,
                "entry_side": entry_side,
                "tax_code": tax_code,
                "amount": raw_amount,
                "vat": detail.get("vat"),
            },
        )
        rows.append(row)

    return rows


# ─────────────────────────────────────────────────────────────
# 純粋関数 5: build_check_context
# ─────────────────────────────────────────────────────────────

def build_check_context(
    deals_path: Path,
    partners_path: Path,
    account_items_path: Path,
    company_info_path: Path,
) -> object:
    """4 つの JSON ファイルから CheckContext を組み立てる。

    処理フロー:
    1. 全 JSON ファイルを読み込み（欠落は FileNotFoundError）
    2. partners / account_items を dict 化してキャッシュ生成
    3. deals を展開して TransactionRow リストを構築（details 空/欠落はスキップ）
    4. company_info から company_id / fiscal_year_id 等を取得
    5. CheckContext を組み立てて返す
    6. 観測用ログを stdout に print（E2E デバッグ用）

    Args:
        deals_path: deals JSON のパス。
        partners_path: partners JSON のパス。
        account_items_path: account_items JSON のパス。
        company_info_path: company_info JSON のパス。

    Returns:
        組み立て済みの CheckContext。

    Raises:
        FileNotFoundError: 必須ファイルが存在しない場合。
        ValueError: JSON 構造が期待と異なる場合。
    """
    # ── 1. JSON ファイル読み込み
    def _load_json(path: Path, role: str) -> dict:
        if not path.exists():
            raise FileNotFoundError(
                f"{role} JSON が見つかりません: {path}\n"
                f"freee-MCP で {path.name} を先に保存してください。"
            )
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    deals_data = _load_json(deals_path, "deals")
    partners_data = _load_json(partners_path, "partners")
    account_items_data = _load_json(account_items_path, "account_items")
    company_data = _load_json(company_info_path, "company_info")

    # ── 2. キャッシュ生成
    # partners_data は §1.1 に従い配列直下形式 [...] で受け取る
    if not isinstance(partners_data, list):
        raise ValueError(
            "partners_all.json must be a JSON array per spec §1.1 "
            f"(actual type: {type(partners_data).__name__})"
        )
    partners_cache: dict[int, str] = {
        p["id"]: p.get("name", "")
        for p in partners_data
    }

    # account_items_data は §1.1 に従い配列直下形式 [...] で受け取る
    if not isinstance(account_items_data, list):
        raise ValueError(
            "account_items_all.json must be a JSON array per spec §1.1 "
            f"(actual type: {type(account_items_data).__name__})"
        )
    account_items_cache: dict[int, str] = {
        a["id"]: a.get("name", "")
        for a in account_items_data
    }

    # ── 3. deals を展開して TransactionRow リスト構築
    deals = deals_data.get("deals", [])
    all_rows = []
    skipped = 0

    for deal in deals:
        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)
        if not rows:
            skipped += 1
        else:
            all_rows.extend(rows)

    # ── 4. company_info から会社・会計期情報を取得
    # company_data は §1.1 に従いフラット 6 キー dict として受け取る
    if not isinstance(company_data, dict):
        raise ValueError(
            "company_info.json must be a JSON object per spec §1.1 "
            f"(actual type: {type(company_data).__name__})"
        )
    _required_keys = [
        "company_id",
        "company_name",
        "fiscal_year_id",
        "fiscal_year_start",
        "fiscal_year_end",
        "target_yyyymm",
    ]
    _missing = [k for k in _required_keys if k not in company_data]
    if _missing:
        raise ValueError(
            f"company_info.json is missing required keys per spec §1.1: {_missing}"
        )

    company_id = str(company_data["company_id"])
    fiscal_year_id = str(company_data["fiscal_year_id"])

    try:
        period_start = date.fromisoformat(company_data["fiscal_year_start"])
        period_end = date.fromisoformat(company_data["fiscal_year_end"])
    except (KeyError, ValueError) as e:
        raise ValueError(
            f"company_info.json の fiscal_year_start / fiscal_year_end が不正です: {company_data}"
        ) from e

    # ── 5. CheckContext 組み立て
    ctx = CheckContext(
        company_id=company_id,
        fiscal_year_id=fiscal_year_id,
        period_start=period_start,
        period_end=period_end,
        transactions=all_rows,
    )

    # ── 6. 観測用ログ（E2E デバッグ用）
    print(f"deals: {len(deals)}")
    print(f"skipped: {skipped}")
    print(f"rows: {len(all_rows)}")
    print(f"partners cached: {len(partners_cache)}")
    print(f"account_items cached: {len(account_items_cache)}")

    return ctx
