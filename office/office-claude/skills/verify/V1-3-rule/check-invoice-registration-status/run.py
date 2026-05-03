"""V1-3-20 インボイス登録状況チェック (β2-B: 5 分類体系)。

deals データの各取引明細を tax_code ベースで 5 分類 + NONE の 6 値に分類する
（β2-A 確定の解釈 X：partner 不明は推定吸収）。

設計方針 (β2-B):
    - 判定は止めない / 推定して前に進める / 修正アクションを出す（β2 思想）。
    - 判定ロジックは「壊れないこと」を最優先（tax_code 単独判定、文字列比較しない）。
    - 経過措置範囲 (183-230) と通常課税仕入範囲 ({34, 108, 136, 163}) は
      クラスタ 0 で 3 社現物確認済（互いに排他的）。
    - I/O フリー: 本モジュールから MCP / HTTP は呼ばない。
      fetch は SKILL.md (Claude Code エージェント) の責務。
    - V1-3-10 の TransactionRow / CheckContext / Finding には依存しない。

β2-B での変更 (β1 → β2-B):
    削除:
        - find_candidates(rows) -> list[InvoiceCheckRow]: 3 条件 AND フィルタ
        - is_taxable_purchase(tax_label) -> bool: 文字列ベース判定
        - TAXABLE_PURCHASE_PREFIXES: prefix タプル
    追加:
        - Classification: 5 分類 + NONE の 6 値 Enum (schema.py)
        - TRANSITIONAL_TAX_CODES: 経過措置コード範囲（183-230）
        - FULL_DEDUCTION_TAX_CODES: 通常課税仕入コード（34, 108, 136, 163）
        - is_transitional_tax(tax_code) -> bool
        - is_full_deduction_tax(tax_code) -> bool
        - classify_transaction(row) -> Classification
    維持:
        - AMOUNT_THRESHOLD: 20 万円
        - InvoiceCheckRow: 型名と既存フィールドは維持、tax_code フィールド追加

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

配置: skills/verify/V1-3-rule/check-invoice-registration-status/run.py
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
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────
# Classification 解決（schema.py から）
# ─────────────────────────────────────────────────────────────────────

# クラスタ B で _load_checker と同じ規約で schema をロード。
# 直接 import できる場合は from .schema を使い、できない場合（CLI 単体起動時）は
# importlib 経由でロードする（β1 と同じ命名規則 "v1_3_20_invoice_schema"）。
try:
    from .schema import Classification, FindingGroup, InvoiceFinding  # type: ignore
except ImportError:
    _SCHEMA_PATH = Path(__file__).resolve().parent / "schema.py"
    if "v1_3_20_invoice_schema" not in sys.modules:
        _spec = importlib.util.spec_from_file_location(
            "v1_3_20_invoice_schema", _SCHEMA_PATH
        )
        if _spec is None or _spec.loader is None:
            raise ImportError("schema.py をロードできません")
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules["v1_3_20_invoice_schema"] = _mod
        _spec.loader.exec_module(_mod)
    Classification = sys.modules["v1_3_20_invoice_schema"].Classification  # type: ignore
    FindingGroup = sys.modules["v1_3_20_invoice_schema"].FindingGroup  # type: ignore
    InvoiceFinding = sys.modules["v1_3_20_invoice_schema"].InvoiceFinding  # type: ignore


# ─────────────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────────────

AMOUNT_THRESHOLD: Decimal = Decimal("200000")
"""借方金額の閾値 (20 万円)。β1/β2 でも固定。"""

TRANSITIONAL_TAX_CODES: frozenset[int] = frozenset(range(183, 231))
"""経過措置コード範囲（β2-A クラスタ 0 で 3 社一致確認済、183〜230 の 48 個、連続）。

freee 標準コードでの意味（範囲先頭を例示）:
    183 -> 課対仕入（控80）       (purchase_with_tax_exempt_80)
    184 -> 課対仕入（控50）       (purchase_with_tax_exempt_50)
    ...
    230 -> 共対仕返（控50）10%
"""

FULL_DEDUCTION_TAX_CODES: frozenset[int] = frozenset({34, 108, 136, 163})
"""通常課税仕入コード（β2-B クラスタ 0 で 3 社一致確認済、4 個、飛び地）。

freee 標準コードでの意味:
    34  -> 課対仕入       (purchase_with_tax)
    108 -> 課対仕入8%     (purchase_with_tax_8、旧 8% 標準税率時代の経過分)
            ※ 出現時は β2-D で違和感観察対象（本分類では通常課税仕入扱い）
    136 -> 課対仕入10%    (purchase_with_tax_10、現行標準税率)
    163 -> 課対仕入8%（軽）(purchase_with_tax_reduced_8、軽減税率)

