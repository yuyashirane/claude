"""Phase 6.5 adapter のユニットテスト。

対象: scripts/e2e/freee_to_context.py の5つの純粋関数
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path

import pytest

# ── adapter のインポート
_E2E_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_E2E_DIR.parent.parent))  # PROJECT_ROOT を sys.path に追加

from scripts.e2e.freee_to_context import (
    build_check_context,
    resolve_account_name,
    resolve_partner_name,
    split_entry_side,
    transform_deal_to_rows,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ─────────────────────────────────────────────────────────────
# テスト 1〜3: resolve_partner_name
# ─────────────────────────────────────────────────────────────

class TestResolvePartnerName:
    """resolve_partner_name の3テスト。"""

    def test_known_id_returns_name(self):
        """既知 partner_id → 正しい partner_name を返す。"""
        cache = {201: "株式会社テスト商事", 202: "合同会社サンプル"}
        assert resolve_partner_name(201, cache) == "株式会社テスト商事"

    def test_none_returns_empty_string(self):
        """partner_id=None → 空文字を返す（null は "" で統一）。"""
        cache = {201: "株式会社テスト商事"}
        assert resolve_partner_name(None, cache) == ""

    def test_unknown_id_returns_empty_string(self):
        """未知 partner_id → 空文字を返す（エラーにしない）。"""
        cache = {201: "株式会社テスト商事"}
        assert resolve_partner_name(9999, cache) == ""


# ─────────────────────────────────────────────────────────────
# テスト 4〜5: resolve_account_name
# ─────────────────────────────────────────────────────────────

class TestResolveAccountName:
    """resolve_account_name の2テスト。"""

    def test_known_id_returns_name(self):
        """既知 account_item_id → 正しい account_name を返す。"""
        cache = {101: "売上高", 102: "旅費交通費"}
        assert resolve_account_name(101, cache) == "売上高"

    def test_unknown_id_returns_empty_string(self):
        """未知 account_item_id → 空文字を返す（エラーにしない）。"""
        cache = {101: "売上高"}
        assert resolve_account_name(9999, cache) == ""


# ─────────────────────────────────────────────────────────────
# テスト 6〜8: split_entry_side
# ─────────────────────────────────────────────────────────────

class TestSplitEntrySide:
    """split_entry_side の3テスト。"""

    def test_debit_returns_debit_amount(self):
        """entry_side="debit" → (amount, 0)。"""
        debit, credit = split_entry_side("debit", Decimal("20000"))
        assert debit == Decimal("20000")
        assert credit == Decimal("0")

    def test_credit_returns_credit_amount(self):
        """entry_side="credit" → (0, amount)。"""
        debit, credit = split_entry_side("credit", Decimal("50000"))
        assert debit == Decimal("0")
        assert credit == Decimal("50000")

    def test_invalid_entry_side_raises_value_error(self):
        """不正な entry_side → ValueError を raise する。"""
        with pytest.raises(ValueError, match="entry_side"):
            split_entry_side("invalid", Decimal("1000"))


# ─────────────────────────────────────────────────────────────
# テスト 9〜13: transform_deal_to_rows
# ─────────────────────────────────────────────────────────────

class TestTransformDealToRows:
    """transform_deal_to_rows の5テスト。"""

    @pytest.fixture
    def partners_cache(self):
        return {201: "株式会社テスト商事", 202: "合同会社サンプル"}

    @pytest.fixture
    def account_items_cache(self):
        return {101: "売上高", 102: "旅費交通費", 103: "消耗品費"}

    def test_single_detail_returns_one_row(self, partners_cache, account_items_cache):
        """1 detail の deal → 1 row を返す。"""
        with open(FIXTURES_DIR / "sample_deal_single.json", encoding="utf-8") as f:
            data = json.load(f)
        deal = data["deals"][0]

        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)

        assert len(rows) == 1
        row = rows[0]
        assert row.wallet_txn_id == "9001"
        assert row.deal_id == "1001"
        assert str(row.transaction_date) == "2025-12-15"
        assert row.account == "売上高"
        assert row.tax_label == "129"
        assert row.partner == "株式会社テスト商事"
        assert row.description == "12月売上"
        assert row.debit_amount == Decimal("0")
        assert row.credit_amount == Decimal("50000")

    def test_multi_details_returns_multiple_rows_with_same_partner(
        self, partners_cache, account_items_cache
    ):
        """3 details の deal → 全 row が同じ partner_name を持つ。"""
        with open(FIXTURES_DIR / "sample_deal_multi_details.json", encoding="utf-8") as f:
            data = json.load(f)
        deal = data["deals"][0]

        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)

        assert len(rows) == 2
        # 全行で partner が共通（deal レベルの partner_id から解決）
        assert all(r.partner == "合同会社サンプル" for r in rows)
        # 1行目: 旅費交通費 debit 20000
        assert rows[0].account == "旅費交通費"
        assert rows[0].debit_amount == Decimal("20000")
        assert rows[0].credit_amount == Decimal("0")
        # 2行目: 消耗品費 debit 10000
        assert rows[1].account == "消耗品費"
        assert rows[1].debit_amount == Decimal("10000")

    def test_partner_id_null_returns_empty_partner(
        self, partners_cache, account_items_cache
    ):
        """partner_id=null の deal → row の partner が ""。"""
        with open(FIXTURES_DIR / "sample_deal_partner_null.json", encoding="utf-8") as f:
            data = json.load(f)
        deal = data["deals"][0]

        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)

        assert len(rows) == 1
        assert rows[0].partner == ""

    def test_empty_details_returns_empty_list(self, partners_cache, account_items_cache):
        """details=[] の deal → 空リスト [] を返す（例外を投げない）。"""
        with open(FIXTURES_DIR / "sample_deal_empty_details.json", encoding="utf-8") as f:
            data = json.load(f)
        deal = data["deals"][0]

        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)

        assert rows == []

    def test_null_details_returns_empty_list(self, partners_cache, account_items_cache):
        """details=null の deal → 空リスト [] を返す（例外を投げない）。"""
        deal = {
            "id": 1099,
            "issue_date": "2025-12-01",
            "partner_id": 201,
            "details": None,
        }
        rows = transform_deal_to_rows(deal, partners_cache, account_items_cache)
        assert rows == []


# ─────────────────────────────────────────────────────────────
# テスト 14〜18: build_check_context
# ─────────────────────────────────────────────────────────────

class TestBuildCheckContext:
    """build_check_context の5テスト。"""

    @pytest.fixture
    def all_paths(self, tmp_path):
        """正常ケース: 4ファイルをすべて tmp_path にコピーして返す。"""
        import shutil
        for fname in [
            "sample_deal_single.json",
            "sample_partners.json",
            "sample_account_items.json",
            "sample_company_info.json",
        ]:
            shutil.copy(FIXTURES_DIR / fname, tmp_path / fname)
        return {
            "deals": tmp_path / "sample_deal_single.json",
            "partners": tmp_path / "sample_partners.json",
            "account_items": tmp_path / "sample_account_items.json",
            "company_info": tmp_path / "sample_company_info.json",
        }

    def test_normal_case_returns_check_context(self, all_paths, capsys):
        """正常ケース: 4ファイル揃っている → CheckContext が組み上がる。"""
        ctx = build_check_context(
            all_paths["deals"],
            all_paths["partners"],
            all_paths["account_items"],
            all_paths["company_info"],
        )

        assert ctx.company_id == "3525430"
        assert ctx.fiscal_year_id == "9842248"
        assert str(ctx.period_start) == "2025-04-01"
        assert str(ctx.period_end) == "2026-03-31"
        assert len(ctx.transactions) == 1

        # 観測ログの確認
        captured = capsys.readouterr()
        assert "deals: 1" in captured.out
        assert "skipped: 0" in captured.out
        assert "rows: 1" in captured.out
        assert "partners cached: 3" in captured.out
        assert "account_items cached: 3" in captured.out

    def test_missing_deals_file_raises_file_not_found(self, all_paths):
        """deals_path が存在しない → FileNotFoundError（"deals" を含むメッセージ）。"""
        with pytest.raises(FileNotFoundError, match="deals"):
            build_check_context(
                Path("/nonexistent/deals.json"),
                all_paths["partners"],
                all_paths["account_items"],
                all_paths["company_info"],
            )

    def test_empty_partners_cache_still_builds_context(self, all_paths, tmp_path, capsys):
        """partners が空 → CheckContext は組み上がるが partner は全行 ""。"""
        # 空の partners JSON を作成
        empty_partners = tmp_path / "empty_partners.json"
        empty_partners.write_text('[]', encoding="utf-8")

        ctx = build_check_context(
            all_paths["deals"],
            empty_partners,
            all_paths["account_items"],
            all_paths["company_info"],
        )

        assert len(ctx.transactions) == 1
        assert ctx.transactions[0].partner == ""

    def test_empty_deals_returns_empty_transactions(self, all_paths, tmp_path, capsys):
        """deals が空配列 → CheckContext.transactions が空リスト。"""
        empty_deals = tmp_path / "empty_deals.json"
        empty_deals.write_text('{"deals": [], "meta": {"total_count": 0}}', encoding="utf-8")

        ctx = build_check_context(
            empty_deals,
            all_paths["partners"],
            all_paths["account_items"],
            all_paths["company_info"],
        )

        assert ctx.transactions == []

        captured = capsys.readouterr()
        assert "deals: 0" in captured.out
        assert "rows: 0" in captured.out

    def test_mixed_deals_skips_empty_details(self, all_paths, tmp_path, capsys):
        """details=[] の deal が混在 → その deal はスキップ、他は正常処理。"""
        # deal 2件: 1件は details あり、1件は details=[]
        mixed_deals = {
            "deals": [
                {
                    "id": 2001,
                    "issue_date": "2025-12-01",
                    "partner_id": 201,
                    "details": [
                        {
                            "id": 8001,
                            "account_item_id": 101,
                            "tax_code": 129,
                            "amount": 10000,
                            "vat": 909,
                            "description": "正常な deal",
                            "entry_side": "credit",
                        }
                    ],
                },
                {
                    "id": 2002,
                    "issue_date": "2025-12-02",
                    "partner_id": 202,
                    "details": [],  # ← スキップされるべき
                },
            ],
            "meta": {"total_count": 2},
        }
        mixed_path = tmp_path / "mixed_deals.json"
        mixed_path.write_text(json.dumps(mixed_deals), encoding="utf-8")

        ctx = build_check_context(
            mixed_path,
            all_paths["partners"],
            all_paths["account_items"],
            all_paths["company_info"],
        )

        # 正常な deal(1件)のみ → rows は1行
        assert len(ctx.transactions) == 1
        assert ctx.transactions[0].wallet_txn_id == "8001"

        captured = capsys.readouterr()
        assert "deals: 2" in captured.out
        assert "skipped: 1" in captured.out
        assert "rows: 1" in captured.out
