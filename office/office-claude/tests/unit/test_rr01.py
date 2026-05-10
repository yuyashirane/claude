"""V1-3-11 RR-01 (軽減税率 8% 漏れ主検出) のユニットテスト。

3 サブタイプ (RR-01a/b/c) + 全体動作を網羅:
    RR-01a: 新聞図書費 + 標準10% + (新聞 KW or ¥200×コンビニ)
    RR-01b: 会議費系 + 標準10% + 強食品 KW
    RR-01c: その他関連科目 + 標準10% + 弱食品 KW

import 戦略 (重要):
    V1-3-11 は `checks/` サブパッケージ名が V1-3-10 と衝突するため、
    importlib で独立した sys.modules キー (v1_3_11_rr01_test) でロードする。
    これは V1-3-11 checker.py の本番ロード戦略と同等。
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path


# ─────────────────────────────────────────────────────────────
# rr01_missing_reduced のロード (importlib 経由、checks/ 衝突回避)
# ─────────────────────────────────────────────────────────────

_RR01_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-reduced-tax-rate"
    / "checks" / "rr01_missing_reduced.py"
)


def _load_rr01():
    mod_key = "v1_3_11_rr01_test"
    if mod_key in sys.modules:
        return sys.modules[mod_key]
    spec = importlib.util.spec_from_file_location(mod_key, _RR01_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_RR01_PATH}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_key] = mod
    spec.loader.exec_module(mod)
    return mod


# ─────────────────────────────────────────────────────────────
# CheckContext factory (RR-01 用)
# ─────────────────────────────────────────────────────────────

def _make_ctx(schema, rows):
    """RR-01 テスト用の CheckContext。仕入系の税区分を登録。"""
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "課対仕入8%(軽)": "163",
            "課対仕入(控80)10%": "189",
            "課対仕入(控50)10%": "190",
            "対象外": "2",
            "課対仕入8%": "108",  # 経過措置 (旧8%)
        },
    )


# ═════════════════════════════════════════════════════════════
# RR-01a: 新聞図書費 + 標準10% + 新聞 KW / コンビニ ¥200
# ═════════════════════════════════════════════════════════════

class TestRR01a:
    """新聞図書費 (10%) で軽減税率漏れの可能性を検出。"""

    def test_positive_newspaper_keyword(self, schema, make_row_factory):
        """摘要に「日経新聞」KW あり → RR-01a (conf=85) 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="日経新聞 12月分", partner="",
            debit_amount=4000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.tc_code == "V1-3-11"
        assert f.sub_code == "RR-01a"
        assert f.severity == "🔴 Critical"
        assert f.error_type == "direct_error"
        assert f.area == "A10"
        assert f.confidence == 85
        assert "日経" in f.message or "新聞" in f.message

    def test_positive_subscription_keyword(self, schema, make_row_factory):
        """摘要に「定期購読」あり → RR-01a 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="月刊誌 定期購読料",
            debit_amount=3000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01a"

    def test_positive_convenience_low_amount(self, schema, make_row_factory):
        """コンビニ partner + ¥200 (低額) → RR-01a (conf=75、新聞推定)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="", partner="ローソン",
            debit_amount=200, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.sub_code == "RR-01a"
        assert f.confidence == 75
        assert "コンビニ" in f.message

    def test_positive_convenience_in_description(self, schema, make_row_factory):
        """description にコンビニ名 + 低額 → RR-01a (実データに多いパターン)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="セブンイレブン",
            debit_amount=200, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01a"

    def test_negative_book_purchase(self, schema, make_row_factory):
        """書籍購入 (高額、新聞 KW なし) → 検出なし (書籍は標準10%)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="蔦屋書店", partner="蔦屋書店",
            debit_amount=3300, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_already_reduced(self, schema, make_row_factory):
        """既に軽減税率 8% で計上 → 検出不要。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入8%(軽)",
            description="日経新聞",
            debit_amount=4000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_high_amount_convenience(self, schema, make_row_factory):
        """コンビニ + 高額 (¥1000、新聞でない) → 検出なし。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="", partner="ローソン",
            debit_amount=1000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_no_kw_no_partner(self, schema, make_row_factory):
        """何もマッチしない → 検出なし (false positive 抑制)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="図書購入", partner="",
            debit_amount=2000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []


# ═════════════════════════════════════════════════════════════
# RR-01b: 会議費/福利厚生費/接待交際費 + 標準10% + 強食品 KW
# ═════════════════════════════════════════════════════════════

class TestRR01b:
    """会議費系 (10%) で強食品 KW あり → 軽減税率漏れ検出。"""

    def test_positive_meeting_bento(self, schema, make_row_factory):
        """会議費 + 「弁当」→ RR-01b (conf=80) 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入10%",
            description="会議用 弁当代",
            debit_amount=1500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.tc_code == "V1-3-11"
        assert f.sub_code == "RR-01b"
        assert f.severity == "🔴 Critical"
        assert f.confidence == 80
        assert f.area == "A10"
        assert "弁当" in f.message

    def test_positive_welfare_takeout(self, schema, make_row_factory):
        """福利厚生費 + 「テイクアウト」→ RR-01b 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="社員昼食 テイクアウト",
            debit_amount=2400, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01b"

    def test_positive_entertainment_food(self, schema, make_row_factory):
        """接待交際費 + 「食料品」→ RR-01b 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="接待交際費", tax_label="課対仕入10%",
            description="差し入れ食料品",
            debit_amount=5000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01b"

    def test_positive_meeting_sashiire(self, schema, make_row_factory):
        """会議費 + 「差入」→ RR-01b 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入10%",
            description="差入用 お土産",
            debit_amount=3000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01b"

    def test_negative_no_food_keyword(self, schema, make_row_factory):
        """会議費 + 食品 KW なし → 検出なし (会議室レンタル等は標準10% 正)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入10%",
            description="会議室レンタル",
            debit_amount=10000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_weak_keyword_only(self, schema, make_row_factory):
        """会議費 + 弱 KW のみ (コーヒー) → RR-01b 不該当 (RR-01b は強 KW のみ)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入10%",
            description="コーヒー",
            debit_amount=500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        # RR-01b 不該当。会議費は other_relevant_accounts に含まれないため RR-01c も発動しない。
        assert findings == []

    def test_negative_already_reduced(self, schema, make_row_factory):
        """既に軽減税率 8% で計上 → 検出不要。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入8%(軽)",
            description="弁当代",
            debit_amount=1500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []


