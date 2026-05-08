"""V1-3-20 → 共通 FindingGroup 変換アダプタのテスト (β2-E E5-4 Phase 1a).

アダプタは V1-3-20 独自 FindingGroup の 3 フィールド (classification /
findings_count / findings) のうち findings_count と findings のみを読む
ため、テストでは structural-typing 互換の軽量ダミー (SimpleNamespace 等)
で V1-3-20 FindingGroup を構築する。
"""
from __future__ import annotations

from types import SimpleNamespace

from skills._common.lib.invoice_group_adapter import adapt_invoice_groups
from skills._common.schema import Finding


def _make_finding(
    *,
    severity: str = "🟠 High",
    debit_amount: int | None = 100000,
    credit_amount: int | None = 0,
    sub_code: str = "01",
    wallet_txn_id: str = "t-1",
) -> Finding:
    return Finding(
        tc_code="V1-3-20",
        sub_code=sub_code,
        severity=severity,
        error_type="invoice_warning",
        review_level="🟠 重点確認",
        area="A14",
        sort_priority=30,
        wallet_txn_id=wallet_txn_id,
        message="m",
        debit_amount=debit_amount,
        credit_amount=credit_amount,
    )


def _make_v1320_group(findings: list[Finding]) -> SimpleNamespace:
    return SimpleNamespace(
        classification="dummy",
        findings_count=len(findings),
        findings=findings,
    )


def test_single_group_returns_one_common_group():
    findings = [
        _make_finding(debit_amount=100000),
        _make_finding(debit_amount=50000),
        _make_finding(debit_amount=30000),
    ]
    ig = _make_v1320_group(findings)

    result = adapt_invoice_groups([ig])

    assert len(result) == 1
    g = result[0]
    assert g.count == 3
    assert g.total_debit == 180000
    assert g.tc_code == "V1-3-20"
    assert g.sub_code == "01"
    assert g.area == "A14"


def test_three_groups_preserve_order():
    g1 = _make_v1320_group([_make_finding(sub_code="01")])
    g2 = _make_v1320_group([_make_finding(sub_code="02")])
    g3 = _make_v1320_group([_make_finding(sub_code="03")])

    result = adapt_invoice_groups([g1, g2, g3])

    assert len(result) == 3
    assert [g.sub_code for g in result] == ["01", "02", "03"]


def test_empty_group_is_skipped():
    empty = SimpleNamespace(classification="x", findings_count=0, findings=[])

    result = adapt_invoice_groups([empty])

    assert result == []


def test_empty_and_nonempty_mixed():
    empty = SimpleNamespace(classification="x", findings_count=0, findings=[])
    nonempty = _make_v1320_group([_make_finding()])

    result = adapt_invoice_groups([empty, nonempty, empty])

    assert len(result) == 1
    assert result[0].count == 1


def test_group_key_format():
    ig = _make_v1320_group([_make_finding()])

    result = adapt_invoice_groups([ig])

    assert result[0].group_key == "V1-3-20|01|A14"


def test_max_severity_in_group():
    findings = [
        _make_finding(severity="🟢 Low"),
        _make_finding(severity="🔴 Critical"),
        _make_finding(severity="🟡 Medium"),
    ]
    ig = _make_v1320_group(findings)

    result = adapt_invoice_groups([ig])

    assert result[0].severity == "🔴 Critical"


def test_total_amount_skips_none():
    findings = [
        _make_finding(debit_amount=100000, credit_amount=None),
        _make_finding(debit_amount=None, credit_amount=200000),
        _make_finding(debit_amount=50000, credit_amount=300000),
    ]
    ig = _make_v1320_group(findings)

    result = adapt_invoice_groups([ig])

    assert result[0].total_debit == 150000
    assert result[0].total_credit == 500000


def test_findings_tuple_preserves_order():
    f1 = _make_finding(wallet_txn_id="t-1")
    f2 = _make_finding(wallet_txn_id="t-2")
    f3 = _make_finding(wallet_txn_id="t-3")
    ig = _make_v1320_group([f1, f2, f3])

    result = adapt_invoice_groups([ig])

    assert isinstance(result[0].findings, tuple)
    assert [f.wallet_txn_id for f in result[0].findings] == ["t-1", "t-2", "t-3"]
