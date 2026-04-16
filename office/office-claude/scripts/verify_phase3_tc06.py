"""Phase 3-3 TC-06 の検収スクリプト。"""
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
    print("  TC-06 JSON files")
    print(f"{'='*60}")
    base = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
    )
    accounts = json.loads((base / "tax-public-charges-accounts.json").read_text(encoding="utf-8"))
    categories = {k: v for k, v in accounts.items() if not k.startswith("_")}
    assert len(categories["tax_public_charges"]) == 10
    assert len(categories["corporate_tax"]) == 5
    assert len(categories["fuel_related"]) == 3
    assert len(categories["entertainment"]) == 2
    total = sum(len(v) for v in categories.values())
    print(f"  tax-public-charges-accounts.json: OK (カテゴリ{len(categories)}、科目合計{total})")

    keywords_raw = json.loads((base / "tax-public-charges-keywords.json").read_text(encoding="utf-8"))
    kw = {k: v for k, v in keywords_raw.items() if not k.startswith("_")}
    assert len(kw["diesel"]) == 2
    assert len(kw["usage_tax"]) == 2
    assert kw["taxable_exception"] == []
    print(f"  tax-public-charges-keywords.json: OK "
          f"(diesel:{len(kw['diesel'])}、usage_tax:{len(kw['usage_tax'])}、"
          f"taxable_exception:{len(kw['taxable_exception'])})")
    return True


def main():
    print("=" * 60)
    print("  Phase 3-3: TC-06 Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("TC-06 JSON", verify_json_files()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-06 JSON", False))

    results.append(("pytest test_tc06.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc06.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc06.py",
    )))

    for name in ["test_tc05.py", "test_tc04.py", "test_tc03.py", "test_common.py"]:
        results.append((f"regression {name}", run_command(
            [sys.executable, "-m", "pytest", f"tests/unit/{name}", "--tb=short", "-q"],
            f"Regression: {name}",
        )))

    print(f"\n{'='*60}")
    print("  PHASE 3-3 SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 3-3 COMPLETE: TC-06 is operational (Pattern C established)")
        print(f"  PHASE 3 (TC-04/05/06) ALL COMPLETE - Ready for Phase 3-R refactor")
    else:
        print(f"\n  PHASE 3-3 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