経過措置範囲 (183-230) とは重複なし（互いに排他的）。
"""


# ─────────────────────────────────────────────────────────────────────
# 入力型（β2-B: tax_code フィールドを追加）
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class InvoiceCheckRow:
    """V1-3-20 の入力仕訳行 (β2-B)。

    V1-3-10 の TransactionRow と独立した最小型。fetch 層が freee deals
    レスポンスを本型に正規化して classify_transaction() に渡す。

    Attributes:
        wallet_txn_id: 一意の取引 ID (必須)。
        transaction_date: 取引日 (オプション)。
        partner: 取引先名。
        description: 摘要。
        tax_label: 税区分名 (例: "課対仕入10%")。表示用、判定には tax_code を使う。
        debit_amount: 借方金額 (Decimal)。
        credit_amount: 貸方金額 (Decimal)。
        is_qualified_invoice: 適格マークの有無 (True なら登録番号確認済)。
        tax_code: 税区分コード（β2 で追加、判定の正本）。
    """

    wallet_txn_id: str
    transaction_date: Optional[date] = None
    partner: str = ""
    description: str = ""
    tax_label: str = ""
    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")
    is_qualified_invoice: bool = False
    tax_code: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────
# β2-B 判定ヘルパー（tax_code 単独判定、文字列を見ない）
# ─────────────────────────────────────────────────────────────────────

def is_transitional_tax(tax_code: Optional[int]) -> bool:
    """経過措置コード（控80 / 控50）かを判定する。

    方針 1（β2-A 確定）: tax_code=None は常に False 扱い。
        判定不能は経過措置にも通常課税仕入にも入れない。

    Args:
        tax_code: 税区分コード（None 可）。

    Returns:
        TRANSITIONAL_TAX_CODES に含まれるとき True、それ以外 False。
    """
    if tax_code is None:
        return False
    return tax_code in TRANSITIONAL_TAX_CODES


def is_full_deduction_tax(tax_code: Optional[int]) -> bool:
    """通常課税仕入（100% 控除可能）かを判定する。

    方針 1（β2-A 確定）: tax_code=None は常に False 扱い。
        判定不能は通常課税仕入にも経過措置にも入れない。

    Args:
        tax_code: 税区分コード（None 可）。

    Returns:
        FULL_DEDUCTION_TAX_CODES に含まれるとき True、それ以外 False。
    """
    if tax_code is None:
        return False
    return tax_code in FULL_DEDUCTION_TAX_CODES


# ─────────────────────────────────────────────────────────────────────
# β2-B: classify_transaction（5 分類体系の核心、解釈 X 推定吸収）
# ─────────────────────────────────────────────────────────────────────

def classify_transaction(row: InvoiceCheckRow) -> Classification:
    """1 行の InvoiceCheckRow を 5 分類 + NONE の 6 値に分類する（β2-A 確定）。

    方針 3（β2-A 確定）: 1 取引 = 必ず 1 Classification を返す（NONE 含む）。
        フィルタ関数ではなく分類関数。
        sum(classification_counts.values()) == total_rows が常に成立する。

    解釈 X（推定吸収パターン、β2-A §2 確定）:
        - partner 不明 × 通常課税仕入 × 20 万以上
            → NONQUALIFIED_BUT_FULL_DEDUCTION_TAX に吸収（partner 不明より優先）
        - partner 不明 × 経過措置 × 20 万以上
            → PARTNER_UNKNOWN（経過措置のため判定保留）
        - partner 不明のその他
            → NONE

    通常の 4 象限分類:
        - 適格 × 経過措置                 → QUALIFIED_BUT_TRANSITIONAL_TAX (Finding)
        - 非適格 × 通常課税仕入 × 20 万以上 → NONQUALIFIED_BUT_FULL_DEDUCTION_TAX (Finding)
        - 適格 × 通常課税仕入             → EXPECTED_FULL_DEDUCTION_TAX (観察)
        - 非適格 × 経過措置               → EXPECTED_TRANSITIONAL_TAX (観察)
        - 上記いずれにも該当しない        → NONE

    Args:
        row: InvoiceCheckRow（β2 拡張、tax_code 必須）。

    Returns:
        Classification の 6 値のいずれか。
    """
    is_transitional = is_transitional_tax(row.tax_code)
    is_full_deduction = is_full_deduction_tax(row.tax_code)
    is_amount_over_threshold = row.debit_amount >= AMOUNT_THRESHOLD
    is_partner_unknown = (row.partner == "")

    # partner 不明の推定吸収パターン（解釈 X）
    if is_partner_unknown:
        if is_full_deduction and is_amount_over_threshold:
            return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
        if is_transitional and is_amount_over_threshold:
            return Classification.PARTNER_UNKNOWN
        return Classification.NONE

    # 通常の 4 象限分類
    if row.is_qualified_invoice and is_transitional:
        return Classification.QUALIFIED_BUT_TRANSITIONAL_TAX
    if (not row.is_qualified_invoice) and is_full_deduction and is_amount_over_threshold:
        return Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
    if row.is_qualified_invoice and is_full_deduction:
        return Classification.EXPECTED_FULL_DEDUCTION_TAX
    if (not row.is_qualified_invoice) and is_transitional:
        return Classification.EXPECTED_TRANSITIONAL_TAX

    return Classification.NONE


# ─────────────────────────────────────────────────────────────────────
# β2-C: FindingGroup（classification 単位）と Finding 化対象 3 分類
# ─────────────────────────────────────────────────────────────────────

GROUP_CLASSIFICATION_ORDER: tuple[Classification, ...] = (
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX,
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX,
    Classification.PARTNER_UNKNOWN,
)
"""β2-C 確定：FindingGroup の固定順序（設計メモ §6.2 TestFindGroups）。

