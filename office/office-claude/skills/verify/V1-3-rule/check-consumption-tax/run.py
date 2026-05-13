"""V1-3 統合 skill 実行スクリプト (check-consumption-tax)。

V1-3-10 (税区分チェック) と V1-3-20 (インボイス登録状態チェック) を内部で
並列実行し、findings を結合して 1 ファイルで Excel 出力する skill。

設計思想:
    「Skill 単位の Findings を、業務論点単位で再統合する」。会計実務上
    「1 仕訳 → 複数論点」は自然なため、両論点の findings を 1 つの Excel
    に並べて顧問先に提示する。

将来拡張:
    新規 V1-3-XX checker は `_INTERNAL_CHECKERS` に 1 行追加するだけで
    本 skill に組み込める疎結合設計。

CLI 3 パターン (V1-3-10/20 と完全互換):
    1. 期間指定:        --period-start YYYY-MM --period-end YYYY-MM
    2. 対象月指定(累積): --target-month YYYY-MM
    3. 対象月指定(単月): --target-month YYYY-MM --single-month

exit code:
    0: 正常終了 (全 checker 成功 or 部分失敗 = §3.1 判断 B)
    1: 引数エラー
    2: JSON 不足
    3: 期間論理エラー
    4: 予期せぬエラー (全 checker 失敗を含む)
"""
from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import os
import re
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

# ─────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────

# テスト時に override 可能 (V1-3-20 と同じ規約)
def _resolve_project_root() -> Path:
    override = os.environ.get("CHECK_CONSUMPTION_TAX_PROJECT_ROOT")
    if override:
        return Path(override).resolve()
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = _resolve_project_root()  # office-claude/
SKILL_DIR = Path(__file__).resolve().parent

V1_3_10_DIR = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-tax-classification"
V1_3_20_DIR = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-invoice-registration-status"
V1_3_11_DIR = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-reduced-tax-rate"
V1_3_21_DIR = PROJECT_ROOT / "skills" / "verify" / "V1-3-rule" / "check-invoice-special-rules"

EXIT_OK = 0
EXIT_ARGS = 1
EXIT_JSON_MISSING = 2
EXIT_PERIOD_LOGIC = 3
EXIT_UNEXPECTED = 4

YYYYMM_RE = re.compile(r"^\d{4}-\d{2}$")

RULE_CODE = "check-consumption-tax"


# ─────────────────────────────────────────────────────────────
# argparse override (V1-3-10/20 と同形式: エラー時も JSON で返す)
# ─────────────────────────────────────────────────────────────

class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # type: ignore[override]
        _emit_error(
            error_stage="args",
            exit_code=EXIT_ARGS,
            message=f"引数エラー: {message}",
        )
        sys.exit(EXIT_ARGS)


def _build_parser() -> _Parser:
    p = _Parser(
        prog="check-consumption-tax",
        description="V1-3 統合チェック (V1-3-10 税区分 + V1-3-20 インボイス)",
    )
    p.add_argument("--company-id", type=int, required=True, help="freee 事業所 ID")
    p.add_argument("--period-start", type=str, default=None, help="開始年月 YYYY-MM")
    p.add_argument("--period-end", type=str, default=None, help="終了年月 YYYY-MM")
    p.add_argument("--target-month", type=str, default=None, help="対象月 YYYY-MM")
    p.add_argument(
        "--single-month",
        action="store_true",
        help="--target-month と併用。単月チェックモード",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="ビルダーの観測ログを stderr に出力する",
    )
    return p


# ─────────────────────────────────────────────────────────────
# 出力ヘルパ
# ─────────────────────────────────────────────────────────────

def _emit(payload: dict[str, Any]) -> None:
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


def _emit_error(
    *,
    error_stage: str,
    exit_code: int,
    message: str,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "status": "error",
        "error_stage": error_stage,
        "exit_code": exit_code,
        "message": message,
    }
    if extra:
        payload.update(extra)
    _emit(payload)


# ─────────────────────────────────────────────────────────────
# 引数の正規化 (V1-3-10/20 と同等のロジック)
# ─────────────────────────────────────────────────────────────

def _validate_yyyymm(label: str, value: str) -> None:
    if not YYYYMM_RE.match(value):
        _emit_error(
            error_stage="args",
            exit_code=EXIT_ARGS,
            message=f"{label} は YYYY-MM 形式である必要があります（受領: {value!r}）",
        )
        sys.exit(EXIT_ARGS)
    yyyy, mm = value.split("-")
    if not (1 <= int(mm) <= 12):
        _emit_error(
            error_stage="args",
            exit_code=EXIT_ARGS,
            message=f"{label} の月が不正です（受領: {value!r}）",
        )
        sys.exit(EXIT_ARGS)


