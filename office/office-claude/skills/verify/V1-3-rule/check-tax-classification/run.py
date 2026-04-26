"""V1-3-10 消費税区分チェック Skill のエントリポイント (run.py)。

ADDENDUM v3 準拠: run.py は freee MCP を一切呼び出さない。
SKILL.md（Claude Code エージェント側）が事前に保存した JSON を読み込み、
checker → exporter のパイプラインを実行して結果を JSON で標準出力する。

CLI 3 パターン:
    1. 期間指定:        --period-start YYYY-MM --period-end YYYY-MM
    2. 対象月指定(累積): --target-month YYYY-MM
    3. 対象月指定(単月): --target-month YYYY-MM --single-month

exit code:
    0: 正常終了
    1: 引数エラー
    2: JSON 不足（missing_files を JSON で出力。SKILL.md が fetch して再実行）
    3: 期間論理エラー（target_month が期首より前など）
    4: 予期せぬエラー
"""
from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import re
import sys
import traceback
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path
from typing import Any

# ─────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[4]  # office-claude/
SKILL_DIR = Path(__file__).resolve().parent

EXIT_OK = 0
EXIT_ARGS = 1
EXIT_JSON_MISSING = 2
EXIT_PERIOD_LOGIC = 3
EXIT_UNEXPECTED = 4

YYYYMM_RE = re.compile(r"^\d{4}-\d{2}$")


# ─────────────────────────────────────────────────────────────
# argparse override（エラー時も JSON で返すため）
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
        prog="check-tax-classification",
        description="V1-3-10 消費税区分チェック (run.py)",
    )
    p.add_argument("--company-id", type=int, required=True, help="freee 事業所 ID")
    p.add_argument("--period-start", type=str, default=None, help="開始年月 YYYY-MM")
    p.add_argument("--period-end", type=str, default=None, help="終了年月 YYYY-MM")
    p.add_argument("--target-month", type=str, default=None, help="対象月 YYYY-MM")
    p.add_argument(
        "--single-month",
        action="store_true",
        help="--target-month と併用。単月チェックモード（累積ではなく当月のみ）",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="ビルダーの観測ログを stderr に出力する",
    )
    return p


# ─────────────────────────────────────────────────────────────
# 標準出力ヘルパ（stdout は最終 JSON 専用）
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
# 引数の正規化と検証
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
    return PROJECT_ROOT / "data" / "e2e" / str(company_id)


def _period_dir(company_id: int, period_end: str) -> Path:
    return _company_root(company_id) / period_end


def _expected_paths(
    *,
    company_id: int,
    period_start: str,
    period_end: str,
) -> dict[str, Path]:
    """period が確定している前提で、5 ファイルの期待パスを返す。"""
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


# ─────────────────────────────────────────────────────────────
# 期間確定（target-month モード）
# ─────────────────────────────────────────────────────────────


