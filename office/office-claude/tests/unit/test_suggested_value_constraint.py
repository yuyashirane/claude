"""TC-01〜07 の suggested_value 制約テスト。

Step 3-B: G 列「推奨税区分」には税区分マスタ値または空文字 ("") のみ
許容する。「要判断」「○○の可能性」等の非マスタ値が混入していないこと
を全 TC で網羅的に検証する。

検証ポリシー:
    - master 値: tax_code_master のキーに含まれる文字列
    - 例外: "" (空文字) — message を読んで判断するべきケース
    - それ以外の文字列 (例: "要判断", "課税仕入の可能性") は禁止

本テストは Step 3-B 修正の回帰防止用。新たな TC を追加した場合も
このテストを通過させること。
"""
from datetime import date
from decimal import Decimal


# ═══════════════════════════════════════════════════════════════
# 共通: マスタ値定義 (TC ごとの税区分マスタを統合)
# ═══════════════════════════════════════════════════════════════

# 各 TC のテストで使われる tax_code_master のキー全体を統合した集合。
# suggested_value はこの集合のいずれか or "" を取る。
ALLOWED_MASTER_VALUES: frozenset[str] = frozenset({
    # 売上系
    "課税売上10%",
    "課税売上8%(軽)",
    "輸出売上",
    "非課売上",
    # 仕入系
    "課対仕入10%",
    "課対仕入8%(軽)",
    "非課仕入",
    # 共通
    "対象外",
})


def _is_allowed(value: str) -> bool:
    """suggested_value が制約を満たすか判定。

    許容: master 値 もしくは 空文字 ("")
    """
    if value == "":
        return True
    return value in ALLOWED_MASTER_VALUES


# ═══════════════════════════════════════════════════════════════
# 共通: 全 TC を網羅する CheckContext
# ═══════════════════════════════════════════════════════════════

def _make_full_master_ctx(schema, rows):
    """全 TC で必要な税区分を含む CheckContext。"""
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
            "課対仕入8%(軽)": "163",
            "非課仕入": "5",
        },
    )


# ═══════════════════════════════════════════════════════════════
# TC-01: 売上 (5 サブ)
# ═══════════════════════════════════════════════════════════════

class TestTC01SuggestedValue:
    """TC-01a〜e の suggested_value 制約。"""

    def test_tc01a_reverse_suspect_is_empty(self, schema, make_row_factory):
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上10%",
            description="住宅家賃の受取",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) == 1
        assert _is_allowed(findings[0].suggested_value)

    def test_tc01b_reduced_not_food_is_master(self, schema, make_row_factory):
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="課税売上8%(軽)",
            description="一般物品の販売",
            debit_amount=0, credit_amount=10000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) == 1
        assert _is_allowed(findings[0].suggested_value)
        # TC-01b は master 値を提示できる確定ケース
        assert findings[0].suggested_value == "課税売上10%"

    def test_tc01c_export_no_overseas_is_empty(self, schema, make_row_factory):
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="輸出売上",
            description="国内取引",
            debit_amount=0, credit_amount=50000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) == 1
        assert _is_allowed(findings[0].suggested_value)

    def test_tc01d_non_taxable_no_kw_is_empty(self, schema, make_row_factory):
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="非課売上",
            description="通常の販売取引",
            debit_amount=0, credit_amount=80000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) == 1
        assert _is_allowed(findings[0].suggested_value)

    def test_tc01e_non_subject_no_kw_is_empty(self, schema, make_row_factory):
        from checks.tc01_sales import run
        row = make_row_factory(
            account="売上高", tax_label="対象外",
            description="通常の販売取引",
            debit_amount=0, credit_amount=80000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) == 1
        assert _is_allowed(findings[0].suggested_value)


# ═══════════════════════════════════════════════════════════════
# TC-02: 土地・住宅家賃
# ═══════════════════════════════════════════════════════════════

