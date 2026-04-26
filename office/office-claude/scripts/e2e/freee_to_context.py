"""Phase 6.5/6.10/Step 3-A: freee JSON → CheckContext Adapter（最小版）。

入力: Claude Code が事前保存した JSON ファイル（必須5 + オプショナル1）
    - deals_YYYY-MM_to_YYYY-MM.json    期間取引（ページネーション済み統合版）
    - partners_all.json                全取引先マスタ
    - account_items_all.json           全勘定科目マスタ
    - company_info.json                会社基本情報
    - taxes_codes.json                 freee 税区分マスタ（Phase 6.10 追加）
    - manual_journals_YYYY-MM_to_YYYY-MM.json  振替伝票（Step 3-A 追加、オプショナル）

出力: CheckContext（deals + manual_journals の行レベルに展開済み）

対応範囲: deals + manual_journals（wallet_txns / journals は非対応）

設計原則:
    - freee API を直接叩かない（JSON 読み込みのみ）
    - partner_id=null は空文字 "" で統一
    - details が空/null/欠落の deal は例外なしでスキップ
    - amount は常に Decimal（float は使わない）
    - tax_code は details[].tax_code を正とし、account_items の tax_code は使わない
    - tax_label は name_ja（例: "課対仕入10%"）、未知コードは str(code) にフォールバック
    - tax_label は空文字にしない（name_ja or str(code) を必ず格納）
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
    code_to_name_ja: dict[int, str] | None = None,
    items_cache: dict[int, str] | None = None,
    sections_cache: dict[int, str] | None = None,
    tags_cache: dict[int, str] | None = None,
) -> list:
    """1 deal を details[] を展開して TransactionRow リストに変換する。

    - partner_name は deal レベルで解決（全 details 行で共通）
    - partner_id が null の場合、partner_name は ""
    - account_name は details 行ごとに解決
    - debit_amount / credit_amount は entry_side から算出
    - date は deal.issue_date を全 details 行に付与
    - details が空配列 / null / キー欠落の場合は空リスト [] を返す（例外禁止）
    - tax_label: code_to_name_ja が与えられた場合は name_ja に変換
                 マスタに無い未知コードは str(tax_code) にフォールバック（空文字禁止）
    - Phase C-1 クラスタ B: detail.item_id / section_id / tag_ids を items/sections/tags
      キャッシュで名称解決し、TransactionRow.item / section / memo_tag に格納。
      キャッシュ未指定または ID が null/未知の場合は None。

    Args:
        deal: freee deals API の1取引レスポンス dict。
        partners_cache: {partner_id: partner_name}。
        account_items_cache: {account_item_id: account_name}。
        code_to_name_ja: {tax_code(int): name_ja(str)} の逆引き dict（Phase 6.10 追加）。
                         None の場合は従来どおり str(tax_code) を使用。
        items_cache: {item_id: item_name} の辞書。Phase C-1 クラスタ B 追加。
        sections_cache: {section_id: section_name} の辞書。Phase C-1 クラスタ B 追加。
        tags_cache: {tag_id: tag_name} の辞書。Phase C-1 クラスタ B 追加。

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

    # ── 逆引き dict が無い場合は空 dict（str フォールバックのみで動作）
    _code_to_name = code_to_name_ja if code_to_name_ja is not None else {}
    _items = items_cache or {}
    _sections = sections_cache or {}
    _tags = tags_cache or {}

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

        # tax_label: name_ja に変換。未知コードは str フォールバック（空文字禁止）
        tax_label = _code_to_name.get(tax_code, str(tax_code))

        # Phase C-1 クラスタ B: item / section / memo_tag を ID → 名称解決
        item_id = detail.get("item_id")
        item_name = _items.get(item_id) if item_id is not None else None
        item_value = item_name or None  # 空文字も None に揃える

        section_id = detail.get("section_id")
        section_name = _sections.get(section_id) if section_id is not None else None
        section_value = section_name or None

        tag_ids = detail.get("tag_ids") or []
        tag_names = [_tags[tid] for tid in tag_ids if tid in _tags and _tags[tid]]
        memo_value = "、".join(tag_names) if tag_names else None

        row = TransactionRow(
            wallet_txn_id=wallet_txn_id,
            deal_id=deal_id,
            transaction_date=transaction_date,
            account=account_name,           # account_name → account フィールド
            tax_label=tax_label,            # name_ja または str(tax_code) フォールバック
            partner=partner_name,           # partner_name → partner フィールド
            description=description,
            debit_amount=debit_amount,
            credit_amount=credit_amount,
            item=item_value,
            section=section_value,
            memo_tag=memo_value,
            raw={                           # 元データ保持（デバッグ用、非スキーマフィールドもここに）
                "deal_id": deal["id"],
                "row_id": detail["id"],
                "account_item_id": account_item_id,
                "partner_id": partner_id,
                "entry_side": entry_side,
                "tax_code": tax_code,
                "amount": raw_amount,
                "vat": detail.get("vat"),
                "item_id": item_id,
                "section_id": section_id,
                "tag_ids": tag_ids,
            },
        )
        rows.append(row)

    return rows