def _resolve_mode(args: argparse.Namespace) -> str:
    has_period = args.period_start is not None or args.period_end is not None
    has_target = args.target_month is not None

    if has_period and has_target:
        _emit_error(
            error_stage="args",
            exit_code=EXIT_ARGS,
            message="--period-start/--period-end と --target-month は同時指定できません",
        )
        sys.exit(EXIT_ARGS)

    if has_period:
        if args.period_start is None or args.period_end is None:
            _emit_error(
                error_stage="args",
                exit_code=EXIT_ARGS,
                message="--period-start と --period-end は両方指定してください",
            )
            sys.exit(EXIT_ARGS)
        if args.single_month:
            _emit_error(
                error_stage="args",
                exit_code=EXIT_ARGS,
                message="--single-month は --target-month とのみ併用可能です",
            )
            sys.exit(EXIT_ARGS)
        _validate_yyyymm("--period-start", args.period_start)
        _validate_yyyymm("--period-end", args.period_end)
        if args.period_start > args.period_end:
            _emit_error(
                error_stage="args",
                exit_code=EXIT_ARGS,
                message=(
                    f"--period-start ({args.period_start}) が "
                    f"--period-end ({args.period_end}) より後です"
                ),
            )
            sys.exit(EXIT_ARGS)
        return "period_range"

    if has_target:
        _validate_yyyymm("--target-month", args.target_month)
        return "target_month_single" if args.single_month else "target_month_cumulative"

    _emit_error(
        error_stage="args",
        exit_code=EXIT_ARGS,
        message="--period-start/--period-end か --target-month のいずれかを指定してください",
    )
    sys.exit(EXIT_ARGS)
    return ""  # unreachable


# ─────────────────────────────────────────────────────────────
# パス解決
# ─────────────────────────────────────────────────────────────

def _company_root(company_id: int) -> Path:
    return PROJECT_ROOT / "tests" / "e2e" / str(company_id)


def _period_dir(company_id: int, period_end: str) -> Path:
    return _company_root(company_id) / period_end


def _expected_paths(
    *,
    company_id: int,
    period_start: str,
    period_end: str,
) -> dict[str, Path]:
    """V1-3-10/20 共通の必須 5 ファイル。"""
    base = _period_dir(company_id, period_end)
    return {
        "company_info.json": base / "company_info.json",
        "account_items_all.json": base / "account_items_all.json",
        "partners_all.json": base / "partners_all.json",
        "taxes_codes.json": base / "taxes_codes.json",
        f"deals_{period_start}_to_{period_end}.json": (
            base / f"deals_{period_start}_to_{period_end}.json"
        ),
    }


