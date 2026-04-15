"""Finding 生成ファクトリ + 共通ヘルパー。

本ファイルは §13.4.5 の finding_factory.py として、以下の責務を集約する:
- Finding 生成 (create_finding, build_link_hints, determine_area)
- 妥当性検証 (validate_finding, check_exclusive_match)
- 仕訳判定 (is_debit_side, is_credit_side, get_amount)
- 期間・日付 (get_month_range, get_period_range)
- リファレンス読込 (load_reference_json, load_common_definitions)

将来肥大化が問題になった場合は Phase 2 以降で内部分割を検討する。
Phase 1 では本ファイル1つに全13関数を配置する。

出典: Step 4-C v0.2.1 §3.B/C/D/E/F
配置: skills/_common/lib/finding_factory.py (§13.4.5 準拠)
"""
from __future__ import annotations

import calendar
import importlib.util
import json
import re
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Optional


# ═══════════════════════════════════════════════════════════════
# Section A: リファレンス読込（§3.D）
# ═══════════════════════════════════════════════════════════════

_SKILLS_ROOT = Path(__file__).parent.parent.parent  # skills/


def load_reference_json(skill_path: str, filename: str) -> dict:
    """Skill 固有の references/JSON を読み込む。

    Args:
        skill_path: Skill の相対パス（例: "verify/V1-3-rule/check-tax-classification"）
        filename: ファイル名（拡張子なし、例: "payroll-accounts"）

    Returns:
        読み込まれた dict

    Raises:
        FileNotFoundError: ファイルが存在しない
        json.JSONDecodeError: JSON が不正
    """
    path = _SKILLS_ROOT / skill_path / "references" / f"{filename}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_common_definitions(name: str) -> dict:
    """_common/references/ の共通辞書を読み込む。

    Args:
        name: ファイル名（拡張子なし、例: "area-definitions"）

    Returns:
        読み込まれた dict

    Raises:
        FileNotFoundError: ファイルが存在しない
    """
    path = _SKILLS_ROOT / "_common" / "references" / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


# ═══════════════════════════════════════════════════════════════
# Section A.5: schema.py のロード（ハイフン入りパス対応）
# ═══════════════════════════════════════════════════════════════

