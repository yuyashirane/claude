"""Phase 1〜6 共通の pytest conftest。

責務:
    1. sys.path に $PROJECT_ROOT を追加（skills パッケージの解決）
    2. schema.py を importlib で安全にロード（Python 3.12 対応）
    3. 共通 fixture の提供（schema モジュール、サンプル row/ctx）

Python 3.12 対応メモ:
    Python 3.12 から dataclass 評価時に sys.modules[cls.__module__] を参照する。
    importlib.util.spec_from_file_location でロードしたモジュールを
    sys.modules に登録しないと AttributeError: 'NoneType' object has no attribute
    '__dict__' が発生する。本 conftest で一度だけ登録し、以後のテストは
    fixture 経由で schema を受け取る。
"""
import importlib.util
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

# ─────────────────────────────────────────────────────────────
# 1. sys.path 設定（$PROJECT_ROOT を追加）
# ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ─────────────────────────────────────────────────────────────
# 2. schema.py の安全なロード（Python 3.12 対応・恒久版）
# ─────────────────────────────────────────────────────────────

_SCHEMA_PATH = (
    PROJECT_ROOT
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
)


def _load_module_safe(name: str, path: Path):
    """importlib でモジュールをロードし、sys.modules に登録する。

    Python 3.12 の frozen dataclass が sys.modules 参照を要求するため、
    exec_module の前に必ず sys.modules に登録する。

    Args:
        name: モジュール名（sys.modules のキー）
        path: .py ファイルの絶対パス

    Returns:
        ロードされたモジュール
    """
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module '{name}' from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# schema モジュールをロード（テストセッション開始時に1回だけ）
_schema_mod = _load_module_safe("schema", _SCHEMA_PATH)

# ─────────────────────────────────────────────────────────────
# 3. 共通 fixture
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def schema():
    """schema モジュールを返す fixture。

    Usage:
        def test_something(schema):
            row = schema.TransactionRow(wallet_txn_id="t1")
    """
    return _schema_mod


@pytest.fixture
def sample_row():
    """TC-03 テスト等で使う標準的な TransactionRow。"""
    return _schema_mod.TransactionRow(
        wallet_txn_id="test-001",
        deal_id="d-001",
        transaction_date=date(2026, 3, 15),
        account="給与手当",
        tax_label="課対仕入10%",
        partner="",
        description="2026年3月分給与",
        debit_amount=Decimal("300000"),
        credit_amount=Decimal("0"),
    )


@pytest.fixture
def sample_ctx():
    """標準的な CheckContext。テスト会社 ID 2422271（11月決算）。"""
    return _schema_mod.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2025, 12, 1),
        period_end=date(2026, 11, 30),
    )


@pytest.fixture
def make_row_factory():
    """make_row ファクトリ関数を返す fixture。

    Usage:
        def test_something(make_row_factory):
            row = make_row_factory(account="地代家賃", tax_label="課対仕入10%")
    """
    from tests.fixtures.make_row import make_row
    return make_row