def _missing_entries(paths: dict[str, Path]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for name, p in paths.items():
        if not p.exists() or p.stat().st_size == 0:
            out.append(
                {
                    "filename": name,
                    "expected_path": str(p.relative_to(PROJECT_ROOT)).replace("\\", "/"),
                    "fetch_hint": "scripts/e2e/RUNBOOK_fetch.md を参照",
                }
            )
    return out


def _resolve_period_from_target_month(
    *,
    company_id: int,
    target_month: str,
    single_month: bool,
) -> tuple[str, str]:
    """target_month から period_start / period_end を確定する。

    V1-3-10 run.py の同名関数と同等のロジック。
    """
    company_info_path = _company_root(company_id) / "company_info.json"

    if not company_info_path.exists() or company_info_path.stat().st_size == 0:
        _emit_error(
            error_stage="json_missing",
            exit_code=EXIT_JSON_MISSING,
            message="company_info.json が不足しています。",
            extra={
                "company_id": company_id,
                "target_month": target_month,
                "missing_files": [
                    {
                        "filename": "company_info.json",
                        "expected_path": str(
                            company_info_path.relative_to(PROJECT_ROOT)
                        ).replace("\\", "/"),
                        "fetch_hint": "RUNBOOK_fetch.md の Step 1 を参照",
                    }
                ],
            },
        )
        sys.exit(EXIT_JSON_MISSING)

    try:
        with open(company_info_path, encoding="utf-8") as f:
            info = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        _emit_error(
            error_stage="company_info_read",
            exit_code=EXIT_UNEXPECTED,
            message=f"company_info.json の読み込みに失敗: {e}",
        )
        sys.exit(EXIT_UNEXPECTED)

    fy_start = info.get("fiscal_year_start")
    if not fy_start or not isinstance(fy_start, str):
        _emit_error(
            error_stage="company_info_invalid",
            exit_code=EXIT_UNEXPECTED,
            message="company_info.json に fiscal_year_start がありません",
        )
        sys.exit(EXIT_UNEXPECTED)

    fy_start_yyyymm = fy_start[:7]

    if single_month:
        return target_month, target_month

    if target_month < fy_start_yyyymm:
        _emit_error(
            error_stage="period_logic",
            exit_code=EXIT_PERIOD_LOGIC,
            message=(
                f"target_month ({target_month}) が期首 ({fy_start_yyyymm}) より前です。"
            ),
            extra={
                "company_id": company_id,
                "target_month": target_month,
                "fiscal_year_start": fy_start,
            },
        )
        sys.exit(EXIT_PERIOD_LOGIC)

    return fy_start_yyyymm, target_month


# ─────────────────────────────────────────────────────────────
# 期間表示文字列 (V1-3-10 と同形式)
# ─────────────────────────────────────────────────────────────

def _format_period_jp(period_start: str, period_end: str) -> str:
    s_y, s_m = period_start.split("-")
    e_y, e_m = period_end.split("-")
    if period_start == period_end:
        return f"{int(s_y)}年{int(s_m)}月"
    return f"{int(s_y)}年{int(s_m)}月〜{int(e_y)}年{int(e_m)}月"


# ─────────────────────────────────────────────────────────────
# 内部 checker のロード
# ─────────────────────────────────────────────────────────────

def _load_module(name: str, path: Path):
    """importlib で任意の .py をロードする汎用ヘルパ。"""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"{path} をロードできません")
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _load_v1_3_10_checker():
    """V1-3-10 の checker.py を動的ロード。

    checker.py は `from checks.tcXX_*` 形式の sibling import を使うため、
    SKILL_DIR を sys.path に追加してから読む必要がある (V1-3-10 run.py の
    `_load_checker` と同じ規約)。
    """
    if str(V1_3_10_DIR) not in sys.path:
        sys.path.insert(0, str(V1_3_10_DIR))
    return _load_module("v1_3_10_checker", V1_3_10_DIR / "checker.py")


def _load_v1_3_20_run_module():
    """V1-3-20 run.py をモジュールとしてロード。

    `main()` 内で argparse を呼ぶ構造のため、モジュール load 自体は副作用
    なし。ロード後は `_build_invoice_check_rows`, `classify_transaction`,
    `FINDING_TARGET_CLASSIFICATIONS`, `_load_checker` を直接利用する。
    """
    return _load_module("v1_3_20_run", V1_3_20_DIR / "run.py")


def _load_v1_3_11_checker():
    """V1-3-11 (check-reduced-tax-rate) の checker.py を動的ロード。

    V1-3-11 は `checks/` サブパッケージ名衝突を回避するため、checker.py
    内部で importlib による独立ロードを行う。本関数は checker.py 自体を
    一意な sys.modules キーで読むのみ (sys.path 操作不要)。
    """
    return _load_module("v1_3_11_checker", V1_3_11_DIR / "checker.py")


def _load_v1_3_21_checker():
    """V1-3-21 (check-invoice-special-rules) の checker.py を動的ロード。

    V1-3-11 と同様、`checks/` 衝突回避のため checker.py 内部で
    importlib + 独立 sys.modules キー (`v1_3_21_*`) を使う。本関数は
    checker.py 自体を一意な sys.modules キーで読むのみ。
    """
    return _load_module("v1_3_21_checker", V1_3_21_DIR / "checker.py")


# ─────────────────────────────────────────────────────────────
# checker runner functions
# ─────────────────────────────────────────────────────────────

def _run_v1_3_10(ctx) -> list:
    """V1-3-10 を実行して findings を返す。"""
    checker = _load_v1_3_10_checker()
    return checker.run(ctx)


def _run_v1_3_11(ctx) -> list:
    """V1-3-11 (check-reduced-tax-rate) を実行して findings を返す。"""
    return _load_v1_3_11_checker().run(ctx)


