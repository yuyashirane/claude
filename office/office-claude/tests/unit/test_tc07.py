"""TC-07 のユニットテスト(Pattern D: KW優先順位ディスパッチ型)。

最大難関の TC。同一科目内で摘要 KW の勝者でサブタイプを決定する。
内訳: 純粋関数 7件 + run 統合 9件 + 誤検知防止 6件 = 22件。
"""
from datetime import date

import pytest


def _make_ctx(schema, rows):
    """TC-07 テスト用の CheckContext。"""
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課対仕入10%": "136",
            "非課仕入": "37",
            "対象外": "2",
        },
    )


# ═══════════════════════════════════════════════════════════════
# A. 純粋関数 classify_welfare のテスト(7件)
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def kw():
    """welfare-keywords.json の構造を模した fixture(テスト独立性重視)。"""
    return {
        "condolence": ["慶弔", "見舞金", "結婚祝金", "香典"],
        "gift_certificate": ["商品券", "QUOカード", "Amazonギフト券"],
        "food_takeout": ["弁当", "テイクアウト", "宅配"],
        "food_dine_in": ["忘年会", "ケータリング", "懇親会"],
        "taxable_welfare": ["健康診断", "制服", "社員旅行"],
    }


class TestClassifyWelfare:
    """classify_welfare 純粋関数の単体テスト。"""

    def test_condolence_beats_gift(self, kw):
        """結婚祝金 × 商品券 → condolence 勝ち(目的 > 手段)。"""
        from checks.tc07_welfare import classify_welfare
        result = classify_welfare("結婚祝金 商品券で贈呈", kw)
        assert result == ("condolence", 90)

    def test_gift_beats_food(self, kw):
        """商品券 × 忘年会 → gift_certificate 勝ち。"""
        from checks.tc07_welfare import classify_welfare
        result = classify_welfare("忘年会用の商品券配布", kw)
        assert result == ("gift_certificate", 90)

    def test_food_takeout_beats_dine_in(self, kw):
        """弁当 × 忘年会 → food_takeout 勝ち(明確な軽減税率対象優先)。"""
        from checks.tc07_welfare import classify_welfare
        result = classify_welfare("忘年会用弁当", kw)
        assert result == ("food_takeout", 70)

    def test_dine_in_beats_taxable_welfare(self, kw):
        """ケータリング × 社員旅行 → food_dine_in 勝ち。"""
        from checks.tc07_welfare import classify_welfare
        result = classify_welfare("社員旅行の懇親会ケータリング", kw)
        assert result == ("food_dine_in", 70)

    def test_returns_none_when_no_match(self, kw):
        """どの KW にもマッチしない場合は None。"""
        from checks.tc07_welfare import classify_welfare
        assert classify_welfare("事務用品費振替", kw) is None

    def test_empty_text_returns_none(self, kw):
        """空文字列 → None。"""
        from checks.tc07_welfare import classify_welfare
        assert classify_welfare("", kw) is None

    def test_priority_order_is_correct(self):
        """KEYWORD_PRIORITY_ORDER が仕様通りの順序。"""
        from checks.tc07_welfare import KEYWORD_PRIORITY_ORDER
        assert KEYWORD_PRIORITY_ORDER == (
            "condolence",
            "gift_certificate",
            "food_takeout",
            "food_dine_in",
            "taxable_welfare",
        )


# ═══════════════════════════════════════════════════════════════
# B. 基本サブタイプ検証(9件、run 統合)
# ═══════════════════════════════════════════════════════════════

class TestTC07a:
    """TC-07a: 慶弔見舞金が課税仕入。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="慶弔見舞金",
            debit_amount=50000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07a"
        assert findings[0].severity == "🔴 High"
        assert findings[0].error_type == "direct_error"
        assert findings[0].confidence == 90
        assert findings[0].area == "A10"
        # リスト順先勝ち:「慶弔」が最初にマッチ
        assert "慶弔" in findings[0].message

    def test_negative_other_account(self, schema, make_row_factory):
        """慶弔見舞金でも福利厚生費以外の科目 → Finding なし。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="雑費", tax_label="課対仕入10%",
            description="慶弔見舞金",
            debit_amount=50000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert findings == []