Excel 表示（β2-E / β3）で順序が崩れると視覚的混乱を招くため、本定数で固定。
"""

FINDING_TARGET_CLASSIFICATIONS: frozenset[Classification] = frozenset(
    GROUP_CLASSIFICATION_ORDER
)
"""β2-C 確定：Finding 化対象の 3 分類（設計メモ §1 論点 5）。

EXPECTED_* / NONE は含めない（FindingGroup にも groups にも含まない）。
"""


def find_groups(findings: list) -> list:  # type: ignore[type-arg]
    """findings を classification 単位で group 化する（β2-C 確定）。

    必ず GROUP_CLASSIFICATION_ORDER の順番で 3 件返す（findings 0 件の分類でも
    空配列の FindingGroup を出力）。EXPECTED_* / NONE は groups に含めない。

    Args:
        findings: InvoiceFinding のリスト（3 分類のいずれかの classification を持つ）

    Returns:
        FindingGroup のリスト（必ず 3 件、順序固定）。
    """
    groups = []
    for cls in GROUP_CLASSIFICATION_ORDER:
        matched = [f for f in findings if f.classification == cls]
        groups.append(
            FindingGroup(
                classification=cls,
                findings_count=len(matched),
                findings=matched,
            )
        )
    return groups


def _calculate_partner_unknown_breakdown(
    classified: list,  # type: ignore[type-arg]
) -> dict[str, int]:
    """partner_unknown 周辺の集計（β2-C observations、設計メモ §1 論点 6）。

    解釈 X（partner 空 × 通常課税仕入 × 20 万以上を nonqualified に推定吸収）の
    影響を可視化する。

    集計の定義:
        - absorbed_into_nonqualified:
            partner 空文字 × 通常課税仕入 × 20 万以上 →
            nonqualified_but_full_deduction_tax として分類された件数
            （解釈 X による推定吸収件数）
        - remaining_partner_unknown:
            partner_unknown 分類の件数（partner 空 × 経過措置 × 20 万以上）

    Args:
        classified: (row, classification) のタプルリスト（main() で生成済み）

    Returns:
        {"absorbed_into_nonqualified": N, "remaining_partner_unknown": M}
    """
    absorbed = 0
    remaining = 0
    for row, cls in classified:
        if row.partner == "":
            if cls == Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX:
                absorbed += 1
            elif cls == Classification.PARTNER_UNKNOWN:
                remaining += 1
    return {
        "absorbed_into_nonqualified": absorbed,
        "remaining_partner_unknown": remaining,
    }


def _calculate_tax_code_distribution(
    rows: list,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """tax_code 分布を集計（β2-D L1-A observations）。

    judging-target 0 件の会社で「なぜ 0 件なのか」を tax_code 分布で説明する
    観察項目（原因構造系）。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {
            "top_codes": {"<tax_code 文字列>": <件数>, ...},
            "judging_target_count": <経過措置レンジ該当件数>,
            "judging_target_ratio": <該当比率、小数点以下 4 桁>,
        }
    """
    counter: Counter[int] = Counter()
    judging_target = 0
    for row in rows:
        tc = row.tax_code
        if tc is None:
            continue
        counter[tc] += 1
        # L1-A: 経過措置レンジ（183〜230）のみを judging_target にカウント
        # FULL_DEDUCTION 系コードを含める拡張は L1-B 以降
        if is_transitional_tax(tc):
            judging_target += 1

    # 件数降順、同数なら tax_code 昇順（決定論的順序）
    sorted_items = sorted(counter.items(), key=lambda x: (-x[1], x[0]))
    top_codes = {str(code): count for code, count in sorted_items}

    total = len(rows)
    ratio = round(judging_target / total, 4) if total > 0 else 0.0

    return {
        "top_codes": top_codes,
        "judging_target_count": judging_target,
        "judging_target_ratio": ratio,
    }


def _calculate_source_breakdown(
    transactions: list,  # type: ignore[type-arg]
) -> dict[str, int]:
    """source 別行数を集計（β2-D L1-B: source 由来で分岐）。

    L1-A 暫定固定（manual_journals_rows: 0）を廃止し、TransactionRow.raw["source"]
    で deals 由来 / manual_journals 由来をカウントする。

    入力は ctx.transactions（list[TransactionRow]）であり、InvoiceCheckRow ではない。
    InvoiceCheckRow は raw フィールドを持たないため、source 判定ができない。

    Args:
        transactions: ctx.transactions（list[TransactionRow]）。
            manual_journals 由来は raw["source"] = "manual_journal"（freee_to_context.py L350）。
            deals 由来は raw に "source" キーを持たない（同 L246〜L258）。

    Returns:
        {"deals_rows": N, "manual_journals_rows": M, "total": N + M}
    """
    deals_rows = 0
    manual_journals_rows = 0
    for tr in transactions:
        source = (tr.raw or {}).get("source")
        if source == "manual_journal":
            manual_journals_rows += 1
        else:
            deals_rows += 1
    return {
        "deals_rows": deals_rows,
        "manual_journals_rows": manual_journals_rows,
        "total": deals_rows + manual_journals_rows,
    }


def _finding_to_dict(finding) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    """InvoiceFinding を JSON 出力用 dict に変換する（β2-C）。

    classification は Enum 値（"nonqualified_but_full_deduction_tax" 等）に変換。
    Finding が classification=None で来た場合は null として出力（V1-3-10 互換）。
    """
    return {
        "severity": finding.severity,
        "rule_code": finding.rule_code,
        "classification": (
            finding.classification.value
            if finding.classification is not None
            else None
        ),
        "message": finding.message,
        "wallet_txn_id": finding.wallet_txn_id,
        "raw": finding.raw,
    }


# ─────────────────────────────────────────────────────────────────────
# β1: CLI / 入出力ヘルパ
# ─────────────────────────────────────────────────────────────────────

def _resolve_project_root() -> Path:
    """テスト時に環境変数 V1_3_20_PROJECT_ROOT で上書き可能。

    通常実行ではファイルパスから解決（office-claude/）。
    """
    import os

    override = os.environ.get("V1_3_20_PROJECT_ROOT")
    if override:
        return Path(override).resolve()
    return Path(__file__).resolve().parents[4]


PROJECT_ROOT = _resolve_project_root()  # office-claude/
SKILL_DIR = Path(__file__).resolve().parent

EXIT_OK = 0
EXIT_ARGS = 1
EXIT_JSON_MISSING = 2
EXIT_PERIOD_LOGIC = 3
EXIT_UNEXPECTED = 4

YYYYMM_RE = re.compile(r"^\d{4}-\d{2}$")

RULE_CODE = "V1-3-20"


class _Parser(argparse.ArgumentParser):
    """argparse のエラーを JSON で返すためのオーバーライド。"""

    def error(self, message: str) -> None:  # type: ignore[override]
        _emit_error(
            error_stage="args",
            exit_code=EXIT_ARGS,
            message=f"引数エラー: {message}",
        )
        sys.exit(EXIT_ARGS)


def _build_parser() -> _Parser:
    p = _Parser(
        prog="check-invoice-registration-status",
        description="V1-3-20 インボイス登録状況チェック (run.py)",
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
    return p


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
    """CLI 引数から動作モードを決定する。

    Returns:
        "period_range" | "target_month_cumulative" | "target_month_single"
    """
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


# ─────────────────────────────────────────────────────────────────────
# パス解決
# ─────────────────────────────────────────────────────────────────────

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
    """β1 で必要な 5 ファイルの期待パスを返す（manual_journals は対象外）。"""
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


# ─────────────────────────────────────────────────────────────────────
# 期間確定（target-month モード）
# ─────────────────────────────────────────────────────────────────────

def _resolve_period_from_target_month(
    *,
    company_id: int,
    target_month: str,
    single_month: bool,
) -> tuple[str, str]:
    """target_month から (period_start, period_end) を決定する。

    company_info.json の fiscal_year_start を参照して期首から累積期間を作る。
    single_month=True なら period_start = period_end = target_month。
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

    return period_start, period_end