def _load_schema_module():
    """schema.py を importlib で読み込み、sys.modules に登録する。

    Python 3.12 では frozen dataclass 評価時に sys.modules 参照が必要なため、
    モジュール名 "schema" で登録する。複数回呼ばれても再ロードしない。
    """
    if "schema" in sys.modules:
        return sys.modules["schema"]
    schema_path = (
        _SKILLS_ROOT
        / "verify" / "V1-3-rule" / "check-tax-classification" / "schema.py"
    )
    spec = importlib.util.spec_from_file_location("schema", schema_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["schema"] = mod
    spec.loader.exec_module(mod)
    return mod


# ═══════════════════════════════════════════════════════════════
# Section B: 仕訳判定（§3.B）
# ═══════════════════════════════════════════════════════════════

def is_debit_side(row) -> bool:
    """TransactionRow が借方計上かを判定する。

    debit_amount > 0 かつ credit_amount == 0 の場合に True。
    両方 > 0 は False（精算仕訳等、本 Skill スコープ外）。
    """
    d = getattr(row, "debit_amount", Decimal("0"))
    c = getattr(row, "credit_amount", Decimal("0"))
    return d > 0 and c == 0


def is_credit_side(row) -> bool:
    """TransactionRow が貸方計上かを判定する。is_debit_side の対称関数。"""
    d = getattr(row, "debit_amount", Decimal("0"))
    c = getattr(row, "credit_amount", Decimal("0"))
    return c > 0 and d == 0


def get_amount(row) -> Decimal:
    """借方/貸方を吸収して取引金額を返す。

    借方計上 → debit_amount、貸方計上 → credit_amount。
    両方0 → Decimal("0")、両方 > 0 → 大きい方（異常データの救済）。
    """
    d = getattr(row, "debit_amount", Decimal("0"))
    c = getattr(row, "credit_amount", Decimal("0"))
    if d > 0 and c == 0:
        return d
    if c > 0 and d == 0:
        return c
    if d == 0 and c == 0:
        return Decimal("0")
    return max(d, c)  # 異常データの救済


# ═══════════════════════════════════════════════════════════════
# Section C: 期間・日付（§3.C）
# ═══════════════════════════════════════════════════════════════

def get_month_range(transaction_date: date) -> tuple[date, date]:
    """取引日が含まれる月の月初と月末を返す。

    freeeリンクの総勘定元帳で period_start / period_end に使用。
    閏年対応済み（calendar.monthrange 使用）。

    Examples:
        >>> get_month_range(date(2026, 3, 15))
        (date(2026, 3, 1), date(2026, 3, 31))
        >>> get_month_range(date(2024, 2, 10))  # 閏年
        (date(2024, 2, 1), date(2024, 2, 29))
    """
    y, m = transaction_date.year, transaction_date.month
    _, last_day = calendar.monthrange(y, m)
    return date(y, m, 1), date(y, m, last_day)


def get_period_range(fiscal_year_id: str, ctx) -> Optional[tuple[date, date]]:
    """会計期IDから期首・期末の日付を取得する。

    CheckContext の情報のみを参照（I/Oフリー）。
    fiscal_year_id が ctx と一致しなければ None。
    """
    if getattr(ctx, "fiscal_year_id", None) == fiscal_year_id:
        return (ctx.period_start, ctx.period_end)
    return None


# ═══════════════════════════════════════════════════════════════
# Section D: Finding 生成（§3.E）
# ═══════════════════════════════════════════════════════════════

# error_type → review_level のデフォルト対応表
_ERROR_TYPE_TO_REVIEW_LEVEL: dict[str, str] = {
    "direct_error":    "🔴必修",
    "gray_review":     "🟡判断",
    "reverse_suspect": "🟠警戒",
    "mild_warning":    "🟢参考",
}


def create_finding(
    tc_code: str,
    sub_code: str,
    severity: str,
    error_type: str,
    area: str,
    sort_priority: int,
    row,
    current_value: str,
    suggested_value: str,
    confidence: int,
    message: str,
    *,
    subarea: Optional[str] = None,
    show_by_default: bool = True,
    note: Optional[str] = None,
    detail=None,
    link_hints=None,
):
    """Finding 構造体を生成する。

    review_level は error_type から自動導出:
        direct_error    → 🔴必修
        gray_review     → 🟡判断
        reverse_suspect → 🟠警戒
        mild_warning    → 🟢参考

    Args:
        row: TransactionRow（wallet_txn_id と deal_id を自動取得）
        その他: Finding dataclass の各フィールドに対応

    Returns:
        生成された Finding インスタンス
    """
    # note のバリデーション（指定されている場合）
    if note is not None:
        from skills._common.lib.note_markers import validate_note
        validate_note(note)

    review_level = _ERROR_TYPE_TO_REVIEW_LEVEL.get(error_type, "🔴必修")

    schema_mod = _load_schema_module()

    return schema_mod.Finding(
        tc_code=tc_code,
        sub_code=sub_code,
        severity=severity,
        error_type=error_type,
        review_level=review_level,
        area=area,
        sort_priority=sort_priority,
        wallet_txn_id=getattr(row, "wallet_txn_id", ""),
        deal_id=getattr(row, "deal_id", None),
        current_value=current_value,
        suggested_value=suggested_value,
        confidence=confidence,
        message=message,
        subarea=subarea,
        show_by_default=show_by_default,
        link_hints=link_hints,
        detail=detail,
        note=note,
    )


def build_link_hints(
    target: str,
    row,
    ctx,
    *,
    tax_group_codes: Optional[list[str]] = None,
):
    """LinkHints 構造体を生成する。

    target 別の挙動:
        general_ledger: account_name + 月単位の period
        journal: 月単位の period のみ（account_name なし）
        deal_detail: deal_id のみ（period なし）

    Raises:
        ValueError: target="deal_detail" で row.deal_id が None
    """
    schema_mod = _load_schema_module()

    if target == "general_ledger":
        txn_date = getattr(row, "transaction_date", None)
        p_start, p_end = get_month_range(txn_date) if txn_date else (None, None)
        return schema_mod.LinkHints(
            target=target,
            account_name=getattr(row, "account", None),
            period_start=p_start,
            period_end=p_end,
            tax_group_codes=tax_group_codes,
            fiscal_year_id=getattr(ctx, "fiscal_year_id", None),
            company_id=getattr(ctx, "company_id", None),
        )

    elif target == "journal":
        txn_date = getattr(row, "transaction_date", None)
        p_start, p_end = get_month_range(txn_date) if txn_date else (None, None)
        return schema_mod.LinkHints(
            target=target,
            period_start=p_start,
            period_end=p_end,
            fiscal_year_id=getattr(ctx, "fiscal_year_id", None),
            company_id=getattr(ctx, "company_id", None),
        )

    elif target == "deal_detail":
        deal_id = getattr(row, "deal_id", None)
        if deal_id is None:
            raise ValueError("build_link_hints: target='deal_detail' requires row.deal_id")
        return schema_mod.LinkHints(
            target=target,
            deal_id=deal_id,
            fiscal_year_id=getattr(ctx, "fiscal_year_id", None),
            company_id=getattr(ctx, "company_id", None),
        )

    else:
        raise ValueError(f"Unknown target: {target}")


def determine_area(
    account: str,
    default_area: str,
    area_mapping: dict[str, str],
) -> str:
    """勘定科目からエリアを動的決定する。

    TC-05 の動的付与（支払利息=A11、保険料=A10）等で使用。

    Examples:
        >>> determine_area("支払利息", "A10", {"支払利息": "A11", "保険料": "A10"})
        'A11'
        >>> determine_area("消耗品費", "A10", {"支払利息": "A11"})
        'A10'
    """
    from skills._common.lib.keyword_matcher import normalize_account_name
    normalized = normalize_account_name(account)
    for key, area in area_mapping.items():
        if normalize_account_name(key) == normalized:
            return area
    return default_area


# ═══════════════════════════════════════════════════════════════
# Section E: 妥当性検証（§3.F）
# ═══════════════════════════════════════════════════════════════

def validate_finding(finding) -> list[str]:
    """Finding の妥当性を検証する。エラーリストを返す（空なら妥当）。"""
    errors = []

    # tc_code
    if not re.match(r"^TC-0[1-8]$", getattr(finding, "tc_code", "")):
        errors.append(f"Invalid tc_code: {finding.tc_code}")

    # sub_code
    if not re.match(r"^TC-0[1-8][a-g]$", getattr(finding, "sub_code", "")):
        errors.append(f"Invalid sub_code: {finding.sub_code}")

    # sub_code が tc_code と整合
    tc = getattr(finding, "tc_code", "")
    sc = getattr(finding, "sub_code", "")
    if tc and sc and not sc.startswith(tc):
        errors.append(f"sub_code '{sc}' does not start with tc_code '{tc}'")

    # area
    if not re.match(r"^A(1[0-3]|[1-9])$", getattr(finding, "area", "")):
        errors.append(f"Invalid area: {finding.area}")

    # sort_priority
    sp = getattr(finding, "sort_priority", -1)
    if not (1 <= sp <= 99):
        errors.append(f"sort_priority out of range: {sp}")

    # confidence
    conf = getattr(finding, "confidence", -1)
    if not (0 <= conf <= 100):
        errors.append(f"confidence out of range: {conf}")

    # error_type → review_level 整合
    et = getattr(finding, "error_type", "")
    rl = getattr(finding, "review_level", "")
    expected_rl = _ERROR_TYPE_TO_REVIEW_LEVEL.get(et)
    if expected_rl and rl != expected_rl:
        errors.append(
            f"review_level '{rl}' does not match error_type '{et}' "
            f"(expected '{expected_rl}')"
        )

    # message
    if not getattr(finding, "message", ""):
        errors.append("message is empty")

    return errors


def check_exclusive_match(findings: list) -> list:
    """同一取引(wallet_txn_id)につき1 Finding のみ残す優先排他制御。

    4段階タイブレーク（v0.2.1 確定、P12 決定的動作）:
        1. error_type = direct_error を最優先
        2. 同じ error_type 内では sort_priority が小さい方
        3. さらに同じなら confidence が高い方
        4. さらに同じなら sub_code のアルファベット順

    入力順序に依存しない結果を保証:
        check_exclusive_match([A, B]) == check_exclusive_match([B, A])
    """
    ERROR_TYPE_PRIORITY = {
        "direct_error": 0,
        "gray_review": 1,
        "reverse_suspect": 2,
        "mild_warning": 3,
    }

    def sort_key(f):
        return (
            ERROR_TYPE_PRIORITY.get(getattr(f, "error_type", ""), 99),
            getattr(f, "sort_priority", 99),
            -getattr(f, "confidence", 0),  # 高い方優先なので負
            getattr(f, "sub_code", ""),
        )

    # wallet_txn_id でグルーピング
    groups: dict[str, list] = {}
    for f in findings:
        key = getattr(f, "wallet_txn_id", "")
        groups.setdefault(key, []).append(f)

    result = []
    for key in sorted(groups.keys()):
        candidates = groups[key]
        candidates.sort(key=sort_key)
        result.append(candidates[0])

    return result


# ═══════════════════════════════════════════════════════════════
# Section F: ReferenceBundle 構築（schema.py の代替実装）
# ═══════════════════════════════════════════════════════════════

def load_reference_bundle(skill_name: str):
    """ReferenceBundle を構築する実装。

    schema.py の ReferenceBundle.load_for_skill の代替。
    schema.py 側は NotImplementedError のままにし、呼び出し側が
    finding_factory.load_reference_bundle を使う。

    Args:
        skill_name: Skill パス（例: "verify/V1-3-rule/check-tax-classification"）
    """
    schema_mod = _load_schema_module()

    # 共通辞書を読み込み
    common = {}
    for name in ["severity-levels", "area-definitions", "tax-codes-master",
                 "tax-code-categories", "overseas-services"]:
        try:
            common[name] = load_common_definitions(name)
        except FileNotFoundError:
            pass  # overseas-services 等が未配置の環境でもエラーにしない

    # Skill 固有辞書を読み込み（Phase 2 以降で keywords/ 配下に JSON が追加される）
    skill_specific = {}
    skill_refs_dir = _SKILLS_ROOT / skill_name / "references"
    if skill_refs_dir.exists():
        for json_file in skill_refs_dir.glob("**/*.json"):
            key = json_file.stem
            try:
                skill_specific[key] = json.loads(
                    json_file.read_text(encoding="utf-8")
                )
            except json.JSONDecodeError:
                pass

    return schema_mod.ReferenceBundle(
        common=common,
        skill_specific=skill_specific,
    )
