"""Phase 2 TC-03 の検収スクリプト。

1. payroll-accounts.json の配置確認
2. pytest test_tc03.py の全テスト PASSED
3. Phase 1 の検収が引き続き通ること
"""
import subprocess
import sys
import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

# Windows cp932 対策（Part 3 知見）
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


def verify_payroll_json():
    print(f"\n{'='*60}")
    print("  payroll-accounts.json verification")
    print(f"{'='*60}")
    path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
        / "payroll-accounts.json"
    )
    assert path.exists(), f"Not found: {path}"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert len(data["salary"]) == 12, f"salary: expected 12, got {len(data['salary'])}"
    assert len(data["social_insurance"]) == 7
    assert "給与手当" in data["salary"]
    assert "法定福利費" in data["social_insurance"]
    print("  payroll-accounts.json: OK (12 salary + 7 social_insurance)")
    return True


def main():
    print("=" * 60)
    print("  Phase 2: TC-03 Verification")
    print("=" * 60)

    results = []

    # 1. payroll JSON
    try:
        results.append(("payroll-accounts.json", verify_payroll_json()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("payroll-accounts.json", False))

    # 2. pytest test_tc03.py
    results.append(("pytest test_tc03.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc03.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc03.py",
    )))

    # 3. Phase 1 regression
    results.append(("Phase 1 test_common.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_common.py", "-v", "--tb=short", "-q"],
        "Phase 1 regression: test_common.py",
    )))

    # Summary
    print(f"\n{'='*60}")
    print("  PHASE 2 SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 2 COMPLETE: TC-03 is operational")
    else:
        print(f"\n  PHASE 2 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