# ─────────────────────────────────────────────────────────────────────
# 期間文字列 → date / 月末
# ─────────────────────────────────────────────────────────────────────

def _yyyymm_to_first_day(yyyymm: str) -> date:
    y, m = yyyymm.split("-")
    return date(int(y), int(m), 1)


def _yyyymm_to_last_day(yyyymm: str) -> date:
    from calendar import monthrange

    y, m = yyyymm.split("-")
    yi, mi = int(y), int(m)
    last = monthrange(yi, mi)[1]
    return date(yi, mi, last)


# ─────────────────────────────────────────────────────────────────────
# TransactionRow → InvoiceCheckRow adapter（L1-B 追加）
# ─────────────────────────────────────────────────────────────────────

def _build_invoice_check_rows(ctx) -> list["InvoiceCheckRow"]:  # type: ignore[no-untyped-def]
    """V1-3-10 共通の TransactionRow を V1-3-20 の InvoiceCheckRow に変換する。

    本関数は **純粋な変換のみ** を担う（L1-B 設計確定）：
        - 入力: ctx.transactions（list[TransactionRow]）+ ctx.partner_master
        - 出力: list[InvoiceCheckRow]
        - 条件分岐や正規化ロジックは持たない
        - I/O フリー（運用原則 P1）
        - 決定論的（同じ ctx に対して常に同じ rows を返す）

    入力は deals 由来 / manual_journals 由来の TransactionRow が混在する。
    両方とも同じマッピングで InvoiceCheckRow に変換する。

    9 フィールドのマッピング:
        - wallet_txn_id ← tr.wallet_txn_id
        - transaction_date ← tr.transaction_date
        - partner ← tr.partner
        - description ← tr.description
        - tax_label ← tr.tax_label
        - debit_amount ← tr.debit_amount
        - credit_amount ← tr.credit_amount
        - is_qualified_invoice ← ctx.partner_master[tr.partner]["is_invoice_registered"]
            （partner_master に未登録の場合は False）
        - tax_code ← tr.raw.get("tax_code") を int 化
            （None / 変換失敗の場合は None）

    Args:
        ctx: V1-3-10 共通の CheckContext。
            必要なフィールド: transactions, partner_master。

    Returns:
        InvoiceCheckRow のリスト。順序は ctx.transactions の順序を保持する。
    """
    rows: list[InvoiceCheckRow] = []
    partner_master = ctx.partner_master if ctx.partner_master else {}

    for tr in ctx.transactions:
        # tax_code の int 化（_normalize_deals L839〜L845 のロジックを踏襲）
        tax_code_raw = (tr.raw or {}).get("tax_code")
        if tax_code_raw is None:
            tax_code: Optional[int] = None
        else:
            try:
                tax_code = int(tax_code_raw)
            except (TypeError, ValueError):
                tax_code = None

        # is_qualified_invoice の解決
        # partner_master の key は partner name（_resolve_partner_name 由来）
        partner_info = partner_master.get(tr.partner) or {}
        is_qualified = bool(partner_info.get("is_invoice_registered", False))

        rows.append(
            InvoiceCheckRow(
                wallet_txn_id=tr.wallet_txn_id,
                transaction_date=tr.transaction_date,
                partner=tr.partner,
                description=tr.description,
                tax_label=tr.tax_label,
                debit_amount=tr.debit_amount,
                credit_amount=tr.credit_amount,
                is_qualified_invoice=is_qualified,
                tax_code=tax_code,
            )
        )

    return rows


