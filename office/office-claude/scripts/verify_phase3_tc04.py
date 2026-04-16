"""Phase 3-1 TC-04 の検収スクリプト。"""
import subprocess
import sys
import json
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
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
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


def verify_json_files():
    print(f"\n{'='*60}")
    print("  TC-04 JSON files")
    print(f"{'='*60}")
    base = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
    )
    accounts = json.loads((base / "non-taxable-revenue-accounts.json").read_text(encoding="utf-8"))
    assert len(accounts["interest"]) == 3
    assert len(accounts["non_consideration"]) == 8
    assert len(accounts["damage_compensation"]) == 3
    assert len(accounts["misc_revenue"]) == 1
    print("  non-taxable-revenue-accounts.json: OK (3+8+3+1 = 15 accounts)")

    kw = json.loads((base / "non-taxable-revenue-keywords.json").read_text(encoding="utf-8"))
    assert len(kw["non_consideration"]) == 6
    assert len(kw["asset_transfer"]) == 5
    print("  non-taxable-revenue-keywords.json: OK (6+5 keywords)")
    return True


def main():
    print("=" * 60)
    print("  Phase 3-1: TC-04 Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("TC-04 JSON", verify_json_files()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-04 JSON", False))

    results.append(("pytest test_tc04.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc04.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc04.py",
    )))

    results.append(("regression test_tc03.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc03.py", "-v", "--tb=short", "-q"],
        "Regression: test_tc03.py",
    )))

    results.append(("regression test_common.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_common.py", "--tb=short", "-q"],
        "Regression: test_common.py",
    )))

    print(f"\n{'='*60}")
    print("  PHASE 3-1 SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 3-1 COMPLETE: TC-04 is operational (Pattern B established)")
    else:
        print(f"\n  PHASE 3-1 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
