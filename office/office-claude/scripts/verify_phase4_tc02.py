"""Phase 4-2 TC-02 の検収スクリプト。"""
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


def verify_json_files():
    print(f"\n{'='*60}\n  TC-02 JSON files\n{'='*60}")
    base = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
    )

    accounts_raw = json.loads((base / "rent-accounts.json").read_text(encoding="utf-8"))
    accounts = {k: v for k, v in accounts_raw.items() if not k.startswith("_")}
    assert len(accounts["revenue"]) == 4
    assert len(accounts["expense"]) == 4
    assert len(accounts["land_accounts"]) == 2
    print("  rent-accounts.json: OK (revenue:4, expense:4, land:2)")

    keywords_raw = json.loads((base / "rent-keywords.json").read_text(encoding="utf-8"))
    kw = {k: v for k, v in keywords_raw.items() if not k.startswith("_")}
    assert len(kw["residential_strong"]) == 8
    assert len(kw["residential_weak"]) == 4
    assert len(kw["business_use"]) == 13
    assert len(kw["land_keywords"]) == 4
    assert len(kw["parking"]) == 5
    assert "アパート" in kw["residential_strong"]
    assert "アパート" not in kw["residential_weak"]
    assert "駐車場" in kw["business_use"]
    print("  rent-keywords.json: OK (strong:8, weak:4, business:13, land:4, parking:5)")
    return True


def verify_phase3r_usage():
    """TC-02 が Phase 3-R の共通機能を使っているか確認。"""
    print(f"\n{'='*60}\n  Phase 3-R 成果の活用状況\n{'='*60}")
    tc02_path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "checks" / "tc02_land_rent.py"
    )
    content = tc02_path.read_text(encoding="utf-8")

    assert "from skills._common.lib.finding_factory import" in content
    assert "resolve_tax_code" in content
    print("  [OK] Phase 3-R 共通 resolve_tax_code を import")

    assert "def _resolve_tax_code" not in content
    print("  [OK] ローカル _resolve_tax_code 定義なし")

    assert "filter_meta=True" in content
    print("  [OK] load_reference_json(filter_meta=True) を利用")

    assert "_raw" not in content
    assert "startswith(\"_\")" not in content
    print("  [OK] ローカル _comment フィルタなし")
    return True


def main():
    print("=" * 60)
    print("  Phase 4-2: TC-02 Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("TC-02 JSON", verify_json_files()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-02 JSON", False))

    try:
        results.append(("Phase 3-R usage", verify_phase3r_usage()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("Phase 3-R usage", False))

    results.append(("pytest test_tc02.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc02.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc02.py",
    )))

    for name in ["test_tc01.py", "test_tc06.py", "test_tc05.py",
                 "test_tc04.py", "test_tc03.py", "test_common.py"]:
        results.append((f"regression {name}", run_command(
            [sys.executable, "-m", "pytest", f"tests/unit/{name}", "--tb=short", "-q"],
            f"Regression: {name}",
        )))

    print(f"\n{'='*60}\n  PHASE 4-2 SUMMARY\n{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 4-2 COMPLETE: TC-02 is operational")
        print(f"  PHASE 4 (TC-01/02) ALL COMPLETE - Ready for Phase 5 (TC-07)")
    else:
        print(f"\n  PHASE 4-2 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
