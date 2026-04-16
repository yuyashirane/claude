"""Phase 3-2 TC-05 の検収スクリプト。"""
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
    print("  TC-05 JSON files")
    print(f"{'='*60}")
    base = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
    )
    accounts = json.loads((base / "non-taxable-expense-accounts.json").read_text(encoding="utf-8"))
    categories = {k: v for k, v in accounts.items() if not k.startswith("_")}
    assert len(categories) == 4, f"expected 4 categories, got {len(categories)}"
    total = sum(len(v) for v in categories.values())
    assert "interest" in categories
    assert "insurance" in categories
    assert "guarantee_direct" in categories
    assert "payment_fee" in categories
    print(f"  non-taxable-expense-accounts.json: OK (カテゴリ{len(categories)}、科目合計{total})")

    kw = json.loads((base / "non-taxable-expense-keywords.json").read_text(encoding="utf-8"))
    kw_cats = {k: v for k, v in kw.items() if not k.startswith("_")}
    kw_total = sum(len(v) for v in kw_cats.values())
    assert "guarantee" in kw_cats
    print(f"  non-taxable-expense-keywords.json: OK (KW合計{kw_total})")
    return True


def main():
    print("=" * 60)
    print("  Phase 3-2: TC-05 Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("TC-05 JSON", verify_json_files()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-05 JSON", False))

    results.append(("pytest test_tc05.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc05.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc05.py",
    )))

    results.append(("regression test_tc04.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc04.py", "--tb=short", "-q"],
        "Regression: test_tc04.py",
    )))

    results.append(("regression test_tc03.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc03.py", "--tb=short", "-q"],
        "Regression: test_tc03.py",
    )))

    results.append(("regression test_common.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_common.py", "--tb=short", "-q"],
        "Regression: test_common.py",
    )))

    print(f"\n{'='*60}")
    print("  PHASE 3-2 SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 3-2 COMPLETE: TC-05 is operational (Pattern B + dynamic area + dual-route)")
    else:
        print(f"\n  PHASE 3-2 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