# ═════════════════════════════════════════════════════════════
# RR-01c: その他関連科目 (消耗品費/通信費/雑費) + 標準10% + 弱食品 KW
# ═════════════════════════════════════════════════════════════

class TestRR01c:
    """その他関連科目 (10%) で弱食品 KW あり → 確度低めの Finding。"""

    def test_positive_consumable_coffee(self, schema, make_row_factory):
        """消耗品費 + 「コーヒー」→ RR-01c (Medium, conf=60) 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="事務所用 コーヒー豆",
            debit_amount=1200, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.tc_code == "V1-3-11"
        assert f.sub_code == "RR-01c"
        assert f.severity == "🟡 Medium"
        assert f.confidence == 60
        assert f.area == "A10"

    def test_positive_consumable_drink(self, schema, make_row_factory):
        """消耗品費 + 「飲料」→ RR-01c 検出。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="飲料 まとめ買い",
            debit_amount=3000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01c"

    def test_positive_misc_strong_kw(self, schema, make_row_factory):
        """雑費 + 強 KW 「弁当」→ RR-01c (強 KW でも RR-01c 範疇)。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="雑費", tax_label="課対仕入10%",
            description="お弁当代",
            debit_amount=800, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "RR-01c"

    def test_negative_amazon_prime(self, schema, make_row_factory):
        """通信費 + 「Amazonプライム会費」→ negative_digital で除外 (false positive 回避)。

        実データ ㈱デイリーユニフォームで多発するパターン (035-survey §2.5)。
        """
        rr01 = _load_rr01()
        row = make_row_factory(
            account="通信費", tax_label="課対仕入10%",
            description="Amazonプライム会費",
            debit_amount=600, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_subscription(self, schema, make_row_factory):
        """通信費 + 「サブスクリプション」→ negative_digital で除外。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="通信費", tax_label="課対仕入10%",
            description="月刊サブスクリプション料金",
            debit_amount=1500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_no_keyword(self, schema, make_row_factory):
        """消耗品費 + KW なし → 検出なし。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入10%",
            description="文房具",
            debit_amount=500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_negative_already_reduced(self, schema, make_row_factory):
        """消耗品費 + 既に軽減 8% → 検出不要。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="消耗品費", tax_label="課対仕入8%(軽)",
            description="コーヒー",
            debit_amount=1000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []


