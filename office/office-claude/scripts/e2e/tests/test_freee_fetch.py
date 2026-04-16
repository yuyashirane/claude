"""Phase 6.7 freee_fetch.py のユニットテスト。

対象: scripts/e2e/freee_fetch.py の4つのヘルパー関数
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# freee_fetch のインポート
_E2E_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_E2E_DIR.parent.parent))  # PROJECT_ROOT を sys.path に追加

from scripts.e2e.freee_fetch import (
    merge_deals_pages,
    normalize_partners,
    save_json,
    validate_completeness,
)


# ─────────────────────────────────────────────────────────────
# テスト 1〜4: merge_deals_pages
# ─────────────────────────────────────────────────────────────

class TestMergeDealsPages:
    """merge_deals_pages の4テスト。"""

    def _make_page(self, deals: list[dict], total_count: int) -> dict:
        return {"deals": deals, "meta": {"total_count": total_count}}

    def _make_deal(self, deal_id: int) -> dict:
        return {"id": deal_id, "issue_date": "2025-12-01", "details": []}

    def test_three_pages_merged(self):
        """3 ページをマージ → 全 deals が連結される。"""
        page1 = self._make_page([self._make_deal(1), self._make_deal(2)], 5)
        page2 = self._make_page([self._make_deal(3), self._make_deal(4)], 5)
        page3 = self._make_page([self._make_deal(5)], 5)

        result = merge_deals_pages([page1, page2, page3])

        assert len(result["deals"]) == 5
        assert result["meta"]["total_count"] == 5
        ids = [d["id"] for d in result["deals"]]
        assert ids == [1, 2, 3, 4, 5]

    def test_single_page_returns_as_is(self):
        """1 ページのみ → そのまま返る。"""
        page = self._make_page([self._make_deal(1), self._make_deal(2)], 2)

        result = merge_deals_pages([page])

        assert len(result["deals"]) == 2
        assert result["meta"]["total_count"] == 2

    def test_total_count_mismatch_raises_value_error(self):
        """total_count と実数が一致しない → ValueError。"""
        page1 = self._make_page([self._make_deal(1)], 3)  # total_count=3 だが実際は 1 件
        page2 = self._make_page([self._make_deal(2)], 3)  # 合計 2 件

        with pytest.raises(ValueError, match="total_count"):
            merge_deals_pages([page1, page2])

    def test_empty_pages_raises_value_error(self):
        """pages=[] → ValueError。"""
        with pytest.raises(ValueError, match="空"):
            merge_deals_pages([])


# ─────────────────────────────────────────────────────────────
# テスト 5〜8: normalize_partners
# ─────────────────────────────────────────────────────────────

class TestNormalizePartners:
    """normalize_partners の4テスト。"""

    def _make_page(self, count: int, start_id: int = 1) -> dict:
        return {
            "partners": [
                {"id": start_id + i, "name": f"取引先{start_id + i}"}
                for i in range(count)
            ]
        }

    def test_three_pages_merged(self):
        """3 ページ(100 + 100 + 55)→ 255 件の配列。"""
        page1 = self._make_page(100, 1)
        page2 = self._make_page(100, 101)
        page3 = self._make_page(55, 201)

        result = normalize_partners([page1, page2, page3])

        assert len(result) == 255
        assert result[0]["id"] == 1
        assert result[-1]["id"] == 255

    def test_one_page_with_empty_page(self):
        """1 ページ + 空ページ → そのまま返る。"""
        page1 = self._make_page(3, 1)
        empty_page = {"partners": []}

        result = normalize_partners([page1, empty_page])

        assert len(result) == 3

    def test_only_empty_page_returns_empty_list(self):
        """空ページのみ → 空配列。"""
        empty_page = {"partners": []}

        result = normalize_partners([empty_page])

        assert result == []

    def test_missing_partners_key_raises_value_error(self):
        """ページに "partners" キーがない → ValueError。"""
        bad_page = {"data": [{"id": 1}]}

        with pytest.raises(ValueError, match="partners"):
            normalize_partners([bad_page])


# ─────────────────────────────────────────────────────────────
# テスト 9〜12: save_json
# ─────────────────────────────────────────────────────────────

class TestSaveJson:
    """save_json の4テスト。"""

    def test_normal_save(self, tmp_path):
        """通常保存 → ファイル生成 + 内容一致。"""
        data = {"key": "value", "num": 42}
        path = tmp_path / "test.json"

        save_json(data, path)

        assert path.exists()
        with open(path, encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded == data

    def test_auto_create_parent_directory(self, tmp_path):
        """親ディレクトリが存在しない → 自動作成される。"""
        data = {"test": True}
        path = tmp_path / "deep" / "nested" / "dir" / "output.json"

        save_json(data, path)

        assert path.exists()
        with open(path, encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded == data

    def test_overwrite_existing_file(self, tmp_path):
        """既存ファイルを上書き → 新内容に置き換わる。"""
        path = tmp_path / "overwrite.json"
        save_json({"old": "data"}, path)
        save_json({"new": "data"}, path)

        with open(path, encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded == {"new": "data"}

    def test_kanji_saved_as_utf8(self, tmp_path):
        """漢字を含む data → UTF-8 で正しく保存される(読み戻して元データと一致)。"""
        data = {
            "account_items": [
                {"id": 101, "name": "売上高"},
                {"id": 102, "name": "旅費交通費"},
                {"id": 103, "name": "消耗品費"},
            ]
        }
        path = tmp_path / "kanji.json"

        save_json(data, path)

        # バイナリで開いて UTF-8 であることを確認
        raw = path.read_bytes()
        decoded = raw.decode("utf-8")
        loaded = json.loads(decoded)
        assert loaded == data
        # ensure_ascii=False なので漢字がそのまま入っている
        assert "売上高" in decoded
        assert r"\u" not in decoded  # \uXXXX エスケープになっていない


# ─────────────────────────────────────────────────────────────
# テスト 13〜16: validate_completeness
# ─────────────────────────────────────────────────────────────

class TestValidateCompleteness:
    """validate_completeness の4テスト。"""

    def _make_deals_json(self, deals: list[dict]) -> dict:
        return {"deals": deals, "meta": {"total_count": len(deals)}}

    def _make_deal(
        self,
        deal_id: int,
        issue_date: str = "2025-12-15",
        details: list | None = None,
        partner_id: int | None = 201,
    ) -> dict:
        return {
            "id": deal_id,
            "issue_date": issue_date,
            "details": details if details is not None else [{"id": 9000 + deal_id}],
            "partner_id": partner_id,
        }

    def test_normal_case_no_warnings(self):
        """正常ケース → warnings=[], 各カウント正確。"""
        deals = [
            self._make_deal(1, "2025-12-01"),
            self._make_deal(2, "2025-12-15"),
            self._make_deal(3, "2025-12-31"),
        ]
        result = validate_completeness(self._make_deals_json(deals))

        assert result["total"] == 3
        assert result["issue_date_min"] == "2025-12-01"
        assert result["issue_date_max"] == "2025-12-31"
        assert result["details_empty_count"] == 0
        assert result["partner_id_null_count"] == 0
        assert result["warnings"] == []

    def test_empty_details_counted(self):
        """details 空の deal が混ざる → details_empty_count が正しい。"""
        deals = [
            self._make_deal(1, details=[{"id": 9001}]),  # details あり
            self._make_deal(2, details=[]),              # details 空
            # details=None を直接セット(_make_deal は None を非空デフォルトに変換するため)
            {
                "id": 3,
                "issue_date": "2025-12-15",
                "details": None,
                "partner_id": 201,
            },
        ]
        result = validate_completeness(self._make_deals_json(deals))

        assert result["details_empty_count"] == 2
        assert result["warnings"] == []

    def test_partner_id_null_counted(self):
        """partner_id=null が混ざる → partner_id_null_count が正しい。"""
        deals = [
            self._make_deal(1, partner_id=201),
            self._make_deal(2, partner_id=None),
            self._make_deal(3, partner_id=None),
        ]
        result = validate_completeness(self._make_deals_json(deals))

        assert result["partner_id_null_count"] == 2
        assert result["warnings"] == []

    def test_expected_count_mismatch_in_warnings(self):
        """expected_count 不一致 → warnings に件数不一致が入る。"""
        deals = [self._make_deal(1), self._make_deal(2)]
        result = validate_completeness(
            self._make_deals_json(deals),
            expected_count=5,
        )

        assert result["total"] == 2
        assert len(result["warnings"]) >= 1
        assert any("件数不一致" in w for w in result["warnings"])