class TestTC07b:
    """TC-07b: 商品券が課税仕入。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="QUOカード購入",
            debit_amount=30000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07b"
        assert findings[0].confidence == 90


class TestTC07c:
    """TC-07c: 慶弔見舞金が非課仕入(tax_impact_negligible)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="非課仕入",
            description="香典",
            debit_amount=20000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07c"
        assert findings[0].severity == "🟡 Medium"
        assert findings[0].confidence == 80
        assert findings[0].note == "tax_impact_negligible"
        assert "税額影響は軽微" in findings[0].message


class TestTC07d:
    """TC-07d: 商品券が対象外(tax_impact_negligible)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利費", tax_label="対象外",
            description="Amazonギフト券 贈呈",
            debit_amount=10000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07d"
        assert findings[0].confidence == 80
        assert findings[0].note == "tax_impact_negligible"
        assert "税額影響は軽微" in findings[0].message


class TestTC07e:
    """TC-07e: 課税相当 KW が対象外/非課仕入(reverse_suspect)。"""

    def test_positive(self, schema, make_row_factory):
        """社員旅行 + 対象外 → TC-07e。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="対象外",
            description="社員旅行費",
            debit_amount=200000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07e"
        assert findings[0].error_type == "reverse_suspect"
        assert findings[0].confidence == 60

    def test_negative_taxable(self, schema, make_row_factory):
        """社員旅行 + 課税仕入10% → 正常、Finding なし。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="社員旅行費",
            debit_amount=200000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert findings == []


class TestTC07f:
    """TC-07f: 食品関連 KW が標準税率10%(V1-3-20 委譲)。"""

    def test_positive_takeout(self, schema, make_row_factory):
        """弁当 + 課対仕入10% → TC-07f(defer_to_V1-3-20, show_by_default=False)。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="会議用お弁当",
            debit_amount=8000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07f"
        assert findings[0].confidence == 70
        assert findings[0].note == "defer_to_V1-3-20"
        assert findings[0].show_by_default is False

    def test_positive_dine_in(self, schema, make_row_factory):
        """ケータリング + 課対仕入10% → TC-07f(food_dine_in も統合)。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="ケータリング費用",
            debit_amount=50000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07f"
        assert "ケータリング" in findings[0].message


# ═══════════════════════════════════════════════════════════════
# C. 誤検知防止(6件)
# ═══════════════════════════════════════════════════════════════

class TestTC07FalsePositivePrevention:
    """誤検知防止・責務分離の検証。"""

    def test_different_account_not_detected(self, schema, make_row_factory):
        """法定福利費(法定福利 ≠ 福利厚生費) → 科目フィルタで弾かれる。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="法定福利費", tax_label="対象外",
            description="健康保険料",
            debit_amount=30000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert findings == []

    def test_training_keyword_not_detected(self, schema, make_row_factory):
        """研修費(KW未登録、責務分離) → 検出しない。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="対象外",
            description="社員研修受講料",
            debit_amount=50000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert findings == []

    def test_uniform_out_of_scope_detected_as_reverse(self, schema, make_row_factory):
        """制服(taxable_welfare) + 対象外 → TC-07e 発火(意図通り)。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="対象外",
            description="制服クリーニング代",
            debit_amount=5000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07e"

    def test_condolence_beats_gift_in_run(self, schema, make_row_factory):
        """結婚祝金 商品券 + 課対仕入10% → TC-07a(condolence 優先、TC-07b ではない)。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="結婚祝金 商品券で贈呈",
            debit_amount=30000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07a"

    def test_no_keyword_match_is_skipped(self, schema, make_row_factory):
        """KW ゼロマッチ → スルー、Finding なし。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="事務用品費振替",
            debit_amount=3000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert findings == []

    def test_welfare_account_alias_fukurihi(self, schema, make_row_factory):
        """「福利費」科目名でも検出される。"""
        from checks.tc07_welfare import run
        row = make_row_factory(
            account="福利費", tax_label="課対仕入10%",
            description="QUOカード購入",
            debit_amount=10000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-07b"