def _run_v1_3_21(ctx) -> list:
    """V1-3-21 (check-invoice-special-rules) を実行して findings を返す。

    インボイス特例群 (少額・公共交通機関・自販機・出張旅費) の主検出
    (IS-01a/b, IS-02a/b, IS-03a, IS-04a) を統合実行。
    """
    return _load_v1_3_21_checker().run(ctx)


def _run_v1_3_20(ctx) -> list:
    """V1-3-20 を実行して findings を返す。

    V1-3-20 run.py の main() 内ロジックを切り出して再構成:
        rows ← _build_invoice_check_rows(ctx)
        classified ← [(row, classify_transaction(row)) for row in rows]
        finding_target_pairs ← classified に FINDING_TARGET_CLASSIFICATIONS で filter
        findings ← checker.to_findings(rows, classifications)
    """
    v1_3_20_run = _load_v1_3_20_run_module()
    rows = v1_3_20_run._build_invoice_check_rows(ctx)
    classified = [(row, v1_3_20_run.classify_transaction(row)) for row in rows]
    finding_target_pairs = [
        (row, c)
        for row, c in classified
        if c in v1_3_20_run.FINDING_TARGET_CLASSIFICATIONS
    ]
    target_rows = [row for row, _ in finding_target_pairs]
    target_cls = [c for _, c in finding_target_pairs]
    checker = v1_3_20_run._load_checker()
    return checker.to_findings(target_rows, target_cls)


# ─────────────────────────────────────────────────────────────
# 内部 checker 宣言
# ─────────────────────────────────────────────────────────────
# 将来 V1-3-11 / V1-3-12 等を追加する場合は本リストに 1 行追加するだけで
# 統合実行に組み込まれる (疎結合設計)。
# 形式: (rule_code, runner_fn)
# ─────────────────────────────────────────────────────────────

_INTERNAL_CHECKERS: list[tuple[str, Callable[[Any], list]]] = [
    ("V1-3-10", _run_v1_3_10),
    ("V1-3-20", _run_v1_3_20),
    ("V1-3-11", _run_v1_3_11),
    ("V1-3-21", _run_v1_3_21),  # 039 impl: インボイス特例群 (帳簿保存特例 advisory)
]


# ─────────────────────────────────────────────────────────────
# 出力パス生成
# ─────────────────────────────────────────────────────────────

def _build_output_path(
    *,
    company_id: int,
    company_name: str,
    period_start: str,
    period_end: str,
    timestamp: str | None = None,
) -> Path:
    """統合 Excel の出力パスを生成する。

    形式: reports/<company_id>_<company_name>/消費税チェック_<company_name>_<period_jp>_<TS>.xlsx

    company_name が空文字の場合は "unknown" にフォールバック。
    """
    safe_name = company_name or "unknown"
    period_jp = _format_period_jp(period_start, period_end)
    ts = timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")
    company_dir = f"{company_id}_{safe_name}"
    filename = f"消費税チェック_{safe_name}_{period_jp}_{ts}.xlsx"
    return PROJECT_ROOT / "reports" / company_dir / filename