# ─────────────────────────────────────────────────────────────────────
# deals → InvoiceCheckRow 正規化
# ─────────────────────────────────────────────────────────────────────

def _build_partners_map(partners_json: Any) -> dict[int, dict[str, Any]]:
    """partners_all.json (list) を id 引き dict に変換。"""
    out: dict[int, dict[str, Any]] = {}
    if isinstance(partners_json, list):
        for p in partners_json:
            pid = p.get("id")
            if pid is not None:
                out[pid] = p
    return out


def _build_taxes_map(taxes_json: Any) -> dict[int, str]:
    """taxes_codes.json (list of {code, name, name_ja}) を code → name_ja dict に変換。

    name_ja を tax_label として使う（"課対仕入10%" などの日本語表記）。
    """
    out: dict[int, str] = {}
    if isinstance(taxes_json, list):
        for t in taxes_json:
            code = t.get("code")
            label = t.get("name_ja") or t.get("name") or ""
            if code is not None:
                out[code] = label
    return out


def _resolve_partner_name(partner: dict[str, Any] | None) -> str:
    if partner is None:
        return ""
    name = partner.get("name") or partner.get("long_name") or ""
    return name


def _is_qualified_invoice(partner: dict[str, Any] | None) -> bool:
    """partner の qualified_invoice_issuer を bool 化。

    確定ルール（クラスタ 0 で 3 社 589 partners 確認済み）:
        - True 倒し: qualified_invoice_issuer == True
        - False 倒し: False / null / 欠損 / partner_id が partners_map に無い
    """
    if partner is None:
        return False
    return bool(partner.get("qualified_invoice_issuer"))


