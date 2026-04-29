"""V1-3-20 check-invoice-registration-status のテスト。

α (TestInvoiceCandidatesAlpha): 3 条件 AND フィルタの最小 5 ケース（既存・改変禁止）。
β1 (TestInvoiceCheckContext / TestCliArgValidation / TestMissingFiles
     / TestFindingConversion / TestNormalizeDeals): CLI 化と Finding 変換層の検証。

V1-3-10 のテスト群と独立しており、共有 conftest を変更せずに動作する。
ハイフン区切りディレクトリへのアクセスは importlib 経由で行う。
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest


# ─────────────────────────────────────────────────────────────────────
# モジュールロード (ハイフン入りパッケージのため importlib 経由)
# ─────────────────────────────────────────────────────────────────────

_SKILL_DIR = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-invoice-registration-status"
)
_RUN_PATH = _SKILL_DIR / "run.py"
_SCHEMA_PATH = _SKILL_DIR / "schema.py"
_CHECKER_PATH = _SKILL_DIR / "checker.py"
_PROJECT_ROOT = Path(__file__).parent.parent.parent  # office-claude/


def _load_v1_3_20_run():
    name = "v1_3_20_invoice_run"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _RUN_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_RUN_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_v1_3_20_schema():
    name = "v1_3_20_invoice_schema"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _SCHEMA_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_SCHEMA_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_v1_3_20_checker():
    name = "v1_3_20_invoice_checker"
    if name in sys.modules:
        return sys.modules[name]
    # checker.py は同階層の schema/run に依存するので先にロード
    _load_v1_3_20_schema()
    _load_v1_3_20_run()
    spec = importlib.util.spec_from_file_location(name, _CHECKER_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {_CHECKER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def v1320():
    return _load_v1_3_20_run()


@pytest.fixture(scope="module")
def v1320_schema():
    return _load_v1_3_20_schema()


def _run_cli(
    *args: str,
    cwd: Path | None = None,
    project_root: Path | None = None,
) -> subprocess.CompletedProcess:
    """run.py をサブプロセスで起動し、結果を返す。

    project_root を渡すと環境変数 V1_3_20_PROJECT_ROOT で上書きする。
    （tmp_path フィクスチャで JSON 配置先を切り替えるため）
    """
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if project_root is not None:
        env["V1_3_20_PROJECT_ROOT"] = str(project_root)
    return subprocess.run(
        [sys.executable, str(_RUN_PATH), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        cwd=str(cwd or _PROJECT_ROOT),
    )


# ─────────────────────────────────────────────────────────────────────
# テスト本体
# ─────────────────────────────────────────────────────────────────────

class TestClassifyTransactionLegacyIntents:
    """β1 の TestInvoiceCandidatesAlpha 5 件を 5 分類体系へ意図継承書き換え。

    β2-A メモ §6.1 のマッピングに従う:
        - 既存「3 条件 AND ヒット」→ NONQUALIFIED_BUT_FULL_DEDUCTION_TAX 正常パス
        - 既存「適格マーク除外」→ EXPECTED_FULL_DEDUCTION_TAX または
                                  QUALIFIED_BUT_TRANSITIONAL_TAX
        - 既存「非課税仕入除外」→ NONE
        - 既存「20 万円境界」→ パターン② / partner_unknown 経過措置の境界
        - 既存「順序保持」→ classify_transaction のリスト処理での順序保持
    """

    def test_nonqualified_full_deduction_pattern2_classification(
        self, v1320, v1320_schema
    ):
        """β1: 3 条件 AND ヒット → β2: NONQUALIFIED_BUT_FULL_DEDUCTION_TAX。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t1",
            transaction_date=date(2025, 12, 1),
            partner="未登録ベンダー A",
            description="広告費",
            tax_label="課対仕入10%",
            debit_amount=Decimal("250000"),
            is_qualified_invoice=False,
            tax_code=136,
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_qualified_full_deduction_is_expected(self, v1320, v1320_schema):
        """β1: 適格 × 課対仕入 → 除外 / β2: EXPECTED_FULL_DEDUCTION_TAX（観察用）。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t2",
            partner="適格ベンダー",
            tax_label="課対仕入10%",
            debit_amount=Decimal("500000"),
            is_qualified_invoice=True,
            tax_code=136,
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.EXPECTED_FULL_DEDUCTION_TAX
        )

    def test_qualified_transitional_is_qualified_but_transitional(
        self, v1320, v1320_schema
    ):
        """β1 にはなかった象限 / β2: 適格 × 経過措置 → QUALIFIED_BUT_TRANSITIONAL_TAX。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t2b",
            partner="適格ベンダー",
            tax_label="課対仕入（控80）10%",
            debit_amount=Decimal("500000"),
            is_qualified_invoice=True,
            tax_code=189,
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
        )

    def test_non_taxable_purchase_is_none(self, v1320, v1320_schema):
        """β1: 非課税仕入除外 / β2: 5 分類いずれにも該当せず NONE。"""
        row = v1320.InvoiceCheckRow(
            wallet_txn_id="t3",
            tax_label="非課仕入",
            debit_amount=Decimal("300000"),
            is_qualified_invoice=False,
            tax_code=137,  # 非対仕入10%（FULL_DEDUCTION でも TRANSITIONAL でもない）
        )
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    def test_amount_threshold_boundary_pattern2(self, v1320, v1320_schema):
        """β1: 20 万境界（パターン②）/ β2: 20 万ちょうどは含み、未満は NONE。"""
        below = v1320.InvoiceCheckRow(
            wallet_txn_id="t4-below",
            tax_label="課対仕入10%",
            debit_amount=Decimal("199999"),
            is_qualified_invoice=False,
            tax_code=136,
        )
        exact = v1320.InvoiceCheckRow(
            wallet_txn_id="t4-exact",
            tax_label="課対仕入10%",
            debit_amount=Decimal("200000"),
            is_qualified_invoice=False,
            tax_code=136,
        )
        assert v1320.classify_transaction(below) == v1320_schema.Classification.NONE
        assert v1320.classify_transaction(exact) == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_amount_threshold_boundary_partner_unknown_transitional(
        self, v1320, v1320_schema
    ):
        """β2: partner_unknown × 経過措置 × 20 万境界（β1 にはなかったパス）。"""
        below = v1320.InvoiceCheckRow(
            wallet_txn_id="pu-below",
            partner="",
            tax_label="課対仕入（控80）10%",
            debit_amount=Decimal("199999"),
            is_qualified_invoice=False,
            tax_code=189,
        )
        exact = v1320.InvoiceCheckRow(
            wallet_txn_id="pu-exact",
            partner="",
            tax_label="課対仕入（控80）10%",
            debit_amount=Decimal("200000"),
            is_qualified_invoice=False,
            tax_code=189,
        )
        assert v1320.classify_transaction(below) == v1320_schema.Classification.NONE
        assert v1320.classify_transaction(exact) == (
            v1320_schema.Classification.PARTNER_UNKNOWN
        )

    def test_mixed_rows_preserve_order(self, v1320, v1320_schema):
        """β1: 該当行のみが順序保持で抽出 / β2: classify_transaction を順次適用しても
        分類結果リストが入力順を保つことを担保。"""
        Classification = v1320_schema.Classification
        rows = [
            # NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
            v1320.InvoiceCheckRow(
                wallet_txn_id="A", partner="X", tax_label="課対仕入10%",
                debit_amount=Decimal("300000"), is_qualified_invoice=False,
                tax_code=136,
            ),
            # EXPECTED_FULL_DEDUCTION_TAX
            v1320.InvoiceCheckRow(
                wallet_txn_id="B", partner="X", tax_label="課対仕入10%",
                debit_amount=Decimal("400000"), is_qualified_invoice=True,
                tax_code=136,
            ),
            # NONE（非対仕入）
            v1320.InvoiceCheckRow(
                wallet_txn_id="C", partner="X", tax_label="非対仕入10%",
                debit_amount=Decimal("500000"), is_qualified_invoice=False,
                tax_code=137,
            ),
            # NONE（19 万）
            v1320.InvoiceCheckRow(
                wallet_txn_id="D", partner="X", tax_label="課対仕入10%",
                debit_amount=Decimal("190000"), is_qualified_invoice=False,
                tax_code=136,
            ),
            # NONQUALIFIED_BUT_FULL_DEDUCTION_TAX（20 万境界）
            v1320.InvoiceCheckRow(
                wallet_txn_id="E", partner="X", tax_label="課対仕入10%",
                debit_amount=Decimal("200000"), is_qualified_invoice=False,
                tax_code=136,
            ),
        ]
        results = [v1320.classify_transaction(r) for r in rows]
        assert results == [
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.EXPECTED_FULL_DEDUCTION_TAX,
            Classification.NONE,
            Classification.NONE,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        ]
        # 順序保持: row.wallet_txn_id と分類結果が 1:1 で揃う
        assert [r.wallet_txn_id for r in rows] == ["A", "B", "C", "D", "E"]