# ═════════════════════════════════════════════════════════════
# 全体動作: 範囲外科目 / 複数 row / 空 ctx 等
# ═════════════════════════════════════════════════════════════

class TestRR01General:
    """全体動作: スコープ外科目・複数 row 混合・空 ctx 等の確認。"""

    def test_unrelated_account_skipped(self, schema, make_row_factory):
        """関連科目辞書に含まれない科目 (給与手当 等) は完全スキップ。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="給与手当", tax_label="課対仕入10%",
            description="弁当代 (給与に紛れた表記)",
            debit_amount=1500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_multiple_rows_mixed(self, schema, make_row_factory):
        """複数 row 混合: 検出対象 + スキップ対象が同一 ctx に存在。"""
        rr01 = _load_rr01()
        rows = [
            # detect: RR-01a
            make_row_factory(
                wallet_txn_id="t1",
                account="新聞図書費", tax_label="課対仕入10%",
                description="日経新聞", debit_amount=4000, credit_amount=0,
            ),
            # detect: RR-01b
            make_row_factory(
                wallet_txn_id="t2",
                account="会議費", tax_label="課対仕入10%",
                description="弁当", debit_amount=1500, credit_amount=0,
            ),
            # skip: 既に軽減 8%
            make_row_factory(
                wallet_txn_id="t3",
                account="会議費", tax_label="課対仕入8%(軽)",
                description="弁当", debit_amount=1500, credit_amount=0,
            ),
            # skip: スコープ外科目
            make_row_factory(
                wallet_txn_id="t4",
                account="給与手当", tax_label="課対仕入10%",
                description="3月分", debit_amount=300000, credit_amount=0,
            ),
        ]
        findings = rr01.run(_make_ctx(schema, rows))
        assert len(findings) == 2
        sub_codes = sorted(f.sub_code for f in findings)
        assert sub_codes == ["RR-01a", "RR-01b"]

    def test_empty_transactions(self, schema):
        """ctx.transactions が空 → 空 list を返す (例外を出さない)。"""
        rr01 = _load_rr01()
        findings = rr01.run(_make_ctx(schema, []))
        assert findings == []

    def test_legacy_8pct_not_treated_as_reduced(self, schema, make_row_factory):
        """経過措置の旧 8% (code 108) は標準10%でも軽減でもないため、検出スコープ外。

        035-survey §5.2 で確認した REDUCED_TAXABLE_SALES_CODES=[101,156] 混在
        問題への配慮。RR-01 は購入側 (is_standard_purchase_10) 起点なので
        108 (旧8% 仕入) は最初の段階でフィルタアウトされる。
        """
        rr01 = _load_rr01()
        row = make_row_factory(
            account="会議費", tax_label="課対仕入8%",
            description="弁当",
            debit_amount=1500, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert findings == []

    def test_finding_has_link_hints(self, schema, make_row_factory):
        """生成される Finding には link_hints (general_ledger) が付与される。"""
        rr01 = _load_rr01()
        row = make_row_factory(
            account="新聞図書費", tax_label="課対仕入10%",
            description="日経新聞", transaction_date=date(2025, 12, 5),
            debit_amount=4000, credit_amount=0,
        )
        findings = rr01.run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        f = findings[0]
        assert f.link_hints is not None
        assert f.link_hints.target == "general_ledger"
        assert f.link_hints.account_name == "新聞図書費"