def _normalize_deals(
    deals_json: Any,
    partners_map: dict[int, dict[str, Any]],
    taxes_map: dict[int, str],
) -> list[InvoiceCheckRow]:
    """deals JSON を InvoiceCheckRow のリストに正規化する。

    マッピング (β1):
        wallet_txn_id      ← deals[].id を str 化
        transaction_date   ← deals[].issue_date
        partner            ← partners_map[partner_id].name
        description        ← details[].description (なければ deals[].ref_number)
        tax_label          ← taxes_map[details[].tax_code]
        debit_amount       ← details[].amount (entry_side == "debit" のときのみ)
        credit_amount      ← details[].amount (entry_side == "credit" のときのみ)
        is_qualified_invoice ← bool(partner.get("qualified_invoice_issuer"))

    重要: deals は 1 件に複数 details を持つ。details ごとに 1 行を作る。
    """
    deals = []
    if isinstance(deals_json, dict):
        deals = deals_json.get("deals", [])
    elif isinstance(deals_json, list):
        deals = deals_json

    rows: list[InvoiceCheckRow] = []
    for d in deals:
        deal_id = d.get("id")
        if deal_id is None:
            continue

        issue_date_str = d.get("issue_date")
        try:
            tx_date: Optional[date] = (
                date.fromisoformat(issue_date_str) if issue_date_str else None
            )
        except (ValueError, TypeError):
            tx_date = None

        partner_id = d.get("partner_id")
        partner_obj = partners_map.get(partner_id) if partner_id is not None else None
        partner_name = _resolve_partner_name(partner_obj)
        is_qi = _is_qualified_invoice(partner_obj)

        deal_ref = d.get("ref_number") or ""

        for det in d.get("details", []) or []:
            det_id = det.get("id")
            wallet_txn_id = f"{deal_id}-{det_id}" if det_id is not None else str(deal_id)

            tax_code_raw = det.get("tax_code")
            # int | None で正規化（β2 で classify_transaction の入力になるため、
            # 文字列化された数値が混入しても int に揃える）
            if tax_code_raw is None:
                tax_code: Optional[int] = None
            else:
                try:
                    tax_code = int(tax_code_raw)
                except (TypeError, ValueError):
                    tax_code = None
            tax_label = taxes_map.get(tax_code, "") if tax_code is not None else ""

            amount_raw = det.get("amount", 0)
            try:
                amount = Decimal(str(amount_raw))
            except (ValueError, ArithmeticError):
                amount = Decimal("0")

            entry_side = det.get("entry_side")
            if entry_side == "debit":
                debit_amount = amount
                credit_amount = Decimal("0")
            elif entry_side == "credit":
                debit_amount = Decimal("0")
                credit_amount = amount
            else:
                debit_amount = Decimal("0")
                credit_amount = Decimal("0")

            description = det.get("description") or deal_ref or ""

            rows.append(
                InvoiceCheckRow(
                    wallet_txn_id=wallet_txn_id,
                    transaction_date=tx_date,
                    partner=partner_name,
                    description=description,
                    tax_label=tax_label,
                    debit_amount=debit_amount,
                    credit_amount=credit_amount,
                    is_qualified_invoice=is_qi,
                    tax_code=tax_code,
                )
            )
    return rows


# ─────────────────────────────────────────────────────────────────────
# checker.py の動的ロード
# ─────────────────────────────────────────────────────────────────────