# ─────────────────────────────────────────────────────────────────────
# β1: CheckContext (schema.py)
# ─────────────────────────────────────────────────────────────────────

class TestInvoiceCheckContext:
    """InvoiceCheckContext の構築テスト。"""

    def test_context_pattern1(self, v1320_schema):
        ctx = v1320_schema.InvoiceCheckContext(
            company_id=3525430,
            period_start=date(2025, 4, 1),
            period_end=date(2026, 3, 31),
        )
        assert ctx.company_id == 3525430
        assert ctx.target_month is None
        assert ctx.single_month is False

    def test_context_pattern2(self, v1320_schema):
        ctx = v1320_schema.InvoiceCheckContext(
            company_id=3525430,
            period_start=date(2025, 4, 1),
            period_end=date(2025, 12, 31),
            target_month=date(2025, 12, 1),
            single_month=False,
        )
        assert ctx.target_month == date(2025, 12, 1)
        assert ctx.single_month is False

    def test_context_pattern3(self, v1320_schema):
        ctx = v1320_schema.InvoiceCheckContext(
            company_id=3525430,
            period_start=date(2025, 12, 1),
            period_end=date(2025, 12, 31),
            target_month=date(2025, 12, 1),
            single_month=True,
        )
        assert ctx.target_month == date(2025, 12, 1)
        assert ctx.single_month is True

    def test_context_is_frozen(self, v1320_schema):
        """frozen dataclass: 属性変更不可。"""
        ctx = v1320_schema.InvoiceCheckContext(
            company_id=1,
            period_start=date(2025, 4, 1),
            period_end=date(2025, 4, 30),
        )
        with pytest.raises(Exception):
            ctx.company_id = 2  # type: ignore[misc]


# ─────────────────────────────────────────────────────────────────────
# β1: CLI 引数バリデーション (run.py)
# ─────────────────────────────────────────────────────────────────────

class TestCliArgValidation:
    """CLI 引数パースの単体検証。サブプロセスで run.py を起動。"""

    def test_cli_pattern1_ok(self, tmp_path):
        """期間指定パターン: 引数自体は受理される（JSON 不足で exit 2）。"""
        # 存在しない company_id を渡し、必ず JSON 不足になる経路を通す
        result = _run_cli(
            "--company-id", "99999999",
            "--period-start", "2025-04",
            "--period-end", "2025-12",
        )
        # 引数は受理され、JSON 欠落で exit 2 になる（exit 1 ではない）
        assert result.returncode == 2, result.stdout + result.stderr
        payload = json.loads(result.stdout.strip().splitlines()[0])
        assert payload["status"] == "error"
        assert payload["error_stage"] == "json_missing"

    def test_cli_pattern2_ok(self):
        """target_month のみ: 引数自体は受理される。"""
        result = _run_cli("--company-id", "99999999", "--target-month", "2025-12")
        # company_info.json が無くて exit 2 になる
        assert result.returncode == 2, result.stdout + result.stderr

    def test_cli_pattern3_ok(self):
        """target_month + single_month: 引数自体は受理される。"""
        result = _run_cli(
            "--company-id", "99999999",
            "--target-month", "2025-12",
            "--single-month",
        )
        assert result.returncode == 2, result.stdout + result.stderr

    def test_cli_conflict_period_and_target(self):
        """--period-start/end と --target-month 同時指定で exit 1。"""
        result = _run_cli(
            "--company-id", "3525430",
            "--period-start", "2025-04",
            "--period-end", "2025-12",
            "--target-month", "2025-12",
        )
        assert result.returncode == 1, result.stdout + result.stderr
        payload = json.loads(result.stdout.strip().splitlines()[0])
        assert payload["status"] == "error"
        assert payload["error_stage"] == "args"

    def test_cli_period_start_after_end(self):
        """period_start > period_end で exit 1。"""
        result = _run_cli(
            "--company-id", "3525430",
            "--period-start", "2025-12",
            "--period-end", "2025-04",
        )
        assert result.returncode == 1, result.stdout + result.stderr

    def test_cli_missing_required(self):
        """company_id なしで exit 1。"""
        result = _run_cli("--target-month", "2025-12")
        assert result.returncode == 1, result.stdout + result.stderr

    def test_cli_only_period_start(self):
        """--period-start だけ指定で exit 1（両方必須）。"""
        result = _run_cli("--company-id", "3525430", "--period-start", "2025-04")
        assert result.returncode == 1, result.stdout + result.stderr

    def test_cli_invalid_yyyymm(self):
        """不正な年月形式で exit 1。"""
        result = _run_cli("--company-id", "3525430", "--target-month", "2025-13")
        assert result.returncode == 1, result.stdout + result.stderr

    def test_cli_single_month_without_target(self):
        """--single-month は --target-month とのみ併用可。"""
        result = _run_cli(
            "--company-id", "3525430",
            "--period-start", "2025-04",
            "--period-end", "2025-12",
            "--single-month",
        )
        assert result.returncode == 1, result.stdout + result.stderr


# ─────────────────────────────────────────────────────────────────────
# β1: missing_files プロトコル (exit 2)
# ─────────────────────────────────────────────────────────────────────

class TestMissingFiles:
    """JSON 不足時に exit 2 + missing_files JSON が出ること。"""

    def test_missing_files_returns_exit_2(self):
        result = _run_cli("--company-id", "99999999", "--target-month", "2025-12")
        assert result.returncode == 2, result.stdout + result.stderr
        payload = json.loads(result.stdout.strip().splitlines()[0])
        assert payload["status"] == "error"
        assert payload["exit_code"] == 2
        assert payload["error_stage"] == "json_missing"
        assert "missing_files" in payload
        assert isinstance(payload["missing_files"], list)
        assert len(payload["missing_files"]) >= 1
        first = payload["missing_files"][0]
        assert "filename" in first
        assert "expected_path" in first


# ─────────────────────────────────────────────────────────────────────
# β1: deals → InvoiceCheckRow 正規化 (run.py 内部関数)
# ─────────────────────────────────────────────────────────────────────

