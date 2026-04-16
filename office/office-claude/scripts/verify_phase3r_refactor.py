"""Phase 3-R リファクタの検収スクリプト。

リファクタが「動作不変」であることを検証する:
1. resolve_tax_code が finding_factory に存在し、各TCから呼べる
2. load_reference_json の filter_meta が動作
3. TC-05e Route B の note=None
4. 全 125 テストが引き続き green
"""
import subprocess
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass


def run_command(cmd, label):
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        cmd, cwd=str(PROJECT_ROOT),
        capture_output=True, text=True, env=env,
        encoding="utf-8", errors="replace",
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    ok = result.returncode == 0
    print(f"  {'OK' if ok else 'FAILED'}")
    return ok


def verify_resolve_tax_code_extracted():
    """resolve_tax_code が finding_factory に存在し、各TCに重複定義がないことを確認。"""
    print(f"\n{'='*60}\n  resolve_tax_code extraction\n{'='*60}")

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    from skills._common.lib.finding_factory import resolve_tax_code
    assert callable(resolve_tax_code)
    print("  resolve_tax_code is in finding_factory: OK")

    checks_dir = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "checks"
    for tc_file in ["tc03_payroll.py", "tc04_non_taxable_revenue.py",
                    "tc05_non_taxable_expense.py", "tc06_tax_public_charges.py"]:
        path = checks_dir / tc_file
        content = path.read_text(encoding="utf-8")
        assert "def _resolve_tax_code" not in content, \
            f"{tc_file} still has _resolve_tax_code definition"
        assert "from skills._common.lib.finding_factory import" in content
        assert "resolve_tax_code" in content
        print(f"  {tc_file}: OK (no duplicate, uses common)")
    return True


def verify_load_reference_json_filter():
    """load_reference_json の filter_meta が動作することを確認。"""
    print(f"\n{'='*60}\n  load_reference_json filter_meta\n{'='*60}")

    from skills._common.lib.finding_factory import load_reference_json, load_common_definitions

    data_default = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/payroll-accounts",
    )
    assert "_comment" in data_default, "default filter_meta=False should retain _comment"
    print("  load_reference_json default(filter_meta=False): OK (_comment retained, 既存互換)")

    data_filtered = load_reference_json(
        "verify/V1-3-rule/check-tax-classification",
        "keywords/payroll-accounts",
        filter_meta=True,
    )
    assert "_comment" not in data_filtered, "filter_meta=True should remove _comment"
    assert "salary" in data_filtered
    print("  load_reference_json filter_meta=True: OK (_comment excluded)")

    common_default = load_common_definitions("area-definitions")
    assert "_comment" in common_default
    print("  load_common_definitions default(filter_meta=False): OK (既存互換)")

    common_filtered = load_common_definitions("area-definitions", filter_meta=True)
    assert "_comment" not in common_filtered
    assert "areas" in common_filtered
    print("  load_common_definitions filter_meta=True: OK")
    return True


def verify_tc05e_note_removed():
    """TC-05e Route B の note=reverse_detection が削除されていることを確認。"""
    print(f"\n{'='*60}\n  TC-05e Route B note removal\n{'='*60}")

    tc05_path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "checks" / "tc05_non_taxable_expense.py"
    )
    content = tc05_path.read_text(encoding="utf-8")

    import re
    payment_fee_section = re.search(
        r"def _check_payment_fee.*?(?=\ndef |\Z)",
        content, re.DOTALL
    )
    assert payment_fee_section is not None, "_check_payment_fee not found"
    section = payment_fee_section.group()
    assert 'note="reverse_detection"' not in section, \
        "Route B still has note='reverse_detection'"
    assert "note='reverse_detection'" not in section
    print("  TC-05e Route B note removed: OK")
    return True


def main():
    print("=" * 60)
    print("  Phase 3-R: Refactor Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("resolve_tax_code extraction", verify_resolve_tax_code_extracted()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("resolve_tax_code extraction", False))

    try:
        results.append(("load_reference_json filter_meta", verify_load_reference_json_filter()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("load_reference_json filter_meta", False))

    try:
        results.append(("TC-05e note removal", verify_tc05e_note_removed()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-05e note removal", False))

    results.append(("pytest all (125 tests)", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/", "-v", "--tb=short"],
        "Full regression: 125 tests must all pass",
    )))

    for script in ["verify_part1_json.py", "verify_part1_schema.py", "verify_part2_lib.py"]:
        results.append((script, run_command(
            [sys.executable, f"scripts/{script}"],
            f"Re-run: {script}",
        )))

    print(f"\n{'='*60}\n  PHASE 3-R SUMMARY\n{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 3-R COMPLETE: Refactor finished, 125 tests still green")
        print(f"  READY FOR PHASE 4: TC-01/02 implementation")
    else:
        print(f"\n  PHASE 3-R INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