def _load_checker():
    """同階層の checker.py を動的ロードする。

    checker.py は schema.py に依存するため、schema を先に sys.modules に
    積んでから checker をロードする。checker 側はパッケージ import が
    使えない（ハイフン入りディレクトリ）ため _load_sibling フォールバック
    経由で schema を解決する。
    """
    # schema 先行ロード（"v1_3_20_invoice_schema" として登録）
    if "v1_3_20_invoice_schema" not in sys.modules:
        schema_spec = importlib.util.spec_from_file_location(
            "v1_3_20_invoice_schema", SKILL_DIR / "schema.py"
        )
        if schema_spec is None or schema_spec.loader is None:
            raise ImportError("schema.py をロードできません")
        schema_mod = importlib.util.module_from_spec(schema_spec)
        sys.modules["v1_3_20_invoice_schema"] = schema_mod
        schema_spec.loader.exec_module(schema_mod)

    if "v1_3_20_invoice_checker" in sys.modules:
        return sys.modules["v1_3_20_invoice_checker"]

    spec = importlib.util.spec_from_file_location(
        "v1_3_20_invoice_checker", SKILL_DIR / "checker.py"
    )
    if spec is None or spec.loader is None:
        raise ImportError("checker.py をロードできません")
    m = importlib.util.module_from_spec(spec)
    sys.modules["v1_3_20_invoice_checker"] = m
    spec.loader.exec_module(m)
    return m


