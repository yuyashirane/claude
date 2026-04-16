"""TC-01 のユニットテスト(Pattern B 派生: 税区分起点 + KW双方向検出)。

仕様書 v1.2.2 §5.1 準拠。全サブタイプ (TC-01a〜e) を網羅。
"""
from datetime import date


def _make_ctx(schema, rows):
    """TC-01 テスト用の CheckContext。売上系の税区分を登録。"""
    return schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
        transactions=rows,
        tax_code_master={
            "課税売上10%": "129",
            "課税売上8%(軽)": "156",
            "輸出売上": "22",
            "非課売上": "23",
            "対象外": "2",
            "課対仕入10%": "136",
        },
    )


class TestTC01a:
    """TC-01a: 課税売上10% + 別区分の特徴KWあり (reverse_suspect, 🟡)。"""

    def test_positive_non_taxable_kw(self, schema, make_row_factory):
        """非課税系KW(住宅家賃)あり → reverse_suspect 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上10%",
            description="住宅家賃の受取",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01a"
        assert findings[0].error_type == "reverse_suspect"
        assert findings[0].area == "A8"
        assert findings[0].confidence == 50

    def test_positive_overseas_kw(self, schema, make_row_factory):
        """海外系KW(輸出)あり → reverse_suspect 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上10%",
            description="米国向け輸出取引",
            debit_amount=0, credit_amount=200000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01a"

    def test_positive_food_kw(self, schema, make_row_factory):
        """食品系KW(弁当)あり → reverse_suspect 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上10%",
            description="弁当販売",
            debit_amount=0, credit_amount=5000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01a"

    def test_negative_no_kw(self, schema, make_row_factory):
        """KWなし → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上10%",
            description="通常の売上",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC01b:
    """TC-01b: 課税売上8%(軽) + 食品系でない (direct_error, 🔴)。"""

    def test_positive(self, schema, make_row_factory):
        """食品系でない科目 + 食品KWなし → direct_error 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上8%(軽)",
            description="システム開発委託",
            debit_amount=0, credit_amount=50000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01b"
        assert findings[0].error_type == "direct_error"
        assert findings[0].confidence == 90

    def test_negative_food_account(self, schema, make_row_factory):
        """食品系科目 → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="飲食売上", tax_label="課税売上8%(軽)",
            description="テスト",
            debit_amount=0, credit_amount=5000,
        )
        # 飲食売上 は included に無いのでそもそもスコープ外で skip
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_negative_food_kw(self, schema, make_row_factory):
        """売上高 + 食品KWあり → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上8%(軽)",
            description="食品の販売",
            debit_amount=0, credit_amount=5000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC01c:
    """TC-01c: 輸出売上 + 海外KWなし (direct_error, 🔴)。"""

    def test_positive(self, schema, make_row_factory):
        """海外KWなし → direct_error 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="輸出売上",
            description="国内取引先への販売",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01c"
        assert findings[0].error_type == "direct_error"
        assert findings[0].confidence == 80

    def test_negative_overseas_kw(self, schema, make_row_factory):
        """海外KWあり → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="輸出売上",
            description="海外取引",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC01d:
    """TC-01d: 非課売上 + 例外KWなし (direct_error, 🔴)。"""

    def test_positive(self, schema, make_row_factory):
        """例外KWなし → direct_error 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="非課売上",
            description="通常サービス提供",
            debit_amount=0, credit_amount=30000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01d"
        assert findings[0].error_type == "direct_error"
        assert findings[0].confidence == 85

    def test_negative_non_taxable_kw(self, schema, make_row_factory):
        """非課税KW(住宅家賃)あり → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="非課売上",
            description="住宅家賃の受取",
            debit_amount=0, credit_amount=50000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC01e:
    """TC-01e: 対象外 + 例外KWなし (direct_error, 🔴)。"""

    def test_positive(self, schema, make_row_factory):
        """例外KWなし → direct_error 検出。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="対象外",
            description="通常の売上",
            debit_amount=0, credit_amount=20000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01e"
        assert findings[0].error_type == "direct_error"
        assert findings[0].confidence == 85

    def test_negative_non_taxable_kw(self, schema, make_row_factory):
        """例外KWあり → 検出しない。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="対象外",
            description="土地売却",
            debit_amount=0, credit_amount=50000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC01Scope:
    """TC-01 のスコープ制御確認。"""

    def test_debit_side_ignored(self, schema, make_row_factory):
        """借方計上は対象外。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="対象外",
            description="通常取引",
            debit_amount=100000, credit_amount=0,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_excluded_account_skipped(self, schema, make_row_factory):
        """excluded 科目 (受取利息等) はスキップ。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="受取利息", tax_label="課税売上10%",
            description="テスト",
            debit_amount=0, credit_amount=1000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_unrelated_account_skipped(self, schema, make_row_factory):
        """included でも excluded でもない科目はスキップ。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="通信費", tax_label="課税売上10%",
            description="テスト",
            debit_amount=0, credit_amount=1000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_construction_account(self, schema, make_row_factory):
        """建設業科目 (完成工事高) も included として検出対象。"""
        from checks.tc01_sales import run
        row = make_row_factory(
            account="完成工事高", tax_label="課税売上10%",
            description="海外工事",
            debit_amount=0, credit_amount=500000,
        )
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-01a"
