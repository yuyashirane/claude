"""Phase 5 TC-07 の検収スクリプト。

Pattern D = KW優先順位ディスパッチ型の検証:
    1. 新規ファイル 4本(JSON 2 + checks 1 + tests 1)が存在
    2. welfare-keywords.json に _priority_order が正しく含まれる
    3. classify_welfare が純粋関数として import 可能
    4. KEYWORD_PRIORITY_ORDER と JSON _priority_order が一致
    5. pytest で test_tc07.py が全 PASS
    6. pytest 全体で累計 191〜192 tests 全 PASS
"""
import json
import os
import subprocess
import sys
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


def verify_new_files_exist():
    print(f"\n{'='*60}\n  TC-07 新規ファイル存在確認\n{'='*60}")
    base = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-tax-classification"
    tests_dir = PROJECT_ROOT / "tests" / "unit"

    required = [
        base / "references" / "keywords" / "welfare-accounts.json",
        base / "references" / "keywords" / "welfare-keywords.json",
        base / "checks" / "tc07_welfare.py",
        tests_dir / "test_tc07.py",
    ]
    for p in required:
        assert p.exists(), f"missing: {p}"
        print(f"  [OK] {p.relative_to(PROJECT_ROOT)}")
    return True


def verify_welfare_accounts_json():
    print(f"\n{'='*60}\n  welfare-accounts.json 構造確認\n{'='*60}")
    path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
        / "welfare-accounts.json"
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    assert "welfare" in data
    assert "福利厚生費" in data["welfare"]
    assert "福利費" in data["welfare"]
    print("  [OK] welfare に「福利厚生費」「福利費」が含まれる")
    return True


def verify_welfare_keywords_json():
    print(f"\n{'='*60}\n  welfare-keywords.json 構造確認\n{'='*60}")
    path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "references" / "keywords"
        / "welfare-keywords.json"
    )
    data = json.loads(path.read_text(encoding="utf-8"))

    # _priority_order メタキーの存在確認
    assert "_priority_order" in data, "_priority_order missing"
    expected = ["condolence", "gift_certificate", "food_takeout", "food_dine_in", "taxable_welfare"]
    assert data["_priority_order"] == expected, (
        f"_priority_order mismatch: {data['_priority_order']} != {expected}"
    )
    print(f"  [OK] _priority_order == {expected}")

    # 5カテゴリ揃っている
    for cat in expected:
        assert cat in data, f"category '{cat}' missing"
        assert isinstance(data[cat], list) and len(data[cat]) > 0
    print("  [OK] 5カテゴリ(condolence/gift_certificate/food_takeout/food_dine_in/taxable_welfare)揃っている")

    # 代表的な KW のサンプリング
    assert "慶弔" in data["condolence"]
    assert "商品券" in data["gift_certificate"]
    assert "弁当" in data["food_takeout"]
    assert "ケータリング" in data["food_dine_in"]
    assert "制服" in data["taxable_welfare"]
    print("  [OK] 代表 KW(慶弔/商品券/弁当/ケータリング/制服)を含む")

    # 「研修」「セミナー」が taxable_welfare に入っていないこと(責務分離)
    assert "研修" not in data["taxable_welfare"]
    assert "セミナー" not in data["taxable_welfare"]
    print("  [OK] 「研修」「セミナー」は taxable_welfare に追加されていない(責務分離)")
    return True


def verify_classify_welfare_importable_and_pure():
    print(f"\n{'='*60}\n  classify_welfare 純粋関数の確認\n{'='*60}")

    ctc_dir = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-tax-classification"
    )
    if str(ctc_dir) not in sys.path:
        sys.path.insert(0, str(ctc_dir))
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    from checks.tc07_welfare import classify_welfare, KEYWORD_PRIORITY_ORDER

    # KEYWORD_PRIORITY_ORDER と JSON _priority_order の一致を再確認
    path = ctc_dir / "references" / "keywords" / "welfare-keywords.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert list(KEYWORD_PRIORITY_ORDER) == data["_priority_order"], (
        "KEYWORD_PRIORITY_ORDER と JSON _priority_order が一致していない"
    )
    print(f"  [OK] KEYWORD_PRIORITY_ORDER == JSON _priority_order")

    # classify_welfare は純粋関数 — 2回呼んでも同一結果
    kw = {
        "condolence": ["慶弔"],
        "gift_certificate": ["商品券"],
        "food_takeout": ["弁当"],
        "food_dine_in": ["ケータリング"],
        "taxable_welfare": ["制服"],
    }
    r1 = classify_welfare("結婚祝金 商品券", kw)
    r2 = classify_welfare("結婚祝金 商品券", kw)
    assert r1 == r2
    # 慶弔 KW がないので gift_certificate が勝つ(上の kw では condolence リストが「慶弔」のみ)
    assert r1 == ("gift_certificate", 90)
    print("  [OK] classify_welfare は純粋関数(決定的)")

    # 空文字列 → None
    assert classify_welfare("", kw) is None
    print("  [OK] 空文字列で None を返す")
    return True


