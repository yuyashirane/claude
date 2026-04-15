"""Part 3 テスト基盤 + checker.py 骨格の検収スクリプト。

1. pytest でテストを実行し、全 PASSED を確認
2. checker.py の NotImplementedError を確認
3. Part 1/2 の検収スクリプトが引き続き通ることを確認
"""
import subprocess
import sys
from pathlib import Path

# Windows cp932 対策: 標準出力を UTF-8 に切り替え（絵文字出力のため）
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

PROJECT_ROOT = Path(__file__).parent.parent


def run_command(cmd: list[str], label: str) -> bool:
    """コマンドを実行し、成否を返す。"""
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    result = subprocess.run(
        cmd,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"},
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        print(f"  ❌ FAILED (exit code {result.returncode})")
        return False
    print(f"  ✅ PASSED")
    return True


def verify_checker_skeleton() -> bool:
    """checker.py が NotImplementedError を投げることを確認。"""
    print(f"\n{'='*60}")
    print("  checker.py skeleton verification")
    print(f"{'='*60}")

    sys.path.insert(0, str(PROJECT_ROOT))
    import importlib.util

    checker_path = (
        PROJECT_ROOT
        / "skills" / "verify" / "V1-3-rule" / "check-tax-classification" / "checker.py"
    )
    spec = importlib.util.spec_from_file_location("checker", checker_path)
    checker = importlib.util.module_from_spec(spec)
    sys.modules["checker"] = checker
    spec.loader.exec_module(checker)

    try:
        checker.run(None)
        print("  ❌ run() did not raise NotImplementedError")
        return False
    except NotImplementedError as e:
        print(f"  run() → NotImplementedError: {e}")

    try:
        checker._dispatch_tc("TC-03", None)
        print("  ❌ _dispatch_tc() did not raise NotImplementedError")
        return False
    except NotImplementedError as e:
        print(f"  _dispatch_tc() → NotImplementedError: {e}")

    print("  ✅ checker.py skeleton: OK")
    return True


def main() -> None:
    print("=" * 60)
    print("  Phase 1 Part 3 Final Verification")
    print("=" * 60)

    results = []

    # 1. pytest
    results.append(run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_common.py", "-v", "--tb=short"],
        "pytest tests/unit/test_common.py",
    ))

    # 2. checker.py skeleton
    results.append(verify_checker_skeleton())

    # 3. Part 1 verify (JSON)
    results.append(run_command(
        [sys.executable, "scripts/verify_part1_json.py"],
        "Part 1: verify_part1_json.py (re-run)",
    ))

    # 4. Part 1 verify (schema)
    results.append(run_command(
        [sys.executable, "scripts/verify_part1_schema.py"],
        "Part 1: verify_part1_schema.py (re-run)",
    ))

    # 5. Part 2 verify (lib)
    results.append(run_command(
        [sys.executable, "scripts/verify_part2_lib.py"],
        "Part 2: verify_part2_lib.py (re-run)",
    ))

    # Summary
    print(f"\n{'='*60}")
    print("  FINAL SUMMARY")
    print(f"{'='*60}")
    labels = [
        "pytest test_common.py",
        "checker.py skeleton",
        "Part 1 JSON",
        "Part 1 schema",
        "Part 2 lib",
    ]
    all_ok = True
    for label, ok in zip(labels, results):
        status = "✅" if ok else "❌"
        print(f"  {status} {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n{'='*60}")
        print("  ✅ PHASE 1 COMPLETE: All verifications passed")
        print(f"{'='*60}")
    else:
        print(f"\n{'='*60}")
        print("  ❌ PHASE 1 INCOMPLETE: Some verifications failed")
        print(f"{'='*60}")
        sys.exit(1)


if __name__ == "__main__":
    main()