# ─────────────────────────────────────────────────────────────
# 純粋関数 4-b: transform_journal_to_rows（Step 3-A 追加）
# ─────────────────────────────────────────────────────────────

def transform_journal_to_rows(
    journal: dict,
    partners_cache: dict[int, str],
    account_items_cache: dict[int, str],
    code_to_name_ja: dict[int, str] | None = None,
) -> list:
    """1 manual_journal を details[] を展開して TransactionRow リストに変換する。

    deals との主な差異:
        - partner_id は details レベルに存在（deals は deal レベル共通）
        - partner_name はレスポンスに含まれることがある（detail.partner_name）
        - account_name は details 行ごとに account_items_cache から解決
        - deal_id 相当は無いため row.deal_id は None
        - raw["source"] = "manual_journal" を必ず付与（deals 由来との区別用）
        - raw["manual_journal_id"] に journal.id を保持

    Args:
        journal: freee manual_journals API の 1 レスポンス dict。
        partners_cache: {partner_id: partner_name}。
        account_items_cache: {account_item_id: account_name}。
        code_to_name_ja: {tax_code(int): name_ja(str)} の逆引き dict。

    Returns:
        TransactionRow のリスト。details が空/欠落の場合は空リスト []。
    """
    # ── details の取得（空/null/欠落すべて空リストとして扱う）
    details = journal.get("details") or []
    if not details:
        return []

    # ── journal レベルで共通の情報
    journal_id = journal["id"]
    issue_date_str = journal.get("issue_date", "")
    try:
        transaction_date = date.fromisoformat(issue_date_str)
    except (ValueError, TypeError):
        transaction_date = None

    _code_to_name = code_to_name_ja if code_to_name_ja is not None else {}

    rows = []
    for detail in details:
        wallet_txn_id = str(detail["id"])
        account_item_id = detail["account_item_id"]
        account_name = resolve_account_name(account_item_id, account_items_cache)
        tax_code = detail.get("tax_code", 0)
        description = detail.get("description", "")
        entry_side = detail["entry_side"]

        # partner_id は detail レベル
        partner_id = detail.get("partner_id")
        # partner_name: レスポンス値を優先、空ならキャッシュ逆引き、それでも空なら ""
        resp_partner_name = detail.get("partner_name") or ""
        if resp_partner_name:
            partner_name = resp_partner_name
        else:
            partner_name = resolve_partner_name(partner_id, partners_cache)

        raw_amount = detail.get("amount", 0)
        amount = Decimal(str(raw_amount))
        debit_amount, credit_amount = split_entry_side(entry_side, amount)

        tax_label = _code_to_name.get(tax_code, str(tax_code))

        item_name = detail.get("item_name", "")
        tag_names = detail.get("tag_names") or []

        row = TransactionRow(
            wallet_txn_id=wallet_txn_id,
            deal_id=None,                   # manual_journal には deal_id 無し
            transaction_date=transaction_date,
            account=account_name,
            tax_label=tax_label,
            partner=partner_name,
            description=description,
            debit_amount=debit_amount,
            credit_amount=credit_amount,
            item=item_name or None,
            memo_tag="、".join(tag_names) if tag_names else None,
            notes=None,
            raw={
                "source": "manual_journal",  # deals 由来との識別子
                "manual_journal_id": journal_id,
                "row_id": detail["id"],
                "account_item_id": account_item_id,
                "partner_id": partner_id,
                "entry_side": entry_side,
                "tax_code": tax_code,
                "amount": raw_amount,
                "vat": detail.get("vat"),
                "adjustment": journal.get("adjustment"),
                "txn_number": journal.get("txn_number"),
                "section_id": detail.get("section_id"),
                "section_name": detail.get("section_name"),
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
    taxes_codes_path: Path,
    manual_journals_path: Path | None = None,
    items_path: Path | None = None,
    sections_path: Path | None = None,
    tags_path: Path | None = None,
) -> object:
    """5 つの JSON ファイルから CheckContext を組み立てる。

    処理フロー:
    1. 全 JSON ファイルを読み込み（欠落は FileNotFoundError）
    2. partners / account_items / taxes_codes を dict 化してキャッシュ生成
    3. deals を展開して TransactionRow リストを構築（details 空/欠落はスキップ）
    4. company_info から company_id / fiscal_year_id 等を取得
    5. CheckContext を組み立てて返す（tax_code_master も含む）
    6. 観測用ログを stdout に print（E2E デバッグ用）

    Args:
        deals_path: deals JSON のパス。
        partners_path: partners JSON のパス。
        account_items_path: account_items JSON のパス。
        company_info_path: company_info JSON のパス。
        taxes_codes_path: taxes_codes JSON のパス（Phase 6.10 追加）。
        manual_journals_path: manual_journals JSON のパス（Step 3-A 追加、オプショナル）。
            None または存在しないファイルの場合は manual_journals 合流をスキップ。

    Returns:
        組み立て済みの CheckContext（tax_code_master 含む）。

    Raises:
        FileNotFoundError: 必須ファイルが存在しない場合。
        ValueError: JSON 構造が期待と異なる場合。
    """
    # ── 1. JSON ファイル読み込み
    def _load_json(path: Path, role: str):
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
    taxes_codes_data = _load_json(taxes_codes_path, "taxes_codes")

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

    # taxes_codes_data は §1.1 に従い配列直下形式 [...] で受け取る（Phase 6.10）
    if not isinstance(taxes_codes_data, list):
        raise ValueError(
            "taxes_codes.json must be a JSON array per spec §1.1 "
            f"(actual type: {type(taxes_codes_data).__name__})"
        )

    # tax_code_master: {name_ja: str(code)}（schema.py の dict[str, str] に準拠）
    # name_ja が欠落している要素は silently skip
    tax_code_master: dict[str, str] = {
        t["name_ja"]: str(t["code"])
        for t in taxes_codes_data
        if "name_ja" in t and "code" in t
    }
    _taxes_skipped = len(taxes_codes_data) - len(tax_code_master)

    # code_to_name_ja: {int(code): name_ja} の逆引き（transform_deal_to_rows 用）
    code_to_name_ja: dict[int, str] = {
        int(v): k
        for k, v in tax_code_master.items()
    }

    # ── 2.5 items / sections / tags キャッシュ（Phase C-1 クラスタ B 追加、オプショナル）
    def _build_id_name_cache(path: Path | None, role: str) -> dict[int, str]:
        if path is None or not Path(path).exists():
            return {}
        data = _load_json(Path(path), role)
        if not isinstance(data, list):
            raise ValueError(
                f"{role} JSON must be a JSON array per spec §1.1 "
                f"(actual type: {type(data).__name__})"
            )
        return {
            entry["id"]: entry.get("name", "")
            for entry in data
            if "id" in entry
        }

    items_cache = _build_id_name_cache(items_path, "items")
    sections_cache = _build_id_name_cache(sections_path, "sections")
    tags_cache = _build_id_name_cache(tags_path, "tags")

    # ── 3. deals を展開して TransactionRow リスト構築
    deals = deals_data.get("deals", [])
    all_rows = []
    skipped = 0
    fallback_count = 0

    for deal in deals:
        rows = transform_deal_to_rows(
            deal,
            partners_cache,
            account_items_cache,
            code_to_name_ja,
            items_cache=items_cache,
            sections_cache=sections_cache,
            tags_cache=tags_cache,
        )
        if not rows:
            skipped += 1
        else:
            # フォールバック件数を計算（tax_label が数値文字列のもの）
            for row in rows:
                raw_tc = row.raw.get("tax_code", 0)
                if row.tax_label == str(raw_tc):
                    # name_ja に変換できなかった（フォールバック）
                    fallback_count += 1
            all_rows.extend(rows)

    # ── 3.5. manual_journals を展開して TransactionRow に追加（Step 3-A）
    mj_total = 0
    mj_rows_added = 0
    mj_skipped = 0
    mj_loaded = False
    if manual_journals_path is not None and Path(manual_journals_path).exists():
        manual_journals_data = _load_json(manual_journals_path, "manual_journals")
        if not isinstance(manual_journals_data, dict):
            raise ValueError(
                "manual_journals.json must be a JSON object with 'manual_journals' key "
                f"(actual type: {type(manual_journals_data).__name__})"
            )
        manual_journals = manual_journals_data.get("manual_journals", [])
        mj_total = len(manual_journals)
        mj_loaded = True
        for journal in manual_journals:
            rows = transform_journal_to_rows(
                journal, partners_cache, account_items_cache, code_to_name_ja
            )
            if not rows:
                mj_skipped += 1
            else:
                for row in rows:
                    raw_tc = row.raw.get("tax_code", 0)
                    if row.tax_label == str(raw_tc):
                        fallback_count += 1
                all_rows.extend(rows)
                mj_rows_added += len(rows)

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

    # ── 5. CheckContext 組み立て（tax_code_master を含む）
    ctx = CheckContext(
        company_id=company_id,
        fiscal_year_id=fiscal_year_id,
        period_start=period_start,
        period_end=period_end,
        transactions=all_rows,
        tax_code_master=tax_code_master,
        company_name=company_data["company_name"],   # Phase 6.11b: レポート表示用
    )

    # ── 6. 観測用ログ（E2E デバッグ用）
    print(f"deals: {len(deals)}")
    print(f"skipped: {skipped}")
    print(f"rows: {len(all_rows)}")
    print(f"partners cached: {len(partners_cache)}")
    print(f"account_items cached: {len(account_items_cache)}")
    print(f"tax_codes cached: {len(tax_code_master)}")
    if _taxes_skipped > 0:
        print(f"tax_codes skipped (no name_ja): {_taxes_skipped}")
    if fallback_count > 0:
        print(f"tax_label fallback (unknown codes): {fallback_count}")
    if mj_loaded:
        print(f"manual_journals: {mj_total}")
        print(f"manual_journals skipped: {mj_skipped}")
        print(f"manual_journals rows: {mj_rows_added}")
    if items_cache:
        print(f"items cached: {len(items_cache)}")
    if sections_cache:
        print(f"sections cached: {len(sections_cache)}")
    if tags_cache:
        print(f"tags cached: {len(tags_cache)}")

    return ctx
