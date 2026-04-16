"""Phase 4-1 TC-01 の検収スクリプト。

TC-01 (売上の税区分検証) の動作確認:
  1. JSON ファイルの件数確認
  2. Phase 3-R 成果の活用確認 (resolve_tax_code, filter_meta)
  3. pytest test_tc01.py
  4. 全回帰テスト (test_tc03/04/05/06/common)
"""
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
    print("  TC-01 JSON files")
    print(f"{'='*60}")
    base = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
    )

    accounts_raw = json.loads((base / "sales-accounts.json").read_text(encoding="utf-8"))
    accounts = {k: v for k, v in accounts_raw.items() if not k.startswith("_")}
    included = accounts["included"]
    assert len(included["general"]) == 7, f"general: expected 7, got {len(included['general'])}"
    assert len(included["construction"]) == 2
    assert len(included["medical"]) == 1
    assert len(included["transport"]) == 1
    assert len(accounts["excluded"]) == 10
    assert len(accounts["food_business_accounts"]) == 3
    print(f"  sales-accounts.json: OK "
          f"(general:{len(included['general'])}, construction:{len(included['construction'])}, "
          f"medical:{len(included['medical'])}, transport:{len(included['transport'])}, "
          f"excluded:{len(accounts['excluded'])}, food:{len(accounts['food_business_accounts'])})")

    keywords_raw = json.loads((base / "tax-exception-keywords.json").read_text(encoding="utf-8"))
    kw = {k: v for k, v in keywords_raw.items() if not k.startswith("_")}
    assert len(kw["legitimately_non_taxable"]) == 9
    assert len(kw["overseas"]) == 6
    assert len(kw["food_keywords"]) == 8
    print(f"  tax-exception-keywords.json: OK "
          f"(non_taxable:{len(kw['legitimately_non_taxable'])}, "
          f"overseas:{len(kw['overseas'])}, food:{len(kw['food_keywords'])})")
    return True


def verify_phase3r_usage():
    """TC-01 が Phase 3-R の共通機能を使っているか確認。"""
    print(f"\n{'='*60}")
    print("  Phase 3-R 成果の活用状況")
    print(f"{'='*60}")
    tc01_path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "checks" / "tc01_sales.py"
    )
    content = tc01_path.read_text(encoding="utf-8")

    # 1. resolve_tax_code の import (共通版)
    assert "from skills._common.lib.finding_factory import" in content
    assert "resolve_tax_code" in content
    print("  [OK] Phase 3-R 共通 resolve_tax_code を import")

    # 2. ローカル定義していない
    assert "def _resolve_tax_code" not in content
    print("  [OK] ローカル _resolve_tax_code 定義なし")

    # 3. filter_meta=True の利用
    assert "filter_meta=True" in content
    print("  [OK] load_reference_json(filter_meta=True) を利用")

    # 4. ローカル _comment フィルタなし (dict comp pattern)
    assert "_raw" not in content
    assert "startswith(\"_\")" not in content
    print("  [OK] ローカル _comment フィルタなし")
    return True


def main():
    print("=" * 60)
    print("  Phase 4-1: TC-01 Verification")
    print("=" * 60)

    results = []

    try:
        results.append(("TC-01 JSON", verify_json_files()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("TC-01 JSON", False))

    try:
        results.append(("Phase 3-R usage", verify_phase3r_usage()))
    except Exception as e:
        print(f"  FAILED: {e}")
        results.append(("Phase 3-R usage", False))

    results.append(("pytest test_tc01.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc01.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc01.py",
    )))

    for name in ["test_tc03.py", "test_tc04.py", "test_tc05.py", "test_tc06.py", "test_common.py"]:
        results.append((f"regression {name}", run_command(
            [sys.executable, "-m", "pytest", f"tests/unit/{name}", "--tb=short", "-q"],
            f"Regression: {name}",
        )))

    print(f"\n{'='*60}")
    print("  PHASE 4-1 SUMMARY")
    print(f"{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 4-1 COMPLETE: TC-01 is operational (Pattern B 派生確立)")
    else:
        print(f"\n  PHASE 4-1 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
