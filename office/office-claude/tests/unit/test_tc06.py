"""TC-06 のユニットテスト(Pattern C: 原則判定 + 例外KW補正型)。

新要素: 例外KW辞書 / Skill間委譲(defer_to_V1-3-30) / 高異常度(high_anomaly)
"""
from datetime import date


def _make_ctx(schema, rows):
    """TC-06 テスト用の CheckContext。"""
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
            "課税売上10%": "129",
            "非課売上": "23",
        },
    )


class TestTC06a:
    """TC-06a: 租税公課が課税仕入。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="印紙税", tax_label="課対仕入10%",
                              debit_amount=10000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06a"
        assert findings[0].error_type == "direct_error"
        assert findings[0].area == "A12"

    def test_negative(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="印紙税", tax_label="対象外",
                              debit_amount=10000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC06b:
    """TC-06b: 法人税等が課税区分(高異常度)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="法人税、住民税及び事業税",
                              tax_label="課対仕入10%",
                              debit_amount=500000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06b"
        assert findings[0].confidence == 95
        assert findings[0].note == "high_anomaly"

    def test_negative(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="法人税等", tax_label="対象外",
                              debit_amount=500000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_taxable_sales_also_ng(self, schema, make_row_factory):
        """法人税等 + 課税売上 → TC-06b(売上系も NG)。"""
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="法人税等", tax_label="課税売上10%",
                              debit_amount=0, credit_amount=500000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06b"

    def test_high_anomaly_marker(self, schema, make_row_factory):
        """TC-06b の note が "high_anomaly" であることを明示確認。"""
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="法人税", tax_label="非課売上",
                              debit_amount=0, credit_amount=100000)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].note == "high_anomaly"
        assert findings[0].severity == "🔴 High"


class TestTC06c:
    """TC-06c: 租税公課が非課仕入(許容パターン)。"""

    def test_positive(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="租税公課", tax_label="非課仕入",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06c"
        assert findings[0].error_type == "mild_warning"
        assert findings[0].show_by_default is False

    def test_negative(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="租税公課", tax_label="対象外",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC06d:
    """TC-06d: 軽油引取税の判定要確認(V1-3-30 へ委譲)。"""

    def test_positive_with_diesel_kw(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="車両費", tax_label="課対仕入10%",
                              description="軽油代金 ○月分",
                              debit_amount=20000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06d"
        assert findings[0].note == "defer_to_V1-3-30"
        assert findings[0].show_by_default is False

    def test_negative_no_diesel_kw(self, schema, make_row_factory):
        """ガソリンは diesel KW にマッチしないので出ない。"""
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="車両費", tax_label="課対仕入10%",
                              description="ガソリン代",
                              debit_amount=8000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_boundary_empty_description(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="燃料費", tax_label="課対仕入10%",
                              description="",
                              debit_amount=8000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC06e:
    """TC-06e: ゴルフ場利用税・入湯税の判定要確認。"""

    def test_positive_golf(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="接待交際費", tax_label="課対仕入10%",
                              description="○○GC ゴルフ場利用税含む",
                              debit_amount=30000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06e"

    def test_negative_no_kw(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="接待交際費", tax_label="課対仕入10%",
                              description="○○○○での会食",
                              debit_amount=20000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0

    def test_boundary_empty_description(self, schema, make_row_factory):
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="接待交際費", tax_label="課対仕入10%",
                              description="",
                              debit_amount=20000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 0


class TestTC06Exclusion:
    """TC-06 の排他制御 + マーカー検証。"""

    def test_06a_excludes_06c(self, schema, make_row_factory):
        """租税公課 + 課対仕入 → TC-06a のみ、TC-06c は出ない。"""
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="租税公課", tax_label="課対仕入10%",
                              debit_amount=5000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06a"


class TestTC06ExceptionKW:
    """TC-06a の例外KW(taxable_exception)のテスト。"""

    def test_empty_exception_kw_no_skip(self, schema, make_row_factory):
        """taxable_exception が空配列の状態では TC-06a が通常通り発火する。"""
        from checks.tc06_tax_public_charges import run
        row = make_row_factory(account="印紙税", tax_label="課対仕入10%",
                              description="任意の摘要",
                              debit_amount=10000, credit_amount=0)
        findings = run(_make_ctx(schema, [row]))
        assert len(findings) == 1
        assert findings[0].sub_code == "TC-06a"

    def test_exception_kw_injected_skips(self, schema, make_row_factory, monkeypatch):
        """taxable_exception に値を注入すると TC-06a がスキップされる。"""
        from skills._common.lib import finding_factory as ff
        from checks import tc06_tax_public_charges as mod

        original = ff.load_reference_json

        def fake_load(skill_path, name, **kwargs):
            data = original(skill_path, name, **kwargs)
            if name == "keywords/tax-public-charges-keywords":
                data = dict(data)
                data["taxable_exception"] = ["特殊除外キーワード"]
            return data

        monkeypatch.setattr(mod, "load_reference_json", fake_load, raising=False)
        # mod内で from ... import load_reference_json しているため、モジュール属性を差し替える
        import skills._common.lib.finding_factory as ff_mod
        monkeypatch.setattr(ff_mod, "load_reference_json", fake_load)

        row = make_row_factory(account="印紙税", tax_label="課対仕入10%",
                              description="特殊除外キーワードを含む摘要",
                              debit_amount=10000, credit_amount=0)
        findings = mod.run(_make_ctx(schema, [row]))
        assert len(findings) == 0