class TestNormalizeDeals:
    """_normalize_deals / _is_qualified_invoice の単体検証。"""

    def test_qualified_true(self, v1320):
        assert v1320._is_qualified_invoice({"qualified_invoice_issuer": True}) is True

    def test_qualified_false(self, v1320):
        assert v1320._is_qualified_invoice({"qualified_invoice_issuer": False}) is False

    def test_qualified_missing_partner(self, v1320):
        """partner が None なら False（候補対象）。"""
        assert v1320._is_qualified_invoice(None) is False

    def test_qualified_missing_field(self, v1320):
        """qualified_invoice_issuer 欠損なら False。"""
        assert v1320._is_qualified_invoice({"name": "x"}) is False

    def test_qualified_null_field(self, v1320):
        """qualified_invoice_issuer = None なら False。"""
        assert v1320._is_qualified_invoice({"qualified_invoice_issuer": None}) is False

    def test_normalize_deals_basic(self, v1320):
        """deals[].details ごとに 1 行が生成される。tax_code も伝播する（β2-B）。"""
        deals_json = {
            "deals": [
                {
                    "id": 1001,
                    "issue_date": "2025-12-15",
                    "partner_id": 7,
                    "ref_number": "REF-1",
                    "details": [
                        {
                            "id": 1,
                            "tax_code": 136,
                            "amount": 300000,
                            "entry_side": "debit",
                            "description": "広告費",
                        },
                        {
                            "id": 2,
                            "tax_code": 136,
                            "amount": 100000,
                            "entry_side": "debit",
                            "description": "別摘要",
                        },
                    ],
                }
            ]
        }
        partners_map = {7: {"id": 7, "name": "未登録ベンダー", "qualified_invoice_issuer": False}}
        taxes_map = {136: "課対仕入10%"}
        rows = v1320._normalize_deals(deals_json, partners_map, taxes_map)
        assert len(rows) == 2
        assert rows[0].wallet_txn_id == "1001-1"
        assert rows[0].partner == "未登録ベンダー"
        assert rows[0].tax_label == "課対仕入10%"
        assert rows[0].debit_amount == Decimal("300000")
        assert rows[0].is_qualified_invoice is False
        assert rows[0].transaction_date == date(2025, 12, 15)
        assert rows[0].tax_code == 136  # β2-B: tax_code 伝播
        assert rows[1].debit_amount == Decimal("100000")
        assert rows[1].tax_code == 136

    def test_normalize_deals_tax_code_none(self, v1320):
        """details[].tax_code が欠損 → row.tax_code=None（β2-B 方針 1）。"""
        deals_json = {
            "deals": [
                {
                    "id": 7000,
                    "issue_date": "2025-12-15",
                    "partner_id": 7,
                    "details": [{"id": 1, "amount": 100000, "entry_side": "debit"}],
                }
            ]
        }
        rows = v1320._normalize_deals(
            deals_json,
            {7: {"id": 7, "qualified_invoice_issuer": False}},
            {},
        )
        assert rows[0].tax_code is None
        assert rows[0].tax_label == ""

    def test_normalize_deals_tax_code_str_normalized_to_int(self, v1320):
        """tax_code が文字列で入っても int に正規化される（β2-B 防御）。"""
        deals_json = {
            "deals": [
                {
                    "id": 1,
                    "issue_date": "2025-12-15",
                    "partner_id": 7,
                    "details": [{"id": 1, "tax_code": "136", "amount": 200000, "entry_side": "debit"}],
                }
            ]
        }
        rows = v1320._normalize_deals(
            deals_json,
            {7: {"id": 7, "qualified_invoice_issuer": False}},
            {136: "課対仕入10%"},
        )
        assert rows[0].tax_code == 136
        assert isinstance(rows[0].tax_code, int)

    def test_normalize_deals_credit_side_zero_debit(self, v1320):
        """entry_side=credit のとき debit_amount は 0。"""
        deals_json = {
            "deals": [
                {
                    "id": 1,
                    "issue_date": "2025-12-15",
                    "partner_id": 7,
                    "details": [{"id": 9, "tax_code": 129, "amount": 500000, "entry_side": "credit"}],
                }
            ]
        }
        rows = v1320._normalize_deals(
            deals_json,
            {7: {"id": 7, "name": "X", "qualified_invoice_issuer": True}},
            {129: "課税売上10%"},
        )
        assert rows[0].debit_amount == Decimal("0")
        assert rows[0].credit_amount == Decimal("500000")
        assert rows[0].tax_code == 129

    def test_normalize_deals_qualified_partner(self, v1320):
        """適格マーク True なら is_qualified_invoice=True が伝播する。"""
        deals_json = {
            "deals": [
                {
                    "id": 5,
                    "issue_date": "2025-12-15",
                    "partner_id": 99,
                    "details": [{"id": 1, "tax_code": 136, "amount": 300000, "entry_side": "debit"}],
                }
            ]
        }
        rows = v1320._normalize_deals(
            deals_json,
            {99: {"id": 99, "name": "適格", "qualified_invoice_issuer": True}},
            {136: "課対仕入10%"},
        )
        assert rows[0].is_qualified_invoice is True
        assert rows[0].tax_code == 136

    def test_normalize_deals_unknown_partner(self, v1320):
        """partner_id が partners_map に無い → 空名 + is_qualified=False。"""
        deals_json = {
            "deals": [
                {
                    "id": 5,
                    "issue_date": "2025-12-15",
                    "partner_id": 999999,
                    "details": [{"id": 1, "tax_code": 136, "amount": 300000, "entry_side": "debit"}],
                }
            ]
        }
        rows = v1320._normalize_deals(deals_json, {}, {136: "課対仕入10%"})
        assert rows[0].partner == ""
        assert rows[0].is_qualified_invoice is False
        assert rows[0].tax_code == 136


# ─────────────────────────────────────────────────────────────────────
# β1: Finding 変換層 (checker.py)
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def v1320_checker():
    return _load_v1_3_20_checker()


def _make_row(v1320, **overrides):
    base = {
        "wallet_txn_id": "1001-1",
        "transaction_date": date(2025, 12, 15),
        "partner": "未登録ベンダー",
        "description": "広告費",
        "tax_label": "課対仕入10%",
        "debit_amount": Decimal("300000"),
        "credit_amount": Decimal("0"),
        "is_qualified_invoice": False,
        "tax_code": 136,  # β2-B 追加フィールド、TestFindingConversion で参照される
    }
    base.update(overrides)
    return v1320.InvoiceCheckRow(**base)


