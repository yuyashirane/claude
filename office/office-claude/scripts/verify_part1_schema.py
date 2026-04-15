"""Part 1 修正版 schema.py の検収スクリプト。

全クラスが import でき、サンプルインスタンスが生成でき、frozen 制約が
効いていることを確認する。v1.2.2 §13.4.5 準拠の配置パスを参照する。
"""
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

# NOTE: Part 2 以降で skills/_common/lib/ を import する検収スクリプトで
# 同じパターンを使うため、Part 1 時点から path を通しておく。
# Part 1 では schema.py を importlib で直接ロードするため実質未使用だが、
# 構造を Part 2 と揃えることで Sonnet が path 操作で迷わないようにする。
sys.path.insert(0, str(Path(__file__).parent.parent))

# ハイフン入りディレクトリは importlib 経由で読む
import importlib.util

schema_path = (
    Path(__file__).parent.parent
    / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
)
assert schema_path.exists(), f"schema.py not found at {schema_path}"
spec = importlib.util.spec_from_file_location("schema", schema_path)
schema = importlib.util.module_from_spec(spec)
# Python 3.12+: dataclass 評価時に sys.modules 経由でモジュールを引くため登録必須
sys.modules["schema"] = schema
spec.loader.exec_module(schema)


def test_import_all_symbols() -> None:
    """__all__ に含まれる全シンボルが import できる。"""
    expected = {
        "Severity", "ErrorType", "ReviewLevel", "LinkTarget",
        "Finding", "FindingDetail", "LinkHints",
        "CheckContext", "TransactionRow", "ReferenceBundle",
    }
    actual = set(schema.__all__)
    assert actual == expected, f"missing: {expected - actual}"
    print("  __all__ contains all 10 symbols    OK")


def test_transaction_row_minimal() -> None:
    """TransactionRow が最小引数で生成できる。"""
    row = schema.TransactionRow(wallet_txn_id="abc1")
    assert row.wallet_txn_id == "abc1"
    assert row.debit_amount == Decimal("0")
    assert row.account == ""
    print("  TransactionRow minimal             OK")


def test_transaction_row_full() -> None:
    """TransactionRow が全引数で生成できる。"""
    row = schema.TransactionRow(
        wallet_txn_id="abc1",
        deal_id="456789",
        transaction_date=date(2026, 3, 15),
        account="給与手当",
        tax_label="課対仕入10%",
        partner="",
        description="2026年3月分給与",
        debit_amount=Decimal("300000"),
        credit_amount=Decimal("0"),
    )
    assert row.account == "給与手当"
    assert row.debit_amount == Decimal("300000")
    print("  TransactionRow full                OK")


def test_transaction_row_frozen() -> None:
    """TransactionRow が frozen=True で不変である。"""
    row = schema.TransactionRow(wallet_txn_id="abc1")
    try:
        row.account = "変更"  # type: ignore
    except Exception as e:
        # dataclasses.FrozenInstanceError が投げられる
        assert "frozen" in str(type(e).__name__).lower() or "cannot assign" in str(e).lower()
        print("  TransactionRow frozen              OK")
        return
    raise AssertionError("expected frozen error, but mutation succeeded")


def test_link_hints_general_ledger() -> None:
    """LinkHints(general_ledger) が生成できる。"""
    hints = schema.LinkHints(
        target="general_ledger",
        account_name="給与手当",
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
    )
    assert hints.target == "general_ledger"
    assert hints.account_name == "給与手当"
    print("  LinkHints general_ledger           OK")


def test_link_hints_deal_detail() -> None:
    """LinkHints(deal_detail) が生成できる。"""
    hints = schema.LinkHints(target="deal_detail", deal_id="456789")
    assert hints.deal_id == "456789"
    print("  LinkHints deal_detail              OK")


def test_link_hints_journal() -> None:
    """LinkHints(journal) が生成できる。"""
    hints = schema.LinkHints(
        target="journal",
        period_start=date(2026, 3, 1),
        period_end=date(2026, 3, 31),
    )
    assert hints.target == "journal"
    assert hints.period_start == date(2026, 3, 1)
    print("  LinkHints journal                  OK")


def test_finding_minimal() -> None:
    """Finding が必須引数で生成できる(sort_priority 必須)。"""
    finding = schema.Finding(
        tc_code="TC-03",
        sub_code="TC-03a",
        severity="🔴 High",
        error_type="direct_error",
        review_level="🔴必修",
        area="A5",
        sort_priority=1,  # 必須
    )
    assert finding.tc_code == "TC-03"
    assert finding.sort_priority == 1
    assert finding.show_by_default is True  # デフォルト
    assert finding.confidence == 50  # デフォルト
    assert finding.link_hints is None  # デフォルト
    print("  Finding minimal                    OK")


def test_finding_detail_default() -> None:
    """FindingDetail がデフォルト値で生成できる。"""
    detail = schema.FindingDetail()
    assert detail.matched_rules == []
    assert detail.evidence == {}
    assert detail.related_law is None
    print("  FindingDetail default              OK")


def test_check_context_minimal() -> None:
    """CheckContext が必須引数で生成できる。"""
    ctx = schema.CheckContext(
        company_id="2422271",
        fiscal_year_id="fy2026",
        period_start=date(2026, 1, 1),
        period_end=date(2026, 12, 31),
    )
    assert ctx.company_id == "2422271"
    assert ctx.transactions == []
    assert ctx.references is None
    print("  CheckContext minimal               OK")


def test_reference_bundle_load_raises() -> None:
    """ReferenceBundle.load_for_skill は NotImplementedError を投げる。"""
    try:
        schema.ReferenceBundle.load_for_skill("check-tax-classification")
    except NotImplementedError as e:
        assert "Part 2" in str(e)
        print("  ReferenceBundle.load_for_skill raises NIE  OK")
        return
    raise AssertionError("expected NotImplementedError")


def test_reference_bundle_get_raises() -> None:
    """ReferenceBundle.get は NotImplementedError を投げる。"""
    bundle = schema.ReferenceBundle()
    try:
        bundle.get("common", "area-definitions")
    except NotImplementedError as e:
        assert "Part 2" in str(e)
        print("  ReferenceBundle.get raises NIE             OK")
        return
    raise AssertionError("expected NotImplementedError")


def main() -> None:
    print("Verifying Part 1 (revised) schema.py...")
    print(f"  Path: {schema_path}")
    print("  Source: v1.2.2 §13.4.2 + Step 4-C v0.2.1")
    print()
    test_import_all_symbols()
    test_transaction_row_minimal()
    test_transaction_row_full()
    test_transaction_row_frozen()
    test_link_hints_general_ledger()
    test_link_hints_deal_detail()
    test_link_hints_journal()
    test_finding_minimal()
    test_finding_detail_default()
    test_check_context_minimal()
    test_reference_bundle_load_raises()
    test_reference_bundle_get_raises()
    print()
    print("OK: schema.py verified (12 tests passed)")


if __name__ == "__main__":
    main()