def _resolve_period_from_target_month(
    *,
    company_id: int,
    target_month: str,
    single_month: bool,
) -> tuple[str, str, Path]:
    """target_month から period_start / period_end を確定する。

    Returns: (period_start, period_end, company_info_path)
    """
    company_info_path = _company_root(company_id) / "company_info.json"

    if not company_info_path.exists() or company_info_path.stat().st_size == 0:
        _emit_error(
            error_stage="json_missing",
            exit_code=EXIT_JSON_MISSING,
            message=(
                "company_info.json が不足しています。"
                "MCP 経由で取得してから再実行してください。"
            ),
            extra={
                "company_id": company_id,
                "mode": "target_month_single" if single_month else "target_month_cumulative",
                "target_month": target_month,
                "period_start": None,
                "period_end": None,
                "base_dir": str(_company_root(company_id).relative_to(PROJECT_ROOT)).replace(
                    "\\", "/"
                )
                + "/",
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
            extra={"company_info_path": str(company_info_path)},
        )
        sys.exit(EXIT_UNEXPECTED)

    fy_start = info.get("fiscal_year_start")
    if not fy_start or not isinstance(fy_start, str):
        _emit_error(
            error_stage="company_info_invalid",
            exit_code=EXIT_UNEXPECTED,
            message="company_info.json に fiscal_year_start がありません",
            extra={"company_info_path": str(company_info_path)},
        )
        sys.exit(EXIT_UNEXPECTED)

    fy_start_yyyymm = fy_start[:7]  # "2025-04-01" -> "2025-04"

    if single_month:
        period_start = target_month
        period_end = target_month
    else:
        if target_month < fy_start_yyyymm:
            _emit_error(
                error_stage="period_logic",
                exit_code=EXIT_PERIOD_LOGIC,
                message=(
                    f"target_month ({target_month}) が期首 ({fy_start_yyyymm}) より前です。"
                    "対象月を見直してください。"
                ),
                extra={
                    "company_id": company_id,
                    "target_month": target_month,
                    "fiscal_year_start": fy_start,
                },
            )
            sys.exit(EXIT_PERIOD_LOGIC)
        period_start = fy_start_yyyymm
        period_end = target_month

    return period_start, period_end, company_info_path


# ─────────────────────────────────────────────────────────────
# checker / exporter の動的ロード
# ─────────────────────────────────────────────────────────────


def _load_checker():
    """skills/verify/V1-3-rule/check-tax-classification/checker.py を動的ロード。"""
    if str(SKILL_DIR) not in sys.path:
        sys.path.insert(0, str(SKILL_DIR))
    spec = importlib.util.spec_from_file_location("checker", SKILL_DIR / "checker.py")
    if spec is None or spec.loader is None:
        raise ImportError("checker.py をロードできません")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ─────────────────────────────────────────────────────────────
# 期間表示文字列
# ─────────────────────────────────────────────────────────────


def _format_period_jp(period_start: str, period_end: str) -> str:
    s_y, s_m = period_start.split("-")
    e_y, e_m = period_end.split("-")
    if period_start == period_end:
        return f"{int(s_y)}年{int(s_m)}月"
    return f"{int(s_y)}年{int(s_m)}月〜{int(e_y)}年{int(e_m)}月"


# ─────────────────────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    mode = _resolve_mode(args)

    company_id: int = args.company_id

    # ─ Step 1/2: target-month モードなら期首から period 確定
    if mode in ("target_month_cumulative", "target_month_single"):
        period_start, period_end, _ = _resolve_period_from_target_month(
            company_id=company_id,
            target_month=args.target_month,
            single_month=(mode == "target_month_single"),
        )
    else:
        period_start = args.period_start
        period_end = args.period_end

    # ─ Step 3: 5 ファイル充足確認
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

    # ─ Step 4-6: CheckContext 構築 → checker → exporter
    sink = sys.stderr if args.verbose else io.StringIO()
    try:
        with contextlib.redirect_stdout(sink):
            sys.path.insert(0, str(PROJECT_ROOT))
            from scripts.e2e.freee_to_context import build_check_context
            from skills.export.excel_report.exporter import export_to_excel

            deals_path = paths[f"deals_{period_start}_to_{period_end}.json"]

            # ── Step 3-A: manual_journals JSON は「オプショナル」
            #    存在すれば合流し、無ければスキップ（missing_files 扱いにしない）
            mj_filename = f"manual_journals_{period_start}_to_{period_end}.json"
            mj_candidate = _period_dir(company_id, period_end) / mj_filename
            manual_journals_path = mj_candidate if (
                mj_candidate.exists() and mj_candidate.stat().st_size > 0
            ) else None

            # Phase C-1 クラスタ C-1: items master を optional 配線
            # ファイル不在時は build_check_context 側で None として扱われ、
            # 既存の動作と完全に同一になる。
            items_candidate = _period_dir(company_id, period_end) / "items_all.json"
            items_path = items_candidate if (
                items_candidate.exists() and items_candidate.stat().st_size > 0
            ) else None

            ctx = build_check_context(
                deals_path=deals_path,
                partners_path=paths["partners_all.json"],
                account_items_path=paths["account_items_all.json"],
                company_info_path=paths["company_info.json"],
                taxes_codes_path=paths["taxes_codes.json"],
                manual_journals_path=manual_journals_path,
                items_path=items_path,
            )

            checker = _load_checker()
            findings = checker.run(ctx)

            company_name = ctx.company_name
            reports_dir = (
                PROJECT_ROOT
                / "data"
                / "reports"
                / f"{company_id}_{company_name}"
            )
            reports_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = (
                reports_dir
                / f"v1-3-10_{period_start}_to_{period_end}_{ts}.xlsx"
            )

            export_to_excel(
                findings,
                output_path,
                company_name=company_name,
                period=_format_period_jp(period_start, period_end),
                ctx=ctx,
            )
    except FileNotFoundError as e:
        _emit_error(
            error_stage="json_read",
            exit_code=EXIT_JSON_MISSING,
            message=f"JSON 読み込み中に欠落を検出: {e}",
            extra={
                "company_id": company_id,
                "mode": mode,
                "period_start": period_start,
                "period_end": period_end,
            },
        )
        return EXIT_JSON_MISSING
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="pipeline",
            exit_code=EXIT_UNEXPECTED,
            message=f"パイプライン実行中にエラー: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "mode": mode,
                "period_start": period_start,
                "period_end": period_end,
                "traceback": traceback.format_exc(),
            },
        )
        return EXIT_UNEXPECTED

    # ─ Step 7: 正常終了
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
            "findings_count": len(findings),
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