class TestFindingConversion:
    """checker.to_finding / to_findings の責務分離検証（β2-C 書き換え版）。

    β2-C 変更点:
        - to_finding(row) → to_finding(row, classification)
        - to_findings(rows) → to_findings(rows, classifications)
        - raw 6 → 8 フィールド（tax_code + is_qualified_invoice 追加）
        - transaction_date None → "" 化（β2-C 破壊的変更）
        - message テンプレートベース（β1 の固定文言「インボイス未登録の可能性」廃止）
    """

    def test_to_finding_basic(self, v1320, v1320_checker, v1320_schema):
        row = _make_row(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert isinstance(f, v1320_schema.InvoiceFinding)
        assert f.wallet_txn_id == "1001-1"
        assert f.classification == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_to_finding_raw_contains_invoice_specific(
        self, v1320, v1320_checker, v1320_schema
    ):
        """β2-C: raw は 8 フィールド（tax_code + is_qualified_invoice 追加）。"""
        row = _make_row(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        # 必須 8 フィールド
        assert set(f.raw.keys()) == {
            "tax_label",
            "tax_code",
            "debit_amount",
            "partner",
            "description",
            "transaction_date",
            "source",
            "is_qualified_invoice",
        }
        assert f.raw["tax_label"] == "課対仕入10%"
        assert f.raw["tax_code"] == 136  # _make_row のヘルパでは tax_code=136
        assert f.raw["debit_amount"] == "300000"
        assert f.raw["partner"] == "未登録ベンダー"
        assert f.raw["description"] == "広告費"
        assert f.raw["transaction_date"] == "2025-12-15"
        assert f.raw["source"] == "deal"
        assert f.raw["is_qualified_invoice"] is False

    def test_to_finding_severity_is_warning(
        self, v1320, v1320_checker, v1320_schema
    ):
        f = v1320_checker.to_finding(
            _make_row(v1320),
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        )
        assert f.severity == "warning"

    def test_to_finding_rule_code_is_v1_3_20(
        self, v1320, v1320_checker, v1320_schema
    ):
        f = v1320_checker.to_finding(
            _make_row(v1320),
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        )
        assert f.rule_code == "V1-3-20"

    def test_to_finding_message_contains_partner_and_tax_label(
        self, v1320, v1320_checker, v1320_schema
    ):
        """β2-C: テンプレート差し込み確認（partner と tax_label）。"""
        row = _make_row(v1320, partner="㈱テスト商事", tax_label="課対仕入8%（軽）")
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert "㈱テスト商事" in f.message
        assert "課対仕入8%（軽）" in f.message

    def test_to_finding_message_partner_unknown(
        self, v1320, v1320_checker, v1320_schema
    ):
        """β2-C: 取引先名が空のとき全分類で '取引先不明' が入る（X2-α）。"""
        row = _make_row(v1320, partner="")
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert "取引先不明" in f.message

    def test_to_finding_no_transaction_date(
        self, v1320, v1320_checker, v1320_schema
    ):
        """β2-C: transaction_date が None なら raw では空文字 ""（破壊的変更、論点 0-3）。"""
        row = _make_row(v1320, transaction_date=None)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert f.raw["transaction_date"] == ""

    def test_to_findings_preserves_order(
        self, v1320, v1320_checker, v1320_schema
    ):
        """β2-C: rows と classifications のペアで順序保持。"""
        Classification = v1320_schema.Classification
        rows = [
            _make_row(v1320, wallet_txn_id="A"),
            _make_row(v1320, wallet_txn_id="B"),
            _make_row(v1320, wallet_txn_id="C"),
        ]
        classifications = [
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        ]
        result = v1320_checker.to_findings(rows, classifications)
        assert [f.wallet_txn_id for f in result] == ["A", "B", "C"]

    def test_to_findings_empty(self, v1320_checker):
        """β2-C: 空リスト × 空リスト境界 → 空リスト。"""
        assert v1320_checker.to_findings([], []) == []


# ─────────────────────────────────────────────────────────────────────
# β1: exit 0 経路の end-to-end (run.py main)
# ─────────────────────────────────────────────────────────────────────

class TestExitZeroEndToEnd:
    """5 ファイルを揃えた tmp 環境で run.py main() が exit 0 を返すこと。

    β2-C 書き換え:
        - トップレベル `findings` キー削除 → `groups` キー追加（3 件、順序固定）
        - findings_count はトップレベル維持（warning Finding 総数）
        - 各 finding の raw は 8 フィールド（tax_code + is_qualified_invoice 追加）
        - 各 finding に classification フィールド
        - observations.partner_unknown_breakdown 追加
        - 不変条件 2 つ:
            sum(classification_counts.values()) == total_rows（β2-B 維持）
            sum(group.findings_count for group in groups) == findings_count（β2-C 新規）
    """

    @pytest.fixture
    def fixture_dataset(self, tmp_path):
        """3525430 を模した最小 e2e フィクスチャを構築。

        - 候補となる行（適格マークなし × 課対仕入10% × 25 万円）を 1 件
        - 除外される行（適格マークあり × 課対仕入10% × 30 万円）を 1 件
        - 除外される行（非課仕入）を 1 件
        """
        company_id = 11111111  # 衝突しないダミー ID
        period_dir = tmp_path / "data" / "e2e" / str(company_id) / "2025-12"
        period_dir.mkdir(parents=True)

        # company_info（target_month モード用に直下にも置く）
        company_info = {
            "company_id": company_id,
            "company_name": "テスト株式会社",
            "fiscal_year_start": "2025-04-01",
            "fiscal_year_end": "2026-03-31",
        }
        (period_dir / "company_info.json").write_text(
            json.dumps(company_info, ensure_ascii=False), encoding="utf-8"
        )
        (tmp_path / "data" / "e2e" / str(company_id) / "company_info.json").write_text(
            json.dumps(company_info, ensure_ascii=False), encoding="utf-8"
        )

        # 勘定科目（読み込み確認用、空配列で OK）
        (period_dir / "account_items_all.json").write_text("[]", encoding="utf-8")

        # partners
        partners = [
            {"id": 100, "name": "未登録ベンダー", "qualified_invoice_issuer": False},
            {"id": 200, "name": "適格ベンダー", "qualified_invoice_issuer": True},
            {"id": 300, "name": "非課仕入先", "qualified_invoice_issuer": False},
        ]
        (period_dir / "partners_all.json").write_text(
            json.dumps(partners, ensure_ascii=False), encoding="utf-8"
        )

        # taxes_codes（β2-B: 通常課税 + 経過措置 + 非課税）
        taxes = [
            {"code": 136, "name": "purchase_with_tax_10", "name_ja": "課対仕入10%"},
            {"code": 137, "name": "purchase_with_no_tax_10", "name_ja": "非対仕入10%"},
            {"code": 189, "name": "purchase_with_tax_10_exempt_80", "name_ja": "課対仕入（控80）10%"},
        ]
        (period_dir / "taxes_codes.json").write_text(
            json.dumps(taxes, ensure_ascii=False), encoding="utf-8"
        )

        # deals: 5 分類すべてが網羅される構成（β2-B）
        deals = {
            "deals": [
                # 1) NONQUALIFIED_BUT_FULL_DEDUCTION_TAX (Finding 化)
                {
                    "id": 1001, "issue_date": "2025-12-15", "partner_id": 100,
                    "ref_number": "REF-1001",
                    "details": [{"id": 1, "tax_code": 136, "amount": 250000,
                                 "entry_side": "debit", "description": "広告費"}],
                },
                # 2) EXPECTED_FULL_DEDUCTION_TAX (観察用)
                {
                    "id": 1002, "issue_date": "2025-12-16", "partner_id": 200,
                    "details": [{"id": 2, "tax_code": 136, "amount": 300000,
                                 "entry_side": "debit", "description": "適格分"}],
                },
                # 3) NONE (非対仕入)
                {
                    "id": 1003, "issue_date": "2025-12-17", "partner_id": 300,
                    "details": [{"id": 3, "tax_code": 137, "amount": 500000,
                                 "entry_side": "debit", "description": "非課仕入"}],
                },
                # 4) QUALIFIED_BUT_TRANSITIONAL_TAX (Finding 化)
                {
                    "id": 1004, "issue_date": "2025-12-18", "partner_id": 200,
                    "details": [{"id": 4, "tax_code": 189, "amount": 220000,
                                 "entry_side": "debit", "description": "適格×経過措置"}],
                },
                # 5) EXPECTED_TRANSITIONAL_TAX (観察用)
                {
                    "id": 1005, "issue_date": "2025-12-19", "partner_id": 100,
                    "details": [{"id": 5, "tax_code": 189, "amount": 100000,
                                 "entry_side": "debit", "description": "非適格×経過措置"}],
                },
                # 6) PARTNER_UNKNOWN (Finding 化、partner_id が partners_map に無い)
                {
                    "id": 1006, "issue_date": "2025-12-20", "partner_id": 999999,
                    "details": [{"id": 6, "tax_code": 189, "amount": 240000,
                                 "entry_side": "debit", "description": "partner不明×経過措置×20万以上"}],
                },
            ]
        }
        (period_dir / "deals_2025-04_to_2025-12.json").write_text(
            json.dumps(deals, ensure_ascii=False), encoding="utf-8"
        )

        return tmp_path, company_id

    def test_exit_0_classification_counts_complete(self, fixture_dataset):
        """β2-C: classification_counts 6 値 + groups 3 件 + observations が出力される。"""
        tmp_path, company_id = fixture_dataset
        result = _run_cli(
            "--company-id", str(company_id),
            "--target-month", "2025-12",
            cwd=tmp_path,
            project_root=tmp_path,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        payload = json.loads(result.stdout.strip().splitlines()[0])
        assert payload["status"] == "ok"
        assert payload["rule_code"] == "V1-3-20"
        assert payload["scope"] == {"deals": True, "manual_journals": False}

        # 6 値すべてが classification_counts に存在
        counts = payload["classification_counts"]
        expected_keys = {
            "qualified_but_transitional_tax",
            "nonqualified_but_full_deduction_tax",
            "partner_unknown",
            "expected_transitional_tax",
            "expected_full_deduction_tax",
            "none",
        }
        assert set(counts.keys()) == expected_keys

        # 各分類の件数（fixture 設計通り）
        assert counts["nonqualified_but_full_deduction_tax"] == 1  # 1001
        assert counts["expected_full_deduction_tax"] == 1  # 1002
        assert counts["none"] == 1  # 1003
        assert counts["qualified_but_transitional_tax"] == 1  # 1004
        assert counts["expected_transitional_tax"] == 1  # 1005
        assert counts["partner_unknown"] == 1  # 1006

        # 不変条件①（β2-B 維持）：sum(classification_counts) == total_rows
        assert sum(counts.values()) == 6

        # findings_count トップレベル維持（β2-C で削除されない）
        assert payload["findings_count"] == 3

        # β2-C: トップレベル "findings" キーは削除されている
        assert "findings" not in payload
        # candidates_count キーも β2-B 削除済み
        assert "candidates_count" not in payload

        # β2-C: groups は必ず 3 件、順序固定
        groups = payload["groups"]
        assert len(groups) == 3
        assert [g["classification"] for g in groups] == [
            "qualified_but_transitional_tax",
            "nonqualified_but_full_deduction_tax",
            "partner_unknown",
        ]
        # 各 group の findings_count
        assert groups[0]["findings_count"] == 1  # qualified_but_transitional (1004)
        assert groups[1]["findings_count"] == 1  # nonqualified (1001)
        assert groups[2]["findings_count"] == 1  # partner_unknown (1006)

        # 不変条件②（β2-C 新規）：sum(group.findings_count) == findings_count
        assert sum(g["findings_count"] for g in groups) == payload["findings_count"]

        # β2-C: observations.partner_unknown_breakdown
        observations = payload["observations"]
        assert "partner_unknown_breakdown" in observations
        breakdown = observations["partner_unknown_breakdown"]
        # fixture 設計：
        #   - 1006 (partner_id=999999) は partners_map 未紐付け → partner=""
        #     × tax_code=189 (経過措置) × 24 万 → classification=PARTNER_UNKNOWN
        #     → remaining_partner_unknown にカウント
        #   - 他の deal は全て partner_id が partners_map に存在 → partner 空でない
        # → absorbed=0, remaining=1
        assert breakdown == {
            "absorbed_into_nonqualified": 0,
            "remaining_partner_unknown": 1,
        }

    def test_exit_0_findings_target_three_classifications(self, fixture_dataset):
        """β2-C: groups 経由で wallet_txn_id を集合検証、各 finding の raw 8 フィールド + classification。"""
        tmp_path, company_id = fixture_dataset
        result = _run_cli(
            "--company-id", str(company_id),
            "--target-month", "2025-12",
            cwd=tmp_path,
            project_root=tmp_path,
        )
        assert result.returncode == 0
        payload = json.loads(result.stdout.strip().splitlines()[0])

        # groups 経由で wallet_txn_id を集約
        all_findings = [f for g in payload["groups"] for f in g["findings"]]
        ids = {f["wallet_txn_id"] for f in all_findings}
        assert ids == {"1001-1", "1004-4", "1006-6"}

        # 各 Finding の構造（β2-C: classification + raw 8 フィールド）
        for f in all_findings:
            assert f["severity"] == "warning"
            assert f["rule_code"] == "V1-3-20"
            assert f["classification"] in {
                "qualified_but_transitional_tax",
                "nonqualified_but_full_deduction_tax",
                "partner_unknown",
            }
            assert "raw" in f
            assert set(f["raw"].keys()) == {
                "tax_label", "tax_code", "debit_amount", "partner",
                "description", "transaction_date", "source",
                "is_qualified_invoice",
            }

        # group の classification と中の Finding.classification が一致
        for g in payload["groups"]:
            for f in g["findings"]:
                assert f["classification"] == g["classification"]

    def test_exit_0_with_zero_candidates(self, tmp_path):
        """候補 0 件でも exit 0 + groups 3 件すべて空 + observations すべて 0。"""
        company_id = 22222222
        period_dir = tmp_path / "data" / "e2e" / str(company_id) / "2025-12"
        period_dir.mkdir(parents=True)
        info = {
            "company_id": company_id,
            "company_name": "ゼロ件テスト",
            "fiscal_year_start": "2025-04-01",
            "fiscal_year_end": "2026-03-31",
        }
        (period_dir / "company_info.json").write_text(
            json.dumps(info, ensure_ascii=False), encoding="utf-8"
        )
        (tmp_path / "data" / "e2e" / str(company_id) / "company_info.json").write_text(
            json.dumps(info, ensure_ascii=False), encoding="utf-8"
        )
        (period_dir / "account_items_all.json").write_text("[]", encoding="utf-8")
        (period_dir / "partners_all.json").write_text("[]", encoding="utf-8")
        (period_dir / "taxes_codes.json").write_text("[]", encoding="utf-8")
        (period_dir / "deals_2025-04_to_2025-12.json").write_text(
            json.dumps({"deals": []}, ensure_ascii=False), encoding="utf-8"
        )

        result = _run_cli(
            "--company-id", str(company_id),
            "--target-month", "2025-12",
            cwd=tmp_path,
            project_root=tmp_path,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        payload = json.loads(result.stdout.strip().splitlines()[0])
        assert payload["status"] == "ok"
        # β2-C: トップレベル findings キーは存在しない
        assert "findings" not in payload

        # 0 件でも 6 キー揃い、すべて 0
        counts = payload["classification_counts"]
        assert set(counts.keys()) == {
            "qualified_but_transitional_tax",
            "nonqualified_but_full_deduction_tax",
            "partner_unknown",
            "expected_transitional_tax",
            "expected_full_deduction_tax",
            "none",
        }
        assert all(v == 0 for v in counts.values())
        assert payload["findings_count"] == 0

        # β2-C: groups 3 件すべて findings_count=0 / findings=[]
        groups = payload["groups"]
        assert len(groups) == 3
        assert [g["classification"] for g in groups] == [
            "qualified_but_transitional_tax",
            "nonqualified_but_full_deduction_tax",
            "partner_unknown",
        ]
        for g in groups:
            assert g["findings_count"] == 0
            assert g["findings"] == []

        # β2-C: observations すべて 0
        breakdown = payload["observations"]["partner_unknown_breakdown"]
        assert breakdown == {
            "absorbed_into_nonqualified": 0,
            "remaining_partner_unknown": 0,
        }

        # 不変条件②: sum(group.findings_count) == findings_count
        assert sum(g["findings_count"] for g in groups) == payload["findings_count"]


# ─────────────────────────────────────────────────────────────────────
# β2-B クラスタ A: 5 分類体系の単体テスト
# ─────────────────────────────────────────────────────────────────────

def _make_row_b(v1320, **overrides):
    """β2-B 用テストヘルパ（tax_code フィールド対応）。

    デフォルト: 適格マークなし、partner あり、debit 25 万、tax_code=136（通常課税仕入）。
    """
    base = {
        "wallet_txn_id": "tx-b",
        "transaction_date": date(2025, 12, 15),
        "partner": "ベンダー",
        "description": "",
        "tax_label": "課対仕入10%",
        "debit_amount": Decimal("250000"),
        "credit_amount": Decimal("0"),
        "is_qualified_invoice": False,
        "tax_code": 136,
    }
    base.update(overrides)
    return v1320.InvoiceCheckRow(**base)


class TestClassifyTransaction:
    """classify_transaction の 5 分類 + NONE すべてを検証する。"""

    # 通常の 4 象限分類

    def test_qualified_but_transitional_tax(self, v1320, v1320_schema):
        """適格 × 経過措置 → QUALIFIED_BUT_TRANSITIONAL_TAX。"""
        row = _make_row_b(
            v1320,
            is_qualified_invoice=True,
            tax_code=189,  # 課対仕入（控80）10%
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
        )

    def test_nonqualified_but_full_deduction_tax_over_threshold(
        self, v1320, v1320_schema
    ):
        """非適格 × 通常課税仕入 × 20 万以上 → NONQUALIFIED_BUT_FULL_DEDUCTION_TAX。"""
        row = _make_row_b(
            v1320,
            is_qualified_invoice=False,
            tax_code=136,
            debit_amount=Decimal("250000"),
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_nonqualified_full_deduction_under_threshold_is_none(
        self, v1320, v1320_schema
    ):
        """非適格 × 通常課税仕入 × 20 万未満 → NONE（金額条件で外れる）。"""
        row = _make_row_b(
            v1320,
            is_qualified_invoice=False,
            tax_code=136,
            debit_amount=Decimal("199999"),
        )
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    def test_expected_full_deduction_tax(self, v1320, v1320_schema):
        """適格 × 通常課税仕入 → EXPECTED_FULL_DEDUCTION_TAX（観察用）。"""
        row = _make_row_b(
            v1320,
            is_qualified_invoice=True,
            tax_code=136,
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.EXPECTED_FULL_DEDUCTION_TAX
        )

    def test_expected_transitional_tax(self, v1320, v1320_schema):
        """非適格 × 経過措置 → EXPECTED_TRANSITIONAL_TAX（観察用）。"""
        row = _make_row_b(
            v1320,
            is_qualified_invoice=False,
            tax_code=189,
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.EXPECTED_TRANSITIONAL_TAX
        )

    # partner 不明の推定吸収パターン（解釈 X）

    def test_partner_unknown_full_deduction_over_threshold_absorbed(
        self, v1320, v1320_schema
    ):
        """partner 不明 × 通常課税仕入 × 20 万以上 → NONQUALIFIED_BUT_FULL_DEDUCTION_TAX。

        解釈 X 推定吸収：partner 不明より tax 分類を優先する。
        """
        row = _make_row_b(
            v1320,
            partner="",
            is_qualified_invoice=False,
            tax_code=136,
            debit_amount=Decimal("250000"),
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_partner_unknown_transitional_over_threshold(self, v1320, v1320_schema):
        """partner 不明 × 経過措置 × 20 万以上 → PARTNER_UNKNOWN（経過措置のため判定保留）。"""
        row = _make_row_b(
            v1320,
            partner="",
            is_qualified_invoice=False,
            tax_code=189,
            debit_amount=Decimal("250000"),
        )
        assert v1320.classify_transaction(row) == (
            v1320_schema.Classification.PARTNER_UNKNOWN
        )

    def test_partner_unknown_under_threshold_is_none(self, v1320, v1320_schema):
        """partner 不明 × 経過措置 × 20 万未満 → NONE。"""
        row = _make_row_b(
            v1320,
            partner="",
            tax_code=189,
            debit_amount=Decimal("100000"),
        )
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    def test_partner_unknown_other_tax_is_none(self, v1320, v1320_schema):
        """partner 不明 × 通常課税仕入でも経過措置でもない → NONE。"""
        row = _make_row_b(
            v1320,
            partner="",
            tax_code=2,  # 対象外 (non_taxable)
            debit_amount=Decimal("500000"),
        )
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    # 5 分類対象外（NONE 経路）

    def test_none_when_other_tax_code(self, v1320, v1320_schema):
        """通常課税仕入でも経過措置でもない → NONE。"""
        row = _make_row_b(v1320, tax_code=2, debit_amount=Decimal("500000"))
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    def test_none_when_tax_code_is_none(self, v1320, v1320_schema):
        """tax_code=None → 判定不能 → NONE。"""
        row = _make_row_b(v1320, tax_code=None)
        assert v1320.classify_transaction(row) == v1320_schema.Classification.NONE

    # 方針 3: classify_transaction は必ず Classification を返す

    def test_classify_transaction_always_returns_classification(
        self, v1320, v1320_schema
    ):
        """6 値のいずれかが必ず返る。None は返さない。"""
        for tc in [None, 0, 33, 34, 108, 136, 163, 182, 183, 200, 230, 231, 999]:
            for qi in [True, False]:
                for amt in [Decimal("0"), Decimal("199999"), Decimal("200000")]:
                    for pt in ["", "X"]:
                        row = _make_row_b(
                            v1320,
                            tax_code=tc,
                            is_qualified_invoice=qi,
                            debit_amount=amt,
                            partner=pt,
                        )
                        result = v1320.classify_transaction(row)
                        assert isinstance(result, v1320_schema.Classification)


class TestTransitionalTaxBoundary:
    """is_transitional_tax の境界条件。"""

    def test_tax_code_183_is_transitional(self, v1320):
        """範囲下限。"""
        assert v1320.is_transitional_tax(183) is True

    def test_tax_code_230_is_transitional(self, v1320):
        """範囲上限。"""
        assert v1320.is_transitional_tax(230) is True

    def test_tax_code_182_is_not_transitional(self, v1320):
        """範囲外（下限の 1 つ下）。"""
        assert v1320.is_transitional_tax(182) is False

    def test_tax_code_231_is_not_transitional(self, v1320):
        """範囲外（上限の 1 つ上）。"""
        assert v1320.is_transitional_tax(231) is False

    def test_tax_code_none_is_not_transitional(self, v1320):
        """方針 1: None は False 扱い。"""
        assert v1320.is_transitional_tax(None) is False


class TestFullDeductionTaxBoundary:
    """is_full_deduction_tax の境界条件（飛び地 4 点）。"""

    def test_tax_code_34(self, v1320):
        assert v1320.is_full_deduction_tax(34) is True

    def test_tax_code_108(self, v1320):
        """旧 8% 標準税率時代の経過分。β2-B では通常課税仕入扱い（β2-D で違和感観察）。"""
        assert v1320.is_full_deduction_tax(108) is True

    def test_tax_code_136(self, v1320):
        """現行 10% 標準税率。"""
        assert v1320.is_full_deduction_tax(136) is True

    def test_tax_code_163(self, v1320):
        """軽減税率 8%。"""
        assert v1320.is_full_deduction_tax(163) is True

    def test_tax_code_35_is_not_full_deduction(self, v1320):
        """非対仕入（飛び地の隣）。"""
        assert v1320.is_full_deduction_tax(35) is False

    def test_tax_code_137_is_not_full_deduction(self, v1320):
        """非対仕入10%（飛び地の隣）。"""
        assert v1320.is_full_deduction_tax(137) is False

    def test_tax_code_none_is_not_full_deduction(self, v1320):
        """方針 1: None は False 扱い。"""
        assert v1320.is_full_deduction_tax(None) is False

    def test_no_overlap_with_transitional(self, v1320):
        """経過措置範囲との重複なし（β2-B クラスタ 0 で 3 社確認済）。"""
        assert v1320.FULL_DEDUCTION_TAX_CODES.isdisjoint(
            v1320.TRANSITIONAL_TAX_CODES
        )


class TestInvoiceCheckRowTaxCode:
    """β2-B で追加した tax_code フィールドの基本動作。"""

    def test_tax_code_default_is_none(self, v1320):
        """tax_code 未指定 → None。"""
        row = v1320.InvoiceCheckRow(wallet_txn_id="x")
        assert row.tax_code is None

    def test_tax_code_set(self, v1320):
        row = v1320.InvoiceCheckRow(wallet_txn_id="x", tax_code=136)
        assert row.tax_code == 136


class TestClassificationEnum:
    """Classification Enum の値検証。"""

    def test_six_values(self, v1320_schema):
        values = {c.value for c in v1320_schema.Classification}
        assert values == {
            "qualified_but_transitional_tax",
            "nonqualified_but_full_deduction_tax",
            "partner_unknown",
            "expected_transitional_tax",
            "expected_full_deduction_tax",
            "none",
        }


class TestBeta1RemovalCheck:
    """β1 削除対象（find_candidates / is_taxable_purchase / TAXABLE_PURCHASE_PREFIXES）が
    実際に削除されていることを保証する。"""

    def test_find_candidates_removed(self, v1320):
        assert not hasattr(v1320, "find_candidates")

    def test_is_taxable_purchase_removed(self, v1320):
        assert not hasattr(v1320, "is_taxable_purchase")

    def test_taxable_purchase_prefixes_removed(self, v1320):
        assert not hasattr(v1320, "TAXABLE_PURCHASE_PREFIXES")

    def test_amount_threshold_preserved(self, v1320):
        """β2-B 維持対象: AMOUNT_THRESHOLD は 20 万円のまま。"""
        assert v1320.AMOUNT_THRESHOLD == Decimal("200000")

    def test_invoice_check_row_type_preserved(self, v1320):
        """β2-B 維持対象: InvoiceCheckRow 型名は維持（フィールド追加のみ）。"""
        assert hasattr(v1320, "InvoiceCheckRow")


# ─────────────────────────────────────────────────────────────────────
# β2-C クラスタ A: Finding スキーマ拡張 + テンプレート文言 + raw 8 フィールド
# ─────────────────────────────────────────────────────────────────────

def _make_row_c(v1320, **overrides):
    """β2-C 用テストヘルパ（tax_code フィールド対応 + 適当な partner 入り）。

    デフォルト: 適格マークなし、partner="未登録ベンダー"、debit 25 万、tax_code=136。
    """
    base = {
        "wallet_txn_id": "tx-c",
        "transaction_date": date(2025, 12, 15),
        "partner": "未登録ベンダー",
        "description": "広告費",
        "tax_label": "課対仕入10%",
        "debit_amount": Decimal("250000"),
        "credit_amount": Decimal("0"),
        "is_qualified_invoice": False,
        "tax_code": 136,
    }
    base.update(overrides)
    return v1320.InvoiceCheckRow(**base)


class TestInvoiceFindingClassification:
    """β2-C: InvoiceFinding に追加された classification フィールドの基本動作。"""

    def test_classification_field_default_is_none(self, v1320_schema):
        """デフォルト None で生成可能（V1-3-10 統合余地、案 B）。"""
        f = v1320_schema.InvoiceFinding(
            severity="warning",
            message="x",
            wallet_txn_id="t1",
        )
        assert f.classification is None

    def test_classification_field_with_enum_value(self, v1320_schema):
        """Classification 値で生成可能。"""
        f = v1320_schema.InvoiceFinding(
            severity="warning",
            message="x",
            wallet_txn_id="t1",
            classification=v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        )
        assert f.classification == (
            v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )

    def test_finding_remains_frozen(self, v1320_schema):
        """frozen=True が維持されている。"""
        f = v1320_schema.InvoiceFinding(
            severity="warning", message="x", wallet_txn_id="t1",
        )
        with pytest.raises(Exception):
            f.classification = (
                v1320_schema.Classification.PARTNER_UNKNOWN
            )  # type: ignore[misc]


class TestRawSchemaExtended:
    """β2-C: _build_raw が 8 フィールドを返すことの検証。"""

    def test_raw_has_eight_fields(self, v1320, v1320_checker, v1320_schema):
        row = _make_row_c(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert set(f.raw.keys()) == {
            "tax_label",
            "tax_code",
            "debit_amount",
            "partner",
            "description",
            "transaction_date",
            "source",
            "is_qualified_invoice",
        }

    def test_raw_includes_tax_code(self, v1320, v1320_checker, v1320_schema):
        row = _make_row_c(v1320, tax_code=189)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
        )
        assert f.raw["tax_code"] == 189

    def test_raw_tax_code_can_be_none(self, v1320, v1320_checker, v1320_schema):
        """tax_code が None の row は通常 NONE 分類になり Finding 化されないが、
        _build_raw 自体は None を許容して raw に詰める（JSON では null）。"""
        row = _make_row_c(v1320, tax_code=None)
        # NONE 分類は KeyError なので、3 分類のいずれかを渡して動作のみ確認
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert f.raw["tax_code"] is None

    def test_raw_includes_is_qualified_invoice(self, v1320, v1320_checker, v1320_schema):
        row = _make_row_c(v1320, is_qualified_invoice=True)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
        )
        assert f.raw["is_qualified_invoice"] is True

    def test_raw_preserves_existing_six_fields(self, v1320, v1320_checker, v1320_schema):
        """β1/β2-B の 6 フィールドが値も含めて維持されている。"""
        row = _make_row_c(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert f.raw["tax_label"] == "課対仕入10%"
        assert f.raw["debit_amount"] == "250000"
        assert f.raw["partner"] == "未登録ベンダー"
        assert f.raw["description"] == "広告費"
        assert f.raw["transaction_date"] == "2025-12-15"
        assert f.raw["source"] == "deal"

    def test_raw_transaction_date_none_becomes_empty_string(
        self, v1320, v1320_checker, v1320_schema
    ):
        """transaction_date が None なら raw では空文字 ""（β2-C 破壊的変更、GO v2 論点 0-3）。

        β1/β2-B では None だったが、β2-C で JSON 型安定性 + Excel 表示のため
        空文字 "" に統一。実装指示書 §5.2 A-6 仕様通り。
        """
        row = _make_row_c(v1320, transaction_date=None)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert f.raw["transaction_date"] == ""

    def test_raw_does_not_include_classification(
        self, v1320, v1320_checker, v1320_schema
    ):
        """DRY 原則：classification は Finding.classification、raw には含めない。"""
        row = _make_row_c(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert "classification" not in f.raw


class TestMessageTemplate:
    """β2-C: MESSAGE_TEMPLATES + _format_message のテンプレート文言生成。"""

    def test_message_for_qualified_but_transitional_tax(
        self, v1320, v1320_checker, v1320_schema
    ):
        row = _make_row_c(
            v1320,
            partner="㈱適格ベンダー",
            tax_label="課対仕入（控80）10%",
            tax_code=189,
            debit_amount=Decimal("207000"),
            is_qualified_invoice=True,
        )
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
        )
        assert f.message == (
            "適格事業者ですが経過措置コード（課対仕入（控80）10%）が使用されています: "
            "㈱適格ベンダー / 課対仕入（控80）10% / 借方 207,000 円。"
            "通常の課税仕入コードへの修正をご検討ください"
        )

    def test_message_for_nonqualified_but_full_deduction_tax(
        self, v1320, v1320_checker, v1320_schema
    ):
        row = _make_row_c(
            v1320,
            partner="",
            tax_label="課対仕入10%",
            tax_code=136,
            debit_amount=Decimal("258500"),
            is_qualified_invoice=False,
        )
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert f.message == (
            "非適格事業者ですが通常課税仕入（課対仕入10%）として処理されています: "
            "取引先不明 / 課対仕入10% / 借方 258,500 円。"
            "経過措置コード（控80/控50）への修正をご検討ください"
        )

    def test_message_for_partner_unknown(
        self, v1320, v1320_checker, v1320_schema
    ):
        row = _make_row_c(
            v1320,
            partner="",
            tax_label="課対仕入（控80）10%",
            tax_code=189,
            debit_amount=Decimal("250000"),
            is_qualified_invoice=False,
        )
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.PARTNER_UNKNOWN
        )
        assert f.message == (
            "取引先がマスタに登録されていない経過措置取引です: "
            "取引先不明 / 課対仕入（控80）10% / 借方 250,000 円。"
            "取引先マスタの整備と税区分の妥当性確認をお願いします"
        )

    def test_message_with_empty_partner_displays_torihikisaki_fumei_all_three(
        self, v1320, v1320_checker, v1320_schema
    ):
        """partner 空時は 3 分類すべてで「取引先不明」が差し込まれる（X2-α）。"""
        Classification = v1320_schema.Classification
        for cls, tax_code, tax_label in [
            (Classification.QUALIFIED_BUT_TRANSITIONAL_TAX, 189, "課対仕入（控80）10%"),
            (Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, 136, "課対仕入10%"),
            (Classification.PARTNER_UNKNOWN, 189, "課対仕入（控80）10%"),
        ]:
            row = _make_row_c(
                v1320, partner="", tax_label=tax_label, tax_code=tax_code,
            )
            f = v1320_checker.to_finding(row, cls)
            assert "取引先不明" in f.message, f"classification={cls}"

    def test_message_includes_amount_with_comma(
        self, v1320, v1320_checker, v1320_schema
    ):
        """金額は 3 桁カンマ区切り。"""
        row = _make_row_c(
            v1320, debit_amount=Decimal("1234567"), tax_code=136,
        )
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert "1,234,567 円" in f.message

    def test_message_does_not_end_with_period(
        self, v1320, v1320_checker, v1320_schema
    ):
        """最終 message は末尾句点なし（GO 論点 0-4 確定）。"""
        row = _make_row_c(v1320)
        f = v1320_checker.to_finding(
            row, v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert not f.message.endswith("。")

    def test_message_for_undefined_classification_raises_keyerror(
        self, v1320, v1320_checker, v1320_schema
    ):
        """EXPECTED_* / NONE が誤って渡されると KeyError（設計違反検知）。"""
        row = _make_row_c(v1320)
        for cls in [
            v1320_schema.Classification.EXPECTED_TRANSITIONAL_TAX,
            v1320_schema.Classification.EXPECTED_FULL_DEDUCTION_TAX,
            v1320_schema.Classification.NONE,
        ]:
            with pytest.raises(KeyError):
                v1320_checker.to_finding(row, cls)


class TestToFindingsListAPI:
    """β2-C: to_findings のリスト API 検証（引数ペアの長さ整合 + 順序保持）。"""

    def test_to_findings_pairs_rows_with_classifications(
        self, v1320, v1320_checker, v1320_schema
    ):
        Classification = v1320_schema.Classification
        rows = [
            _make_row_c(v1320, wallet_txn_id="A", tax_code=136),
            _make_row_c(v1320, wallet_txn_id="B", tax_code=189),
            _make_row_c(v1320, wallet_txn_id="C", tax_code=136),
        ]
        classifications = [
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.PARTNER_UNKNOWN,
            Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
        ]
        findings = v1320_checker.to_findings(rows, classifications)
        assert [f.wallet_txn_id for f in findings] == ["A", "B", "C"]
        assert [f.classification for f in findings] == classifications

    def test_to_findings_empty_pair(self, v1320_checker):
        """空リスト × 空リスト → 空リスト。"""
        assert v1320_checker.to_findings([], []) == []

    def test_to_findings_length_mismatch_raises_valueerror(
        self, v1320, v1320_checker, v1320_schema
    ):
        rows = [_make_row_c(v1320)]
        classifications = []
        with pytest.raises(ValueError):
            v1320_checker.to_findings(rows, classifications)


# ─────────────────────────────────────────────────────────────────────
# β2-C クラスタ B: FindingGroup（schema） + find_groups（run.py）
# ─────────────────────────────────────────────────────────────────────

def _make_finding(v1320_schema, *, classification, wallet_txn_id="t-x"):
    """β2-C 用の最小 InvoiceFinding ファクトリ（テスト専用）。"""
    return v1320_schema.InvoiceFinding(
        severity="warning",
        message="x",
        wallet_txn_id=wallet_txn_id,
        classification=classification,
        rule_code="V1-3-20",
        raw={},
    )


class TestFindingGroup:
    """β2-C: schema.FindingGroup の基本動作。"""

    def test_finding_group_creation(self, v1320_schema):
        Classification = v1320_schema.Classification
        f = _make_finding(
            v1320_schema,
            classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            wallet_txn_id="t1",
        )
        g = v1320_schema.FindingGroup(
            classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            findings_count=1,
            findings=[f],
        )
        assert g.classification == (
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        )
        assert g.findings_count == 1
        assert g.findings == [f]

    def test_finding_group_empty(self, v1320_schema):
        g = v1320_schema.FindingGroup(
            classification=v1320_schema.Classification.PARTNER_UNKNOWN,
            findings_count=0,
            findings=[],
        )
        assert g.findings_count == 0
        assert g.findings == []

    def test_finding_group_classification_field_is_classification_enum(
        self, v1320_schema
    ):
        g = v1320_schema.FindingGroup(
            classification=v1320_schema.Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
            findings_count=0,
            findings=[],
        )
        assert isinstance(g.classification, v1320_schema.Classification)

    def test_finding_group_is_frozen(self, v1320_schema):
        """frozen=True：immutable 確認。"""
        g = v1320_schema.FindingGroup(
            classification=v1320_schema.Classification.PARTNER_UNKNOWN,
            findings_count=0,
            findings=[],
        )
        with pytest.raises(Exception):
            g.findings_count = 1  # type: ignore[misc]


class TestFindGroups:
    """β2-C: run.find_groups の変換ロジック。"""

    def test_find_groups_returns_three_groups(self, v1320, v1320_schema):
        """findings 0 件でも常に 3 件返る。"""
        groups = v1320.find_groups([])
        assert len(groups) == 3

    def test_find_groups_order_is_fixed(self, v1320, v1320_schema):
        """順序保証：QUALIFIED → NONQUALIFIED → PARTNER_UNKNOWN（順不同入力でも固定）。"""
        Classification = v1320_schema.Classification
        # 任意順序の findings（partner_unknown → qualified → nonqualified）
        findings = [
            _make_finding(v1320_schema, classification=Classification.PARTNER_UNKNOWN, wallet_txn_id="C"),
            _make_finding(v1320_schema, classification=Classification.QUALIFIED_BUT_TRANSITIONAL_TAX, wallet_txn_id="A"),
            _make_finding(v1320_schema, classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, wallet_txn_id="B"),
        ]
        groups = v1320.find_groups(findings)
        assert [g.classification for g in groups] == [
            Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.PARTNER_UNKNOWN,
        ]

    def test_find_groups_with_empty_findings_returns_three_empty_groups(
        self, v1320, v1320_schema
    ):
        groups = v1320.find_groups([])
        assert all(g.findings == [] for g in groups)
        assert all(g.findings_count == 0 for g in groups)

    def test_find_groups_findings_count_matches_findings_length(
        self, v1320, v1320_schema
    ):
        """各 group の findings_count が findings.length と一致。"""
        Classification = v1320_schema.Classification
        findings = [
            _make_finding(v1320_schema, classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, wallet_txn_id="A"),
            _make_finding(v1320_schema, classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, wallet_txn_id="B"),
            _make_finding(v1320_schema, classification=Classification.PARTNER_UNKNOWN, wallet_txn_id="C"),
        ]
        groups = v1320.find_groups(findings)
        for g in groups:
            assert g.findings_count == len(g.findings)
        # 内訳確認
        by_cls = {g.classification: g for g in groups}
        assert by_cls[Classification.QUALIFIED_BUT_TRANSITIONAL_TAX].findings_count == 0
        assert by_cls[Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX].findings_count == 2
        assert by_cls[Classification.PARTNER_UNKNOWN].findings_count == 1

    def test_find_groups_does_not_include_expected_or_none(
        self, v1320, v1320_schema
    ):
        """EXPECTED_* / NONE は groups に現れない（混入しても無視）。"""
        Classification = v1320_schema.Classification
        # 通常 findings には EXPECTED_* / NONE は含まれないが、
        # 万一混入しても find_groups は 3 分類のみフィルタする。
        findings = [
            _make_finding(v1320_schema, classification=Classification.EXPECTED_TRANSITIONAL_TAX),
            _make_finding(v1320_schema, classification=Classification.EXPECTED_FULL_DEDUCTION_TAX),
            _make_finding(v1320_schema, classification=Classification.NONE),
        ]
        groups = v1320.find_groups(findings)
        assert len(groups) == 3
        # 全 group が空（混入した EXPECTED_* / NONE は無視される）
        assert all(g.findings_count == 0 for g in groups)
        # group の classification 自体に EXPECTED_* / NONE が混じらないことも確認
        cls_in_groups = {g.classification for g in groups}
        assert Classification.EXPECTED_TRANSITIONAL_TAX not in cls_in_groups
        assert Classification.EXPECTED_FULL_DEDUCTION_TAX not in cls_in_groups
        assert Classification.NONE not in cls_in_groups

    def test_find_groups_preserves_finding_order_within_group(
        self, v1320, v1320_schema
    ):
        """同 classification 内の Finding は入力順を保持（β1 の単票方針継承）。"""
        Classification = v1320_schema.Classification
        findings = [
            _make_finding(v1320_schema, classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, wallet_txn_id="A"),
            _make_finding(v1320_schema, classification=Classification.PARTNER_UNKNOWN, wallet_txn_id="B"),
            _make_finding(v1320_schema, classification=Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, wallet_txn_id="C"),
        ]
        groups = v1320.find_groups(findings)
        by_cls = {g.classification: g for g in groups}
        assert [
            f.wallet_txn_id
            for f in by_cls[Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX].findings
        ] == ["A", "C"]


class TestRunPyConstants:
    """β2-C: run.py に追加された定数の妥当性。"""

    def test_group_classification_order_has_three_entries(self, v1320, v1320_schema):
        Classification = v1320_schema.Classification
        assert v1320.GROUP_CLASSIFICATION_ORDER == (
            Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.PARTNER_UNKNOWN,
        )

    def test_finding_target_classifications_is_frozenset(self, v1320, v1320_schema):
        assert isinstance(v1320.FINDING_TARGET_CLASSIFICATIONS, frozenset)
        Classification = v1320_schema.Classification
        assert v1320.FINDING_TARGET_CLASSIFICATIONS == frozenset({
            Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
            Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
            Classification.PARTNER_UNKNOWN,
        })

    def test_finding_target_classifications_excludes_expected_and_none(
        self, v1320, v1320_schema
    ):
        Classification = v1320_schema.Classification
        assert Classification.EXPECTED_TRANSITIONAL_TAX not in v1320.FINDING_TARGET_CLASSIFICATIONS
        assert Classification.EXPECTED_FULL_DEDUCTION_TAX not in v1320.FINDING_TARGET_CLASSIFICATIONS
        assert Classification.NONE not in v1320.FINDING_TARGET_CLASSIFICATIONS


class TestFindingToDict:
    """β2-C: _finding_to_dict の JSON シリアライズ。"""

    def test_finding_to_dict_includes_classification_value(self, v1320, v1320_schema):
        f = _make_finding(
            v1320_schema,
            classification=v1320_schema.Classification.PARTNER_UNKNOWN,
            wallet_txn_id="t1",
        )
        d = v1320._finding_to_dict(f)
        assert d["classification"] == "partner_unknown"

    def test_finding_to_dict_with_classification_none(self, v1320, v1320_schema):
        """V1-3-10 互換：classification=None は null として出力。"""
        f = v1320_schema.InvoiceFinding(
            severity="warning",
            message="x",
            wallet_txn_id="t1",
            classification=None,
            rule_code="V1-3-20",
            raw={},
        )
        d = v1320._finding_to_dict(f)
        assert d["classification"] is None

    def test_finding_to_dict_keys(self, v1320, v1320_schema):
        f = _make_finding(
            v1320_schema,
            classification=v1320_schema.Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
        )
        d = v1320._finding_to_dict(f)
        assert set(d.keys()) == {
            "severity", "rule_code", "classification",
            "message", "wallet_txn_id", "raw",
        }


# ─────────────────────────────────────────────────────────────────────
# β2-C クラスタ C: observations（partner_unknown_breakdown）
# ─────────────────────────────────────────────────────────────────────

class TestObservations:
    """β2-C: _calculate_partner_unknown_breakdown の集計検証。

    解釈 X（partner 空 × 通常課税仕入 × 20 万以上を nonqualified に推定吸収）の
    可視化を担う。
    """

    def test_observations_partner_unknown_breakdown_keys(self, v1320, v1320_schema):
        """absorbed_into_nonqualified / remaining_partner_unknown の 2 キー。"""
        breakdown = v1320._calculate_partner_unknown_breakdown([])
        assert set(breakdown.keys()) == {
            "absorbed_into_nonqualified",
            "remaining_partner_unknown",
        }

    def test_observations_with_no_partner_unknown_returns_zero(
        self, v1320, v1320_schema
    ):
        """partner 空が 1 件もないケース → 両方 0。"""
        Classification = v1320_schema.Classification
        classified = [
            (_make_row_b(v1320, partner="A", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            (_make_row_b(v1320, partner="B", tax_code=189), Classification.EXPECTED_TRANSITIONAL_TAX),
        ]
        breakdown = v1320._calculate_partner_unknown_breakdown(classified)
        assert breakdown == {
            "absorbed_into_nonqualified": 0,
            "remaining_partner_unknown": 0,
        }

    def test_observations_absorbed_into_nonqualified_count(
        self, v1320, v1320_schema
    ):
        """partner 空 × NONQUALIFIED_BUT_FULL_DEDUCTION_TAX が absorbed としてカウント。"""
        Classification = v1320_schema.Classification
        classified = [
            # partner 空 × NONQUALIFIED → absorbed
            (_make_row_b(v1320, partner="", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            (_make_row_b(v1320, partner="", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            # partner あり × NONQUALIFIED → カウント対象外
            (_make_row_b(v1320, partner="X", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            # partner 空 × NONE → カウント対象外
            (_make_row_b(v1320, partner="", tax_code=2), Classification.NONE),
        ]
        breakdown = v1320._calculate_partner_unknown_breakdown(classified)
        assert breakdown["absorbed_into_nonqualified"] == 2
        assert breakdown["remaining_partner_unknown"] == 0

    def test_observations_remaining_partner_unknown_count(
        self, v1320, v1320_schema
    ):
        """partner 空 × PARTNER_UNKNOWN が remaining としてカウント。"""
        Classification = v1320_schema.Classification
        classified = [
            (_make_row_b(v1320, partner="", tax_code=189), Classification.PARTNER_UNKNOWN),
            (_make_row_b(v1320, partner="", tax_code=189), Classification.PARTNER_UNKNOWN),
            (_make_row_b(v1320, partner="", tax_code=189), Classification.PARTNER_UNKNOWN),
            # partner あり → カウント対象外
            (_make_row_b(v1320, partner="X", tax_code=189), Classification.EXPECTED_TRANSITIONAL_TAX),
        ]
        breakdown = v1320._calculate_partner_unknown_breakdown(classified)
        assert breakdown["absorbed_into_nonqualified"] == 0
        assert breakdown["remaining_partner_unknown"] == 3

    def test_observations_mixed_absorbed_and_remaining(
        self, v1320, v1320_schema
    ):
        """absorbed と remaining が両方発生するケース。"""
        Classification = v1320_schema.Classification
        classified = [
            (_make_row_b(v1320, partner="", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            (_make_row_b(v1320, partner="", tax_code=189), Classification.PARTNER_UNKNOWN),
            (_make_row_b(v1320, partner="", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
        ]
        breakdown = v1320._calculate_partner_unknown_breakdown(classified)
        assert breakdown == {
            "absorbed_into_nonqualified": 2,
            "remaining_partner_unknown": 1,
        }

    def test_observations_only_counts_partner_empty(self, v1320, v1320_schema):
        """partner が空でない場合は absorbed/remaining どちらもカウントしない。"""
        Classification = v1320_schema.Classification
        classified = [
            # partner あり × NONQUALIFIED → 対象外
            (_make_row_b(v1320, partner="X", tax_code=136), Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX),
            # partner あり × PARTNER_UNKNOWN（理論上ありえないが防御） → 対象外
            (_make_row_b(v1320, partner="Y", tax_code=189), Classification.PARTNER_UNKNOWN),
        ]
        breakdown = v1320._calculate_partner_unknown_breakdown(classified)
        assert breakdown == {
            "absorbed_into_nonqualified": 0,
            "remaining_partner_unknown": 0,
        }