class TestTC02SuggestedValue:

    def test_tc02a_land_is_master(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        # land_accounts: 土地売却益 が課税売上 → TC-02a (sales 側 → "非課売上")
        row = make_row_factory(
            account="土地売却益", tax_label="課税売上10%",
            description="駐車場用地の譲渡",
            debit_amount=0, credit_amount=5000000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        assert len(findings) >= 1
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-02a":
                assert f.suggested_value == "非課売上"

    def test_tc02d_parking_is_empty(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        # 駐車場のみ + 非課税仕入 → TC-02d
        row = make_row_factory(
            account="地代家賃", tax_label="非課仕入",
            description="月極駐車場",
            debit_amount=20000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-02d":
                assert f.suggested_value == ""

    def test_tc02e_revenue_business_is_empty(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        # 受取家賃 + 非課売上 + 事業用KW → TC-02e (reverse_suspect)
        row = make_row_factory(
            account="受取家賃", tax_label="非課売上",
            description="店舗賃貸",
            debit_amount=0, credit_amount=300000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-02e":
                assert f.suggested_value == ""

    def test_tc02f_expense_business_is_empty(self, schema, make_row_factory):
        from checks.tc02_land_rent import run
        # 支払家賃 + 非課仕入 + 事業用KW → TC-02f (reverse_suspect)
        row = make_row_factory(
            account="地代家賃", tax_label="非課仕入",
            description="事務所賃借",
            debit_amount=200000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-02f":
                assert f.suggested_value == ""


# ═══════════════════════════════════════════════════════════════
# TC-04: 受取利息・配当・保険金・補助金
# ═══════════════════════════════════════════════════════════════

class TestTC04SuggestedValue:

    def test_tc04e_damage_is_empty(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(
            account="雑収入", tax_label="課税売上10%",
            description="損害賠償金の受取",
            debit_amount=0, credit_amount=500000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-04e":
                assert f.suggested_value == ""

    def test_tc04f_misc_revenue_is_empty(self, schema, make_row_factory):
        from checks.tc04_non_taxable_revenue import run
        row = make_row_factory(
            account="雑収入", tax_label="課税売上10%",
            description="補助金の受取",
            debit_amount=0, credit_amount=100000,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-04f":
                assert f.suggested_value == ""


# ═══════════════════════════════════════════════════════════════
# TC-05: 支払利息・保険料・保証料
# ═══════════════════════════════════════════════════════════════

class TestTC05SuggestedValue:

    def test_tc05e_payment_fee_guarantee_is_empty(self, schema, make_row_factory):
        from checks.tc05_non_taxable_expense import run
        row = make_row_factory(
            account="支払手数料", tax_label="課対仕入10%",
            description="信用保証料の支払",
            debit_amount=10000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            # TC-05e Route B (payment_fee) は非マスタ値だったため "" に変更
            if f.sub_code == "TC-05e" and f.confidence == 70:
                assert f.suggested_value == ""


# ═══════════════════════════════════════════════════════════════
# TC-06: 租税公課
# ═══════════════════════════════════════════════════════════════

class TestTC06SuggestedValue:

    def test_tc06d_fuel_is_empty(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(
            account="燃料費", tax_label="課対仕入10%",
            description="軽油の購入",
            debit_amount=30000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-06d":
                assert f.suggested_value == ""

    def test_tc06e_entertainment_is_empty(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(
            account="接待交際費", tax_label="課対仕入10%",
            description="ゴルフ場利用税",
            debit_amount=5000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-06e":
                assert f.suggested_value == ""


# ═══════════════════════════════════════════════════════════════
# TC-07: 福利厚生費
# ═══════════════════════════════════════════════════════════════

class TestTC07SuggestedValue:

    def test_tc07e_reverse_suspect_is_empty(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        # taxable_welfare KW + 非課仕入 → TC-07e
        row = make_row_factory(
            account="福利厚生費", tax_label="非課仕入",
            description="社員旅行",
            debit_amount=200000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-07e":
                assert f.suggested_value == ""

    def test_tc07f_food_is_empty(self, schema, make_row_factory):
        from checks.tc07_welfare import run
        # food_dine_in KW + 課税仕入10% → TC-07f
        row = make_row_factory(
            account="福利厚生費", tax_label="課対仕入10%",
            description="忘年会の費用",
            debit_amount=50000, credit_amount=0,
        )
        findings = run(_make_full_master_ctx(schema, [row]))
        for f in findings:
            assert _is_allowed(f.suggested_value)
            if f.sub_code == "TC-07f":
                assert f.suggested_value == ""


# ═══════════════════════════════════════════════════════════════
# 包括テスト: 静的検査 (ソースコード走査)
# ═══════════════════════════════════════════════════════════════

class TestSuggestedValueStaticCheck:
    """ソースコードを正規表現で走査し、非マスタ値の混入を防ぐ静的検査。"""

    def test_no_non_master_suggested_value_literals(self):
        """checks/tc*.py に非マスタ値の suggested_value リテラルが残っていない。"""
        import re
        from pathlib import Path

        checks_dir = (
            Path(__file__).parent.parent.parent
            / "skills" / "verify" / "V1-3-rule"
            / "check-tax-classification" / "checks"
        )

        # suggested_value="..." のリテラルを抽出するパターン
        pattern = re.compile(r'suggested_value\s*=\s*["\']([^"\']*)["\']')

        violations: list[tuple[str, int, str]] = []
        for py in sorted(checks_dir.glob("tc*.py")):
            text = py.read_text(encoding="utf-8")
            for line_no, line in enumerate(text.splitlines(), 1):
                m = pattern.search(line)
                if not m:
                    continue
                value = m.group(1)
                if not _is_allowed(value):
                    violations.append((py.name, line_no, value))

        assert violations == [], (
            "非マスタ値の suggested_value リテラルが残っています:\n"
            + "\n".join(f"  {f}:{ln}: {repr(v)}" for f, ln, v in violations)
        )
