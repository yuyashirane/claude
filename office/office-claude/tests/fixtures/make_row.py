"""TransactionRow factory for tests.

テストケースで「変えたい部分だけ指定」するパターンを提供する。
デフォルト値は TC-03（給与系）のテストで最も使いやすい値に設定。

出典: STEP4-D 統合版 §III.5.1（fixture-based design）
      Step 4-C v0.2.1 §2.5（TransactionRow の正規形）

Usage:
    row = make_row()                              # 全デフォルト
    row = make_row(account="地代家賃")             # 科目だけ変更
    row = make_row(tax_label="対象外", confidence=60)  # 複数変更
"""
from datetime import date
from decimal import Decimal
from pathlib import Path
import importlib.util
import sys

# schema.py のロード（conftest.py と同じパターン）
_SCHEMA_PATH = (
    Path(__file__).parent.parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
)


def _get_schema():
    if "schema" in sys.modules:
        return sys.modules["schema"]
    spec = importlib.util.spec_from_file_location("schema", _SCHEMA_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["schema"] = mod
    spec.loader.exec_module(mod)
    return mod


def make_row(
    wallet_txn_id: str = "test-row-001",
    deal_id: str | None = "d-001",
    transaction_date: date | None = None,
    account: str = "給与手当",
    tax_label: str = "課対仕入10%",
    partner: str = "",
    description: str = "テスト仕訳",
    debit_amount: Decimal | int | str = 300000,
    credit_amount: Decimal | int | str = 0,
    item: str | None = None,
    memo_tag: str | None = None,
    notes: str | None = None,
):
    """TransactionRow を生成する factory 関数。

    デフォルト値は TC-03（給与系・借方・課税仕入10%）のテストに最適化。
    テストケースでは変えたいフィールドだけ引数で指定する。

    Args:
        debit_amount: int/str を渡すと Decimal に自動変換
        credit_amount: 同上
        transaction_date: None の場合は date(2026, 3, 15) をデフォルト使用

    Returns:
        TransactionRow インスタンス（frozen=True）
    """
    schema = _get_schema()

    if transaction_date is None:
        transaction_date = date(2026, 3, 15)

    return schema.TransactionRow(
        wallet_txn_id=wallet_txn_id,
        deal_id=deal_id,
        transaction_date=transaction_date,
        account=account,
        tax_label=tax_label,
        partner=partner,
        description=description,
        debit_amount=Decimal(str(debit_amount)),
        credit_amount=Decimal(str(credit_amount)),
        item=item,
        memo_tag=memo_tag,
        notes=notes,
    )