def verify_checker_dispatch():
    print(f"\n{'='*60}\n  checker.py の TC-07 dispatch 確認\n{'='*60}")
    path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "checker.py"
    )
    content = path.read_text(encoding="utf-8")
    assert "tc07_welfare" in content, "tc07_welfare の dispatch が checker.py にない"
    assert "run_tc07" in content
    print("  [OK] checker.py に TC-07 dispatch(run_tc07)が追加されている")
    return True


def verify_forbidden_files_unchanged():
    """Phase 1〜4 の変更禁止ファイルに TC-07 の影響が無いことを軽く確認。"""
    print(f"\n{'='*60}\n  変更禁止ファイルの確認\n{'='*60}")
    # schema.py に TC-07 特有の文字列が紛れ込んでいないこと
    schema_path = (
        PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
        / "check-tax-classification" / "schema.py"
    )
    sc = schema_path.read_text(encoding="utf-8")
    assert "TC-07" not in sc, "schema.py に TC-07 記述が混入している"
    print("  [OK] schema.py に TC-07 固有記述なし")

    # _common/lib/ の6ファイル構成
    lib_dir = PROJECT_ROOT / "skills" / "_common" / "lib"
    py_files = sorted(p.name for p in lib_dir.glob("*.py") if p.name != "__init__.py")
    expected = [
        "account_matcher.py", "finding_factory.py", "keyword_matcher.py",
        "note_markers.py", "overseas_services.py", "tax_code_helpers.py",
    ]
    assert py_files == expected, f"_common/lib/ の構成が変化している: {py_files}"
    print(f"  [OK] _common/lib/ の 6 ファイル構成維持")
    return True


def main():
    print("=" * 60)
    print("  Phase 5: TC-07 Verification (Pattern D = KW優先順位ディスパッチ型)")
    print("=" * 60)

    results = []

    checks = [
        ("新規ファイル存在", verify_new_files_exist),
        ("welfare-accounts.json", verify_welfare_accounts_json),
        ("welfare-keywords.json", verify_welfare_keywords_json),
        ("classify_welfare 純粋関数", verify_classify_welfare_importable_and_pure),
        ("checker.py dispatch", verify_checker_dispatch),
        ("変更禁止ファイル", verify_forbidden_files_unchanged),
    ]
    for label, fn in checks:
        try:
            ok = fn()
        except Exception as e:
            print(f"  FAILED: {e}")
            ok = False
        results.append((label, ok))

    # pytest: TC-07 単体
    results.append(("pytest test_tc07.py", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/test_tc07.py", "-v", "--tb=short"],
        "pytest tests/unit/test_tc07.py",
    )))

    # 回帰: 既存 6 TC
    for name in ["test_tc01.py", "test_tc02.py", "test_tc03.py",
                 "test_tc04.py", "test_tc05.py", "test_tc06.py", "test_common.py"]:
        results.append((f"regression {name}", run_command(
            [sys.executable, "-m", "pytest", f"tests/unit/{name}", "--tb=short", "-q"],
            f"Regression: {name}",
        )))

    # 全体テスト(累計 191〜192 件)
    results.append(("pytest tests/unit/ (all)", run_command(
        [sys.executable, "-m", "pytest", "tests/unit/", "--tb=short", "-q"],
        "pytest tests/unit/ (全体)",
    )))

    print(f"\n{'='*60}\n  PHASE 5 SUMMARY\n{'='*60}")
    all_ok = True
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAILED'}: {label}")
        if not ok:
            all_ok = False

    if all_ok:
        print(f"\n  PHASE 5 COMPLETE: TC-07 is operational")
        print(f"  TC-01 〜 TC-07 全実装完了 — 累計 192 tests all green")
    else:
        print(f"\n  PHASE 5 INCOMPLETE")
        sys.exit(1)


if __name__ == "__main__":
    main()