# ─────────────────────────────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    mode = _resolve_mode(args)
    company_id: int = args.company_id

    # Step 1/2: target-month モードなら期首から period 確定
    if mode in ("target_month_cumulative", "target_month_single"):
        period_start, period_end = _resolve_period_from_target_month(
            company_id=company_id,
            target_month=args.target_month,
            single_month=(mode == "target_month_single"),
        )
    else:
        period_start = args.period_start
        period_end = args.period_end

    # Step 3: 5 ファイル充足確認
    paths = _expected_paths(
        company_id=company_id,
        period_start=period_start,
        period_end=period_end,
    )
    missing = _missing_entries(paths)
    if missing:
        base_dir = str(
            _period_dir(company_id, period_end).relative_to(PROJECT_ROOT)
        ).replace("\\", "/") + "/"
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

    # Step 4: build_check_context 経由で TransactionRow を取得し、adapter で InvoiceCheckRow に変換（L1-B）
    base_dir: Path = _period_dir(company_id, period_end)
    # V1-3-20 には --verbose 引数が存在しないため、stdout を一律 StringIO に捨てる
    # build_check_context が出力する観測ログは V1-3-20 では使用しない
    # （想定外論点 args.verbose 不在 への対処：β 採用、B1_continuation_prompt.md §1.1 参照）
    sink = io.StringIO()
    manual_journals_path: Optional[Path] = None  # B-1 で scope 動的化のため保持
    try:
        with contextlib.redirect_stdout(sink):
            # `scripts/` パッケージは office-claude 直下に固定。
            # PROJECT_ROOT は V1_3_20_PROJECT_ROOT で test 用に override 可能だが、
            # コード本体の所在は __file__ から固定で解決する（データパスとモジュール
            # パスの責務分離）。
            _SKILL_ROOT = Path(__file__).resolve().parents[4]  # office-claude/
            if str(_SKILL_ROOT) not in sys.path:
                sys.path.insert(0, str(_SKILL_ROOT))
            from scripts.e2e.freee_to_context import build_check_context

            # manual_journals は対象期間内のものを参照（freee 側で取得済みのファイル）
            mj_candidate = base_dir / f"manual_journals_{period_start}_to_{period_end}.json"
            if mj_candidate.exists() and mj_candidate.stat().st_size > 0:
                manual_journals_path = mj_candidate

            # build_check_context シグネチャ（freee_to_context.py L374〜L383）厳守:
            #   必須 5: deals_path / partners_path / account_items_path / company_info_path / taxes_codes_path
            #   Optional: manual_journals_path / items_path / sections_path / tags_path
            #   period_start / period_end / company_id は渡さない（内部で company_info.json から抽出）
            #   全引数 Path 型（str() 変換不要）
            ctx = build_check_context(
                deals_path=base_dir / f"deals_{period_start}_to_{period_end}.json",
                partners_path=base_dir / "partners_all.json",
                account_items_path=base_dir / "account_items_all.json",
                company_info_path=base_dir / "company_info.json",
                taxes_codes_path=base_dir / "taxes_codes.json",
                manual_journals_path=manual_journals_path,
            )

        rows = _build_invoice_check_rows(ctx)
        # L1-B: source_breakdown は ctx.transactions（TransactionRow）を入力に取る
        # InvoiceCheckRow は raw フィールドを持たないため、adapter 前の transactions を保持
        transactions = ctx.transactions
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="normalize",
            exit_code=EXIT_UNEXPECTED,
            message=f"CheckContext 構築または adapter 変換に失敗: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "traceback": traceback.format_exc(),
            },
        )
        return EXIT_UNEXPECTED

    # Step 5: 5 分類体系で各行を分類（β2-B、判定は止めない）
    classified: list[tuple[InvoiceCheckRow, Classification]] = [
        (row, classify_transaction(row)) for row in rows
    ]
    classification_counts: Counter[str] = Counter(
        c.value for _, c in classified
    )
    # classification_counts に 6 値すべてのキーを必ず含める（0 件でもキーは出す）
    for c in Classification:
        classification_counts.setdefault(c.value, 0)

    # 方針 3 の不変条件チェック: sum(counts) == total_rows
    total_rows = len(rows)
    counts_sum = sum(classification_counts.values())
    if counts_sum != total_rows:
        _emit_error(
            error_stage="classification_invariant",
            exit_code=EXIT_UNEXPECTED,
            message=(
                f"Classification 件数合計 ({counts_sum}) が "
                f"total_rows ({total_rows}) と一致しません（β2-A 方針 3 違反）"
            ),
            extra={"classification_counts": dict(classification_counts)},
        )
        return EXIT_UNEXPECTED

    # Finding 化対象は 3 分類のみ（残り 3 つは観察用に counts のみ）
    # β2-C: FINDING_TARGET_CLASSIFICATIONS（モジュール定数）を参照
    finding_target_pairs = [
        (row, c) for row, c in classified if c in FINDING_TARGET_CLASSIFICATIONS
    ]
    finding_target_rows = [row for row, _ in finding_target_pairs]
    finding_target_classifications = [c for _, c in finding_target_pairs]

    # Step 6: Finding 変換（β2-C: rows と classifications のペアで渡す）
    try:
        checker = _load_checker()
        findings = checker.to_findings(
            finding_target_rows, finding_target_classifications
        )
    except Exception as e:  # noqa: BLE001
        _emit_error(
            error_stage="finding_conversion",
            exit_code=EXIT_UNEXPECTED,
            message=f"Finding 変換に失敗: {type(e).__name__}: {e}",
            extra={"traceback": traceback.format_exc()},
        )
        return EXIT_UNEXPECTED

    # Step 7: classification 単位の group 化（β2-C 確定、必ず 3 件、順序固定）
    groups = find_groups(findings)

    # Step 7.5: observations 集計（β2-C 確定 + β2-D L1-A 拡張）
    partner_unknown_breakdown = _calculate_partner_unknown_breakdown(classified)
    tax_code_distribution = _calculate_tax_code_distribution(rows)  # L1-A 新規
    source_breakdown = _calculate_source_breakdown(transactions)    # L1-B: TransactionRow 入力

    # Step 8: JSON 出力（β2-C）
    #   - groups[].findings に Finding 本体を集約
    #   - トップレベル findings キーは削除
    #   - findings_count は warning Finding の総数として維持
    groups_payload = [
        {
            "classification": g.classification.value,
            "findings_count": g.findings_count,
            "findings": [_finding_to_dict(f) for f in g.findings],
        }
        for g in groups
    ]

    period_start_date = _yyyymm_to_first_day(period_start)
    period_end_date = _yyyymm_to_last_day(period_end)

    _emit(
        {
            "status": "ok",
            "exit_code": EXIT_OK,
            "company_id": company_id,
            "mode": mode,
            "period_start": period_start_date.isoformat(),
            "period_end": period_end_date.isoformat(),
            "target_month": args.target_month,
            "single_month": bool(args.single_month),
            "rule_code": RULE_CODE,
            "scope": {"deals": True, "manual_journals": manual_journals_path is not None},
            "classification_counts": dict(classification_counts),
            "groups": groups_payload,
            "findings_count": len(findings),
            "observations": {
                "partner_unknown_breakdown": partner_unknown_breakdown,
                "tax_code_distribution": tax_code_distribution,    # L1-A 新規
                "source_breakdown": source_breakdown,              # L1-A 新規
            },
        }
    )
    return EXIT_OK


__all__ = [
    "AMOUNT_THRESHOLD",
    "TRANSITIONAL_TAX_CODES",
    "FULL_DEDUCTION_TAX_CODES",
    "GROUP_CLASSIFICATION_ORDER",
    "FINDING_TARGET_CLASSIFICATIONS",
    "Classification",
    "InvoiceCheckRow",
    "is_transitional_tax",
    "is_full_deduction_tax",
    "classify_transaction",
    "find_groups",
]


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