# ─────────────────────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    mode = _resolve_mode(args)
    company_id: int = args.company_id

    # ─ Step 1/2: target-month モードなら期首から period 確定
    if mode in ("target_month_cumulative", "target_month_single"):
        period_start, period_end = _resolve_period_from_target_month(
            company_id=company_id,
            target_month=args.target_month,
            single_month=(mode == "target_month_single"),
        )
    else:
        period_start = args.period_start
        period_end = args.period_end

    # ─ Step 3: 必須 5 ファイル充足確認
    paths = _expected_paths(
        company_id=company_id,
        period_start=period_start,
        period_end=period_end,
    )
    missing = _missing_entries(paths)
    if missing:
        base_dir = str(_period_dir(company_id, period_end).relative_to(PROJECT_ROOT)).replace(
            "\\", "/"
        ) + "/"
        _emit_error(
            error_stage="json_missing",
            exit_code=EXIT_JSON_MISSING,
            message=(
                f"必要 JSON が {len(missing)} 件不足しています。"
                "MCP 経由で取得してから再実行してください。"
            ),
            extra={
                "company_id": company_id,
                "mode": mode,
                "target_month": args.target_month,
                "period_start": period_start,
                "period_end": period_end,
                "base_dir": base_dir,
                "missing_files": missing,
            },
        )
        return EXIT_JSON_MISSING

    # ─ Step 4: CheckContext 構築 (1 回のみ、両 checker で共有)
    sink = sys.stderr if args.verbose else io.StringIO()
    base_dir = _period_dir(company_id, period_end)
    try:
        with contextlib.redirect_stdout(sink):
            if str(PROJECT_ROOT) not in sys.path:
                sys.path.insert(0, str(PROJECT_ROOT))
            from scripts.e2e.freee_to_context import build_check_context

            def _optional_path(filename: str) -> "Path | None":
                cand = base_dir / filename
                return cand if (cand.exists() and cand.stat().st_size > 0) else None

            mj_filename = f"manual_journals_{period_start}_to_{period_end}.json"
            manual_journals_path = _optional_path(mj_filename)

            ctx = build_check_context(
                deals_path=paths[f"deals_{period_start}_to_{period_end}.json"],
                partners_path=paths["partners_all.json"],
                account_items_path=paths["account_items_all.json"],
                company_info_path=paths["company_info.json"],
                taxes_codes_path=paths["taxes_codes.json"],
                manual_journals_path=manual_journals_path,
                items_path=_optional_path("items_all.json"),
                sections_path=_optional_path("sections_all.json"),
                tags_path=_optional_path("tags_all.json"),
            )
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="ctx_build",
            exit_code=EXIT_UNEXPECTED,
            message=f"CheckContext 構築に失敗: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "traceback": traceback.format_exc(),
            },
        )
        return EXIT_UNEXPECTED

    # ─ Step 5: 各 checker を順次実行 (障害分離 = 戦略 Claude 判断 B)
    combined_findings: list = []
    checker_results: dict[str, dict[str, Any]] = {}
    for rule_code, runner_fn in _INTERNAL_CHECKERS:
        try:
            with contextlib.redirect_stdout(sink):
                findings = runner_fn(ctx)
            combined_findings.extend(findings)
            checker_results[rule_code] = {
                "status": "ok",
                "findings_count": len(findings),
            }
            if args.verbose:
                sys.stderr.write(f"[{rule_code}] {len(findings)} findings\n")
        except Exception as e:  # noqa: BLE001
            checker_results[rule_code] = {
                "status": "error",
                "error_type": type(e).__name__,
                "message": str(e),
            }
            sys.stderr.write(
                f"[WARN] {rule_code} failed: {type(e).__name__}: {e}\n"
                f"       他の checker は継続実行します。\n"
            )

    # 全 checker 失敗時は EXIT_UNEXPECTED で abort
    if all(r.get("status") == "error" for r in checker_results.values()):
        _emit_error(
            error_stage="all_checkers_failed",
            exit_code=EXIT_UNEXPECTED,
            message="全 checker が失敗しました。Excel 出力をスキップします。",
            extra={
                "company_id": company_id,
                "checker_results": checker_results,
            },
        )
        return EXIT_UNEXPECTED

    # ─ Step 6: Excel 出力
    company_name = getattr(ctx, "company_name", "") or ""
    output_path = _build_output_path(
        company_id=company_id,
        company_name=company_name,
        period_start=period_start,
        period_end=period_end,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with contextlib.redirect_stdout(sink):
            from skills.export.excel_report.exporter import export_to_excel

            template_path = PROJECT_ROOT / "templates" / "TC_template.xlsx"
            export_to_excel(
                combined_findings,
                output_path,
                company_name=company_name,
                period=_format_period_jp(period_start, period_end),
                template_path=template_path,
                ctx=ctx,
            )
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="excel_export",
            exit_code=EXIT_UNEXPECTED,
            message=f"Excel 出力に失敗: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "checker_results": checker_results,
                "traceback": traceback.format_exc(),
            },
        )
        return EXIT_UNEXPECTED

    # ─ Step 7: 正常終了 (部分失敗を含む)
    _emit(
        {
            "status": "ok",
            "exit_code": EXIT_OK,
            "company_id": company_id,
            "company_name": company_name,
            "mode": mode,
            "target_month": args.target_month,
            "period_start": period_start,
            "period_end": period_end,
            "period_jp": _format_period_jp(period_start, period_end),
            "rule_code": RULE_CODE,
            "checker_results": checker_results,
            "findings_count": len(combined_findings),
            "output_path": str(output_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "output_abs_path": str(output_path),
        }
    )
    return EXIT_OK


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="bootstrap",
            exit_code=EXIT_UNEXPECTED,
            message=f"起動時エラー: {type(e).__name__}: {e}",
            extra={"traceback": traceback.format_exc()},
        )
        sys.exit(EXIT_UNEXPECTED)
