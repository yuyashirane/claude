"""テンプレート用全パターン出力例 Excel の生成スクリプト。

TC-01〜TC-07 × severity × area の代表的な組み合わせ 17件の
ダミー Finding を生成し、Excel に出力する。

Usage:
    cd office-claude
    python scripts/e2e/generate_template_data.py
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

# schema.py はディレクトリ名にハイフンを含むため importlib で直接ロード
_schema_path = (
    PROJECT_ROOT / "skills" / "verify" / "V1-3-rule"
    / "check-tax-classification" / "schema.py"
)
_spec = importlib.util.spec_from_file_location("schema", _schema_path)
_schema_mod = importlib.util.module_from_spec(_spec)
sys.modules["schema"] = _schema_mod
_spec.loader.exec_module(_schema_mod)

Finding = _schema_mod.Finding
LinkHints = _schema_mod.LinkHints

from skills.export.excel_report.exporter import export_to_excel


def _make_findings() -> list[Finding]:
    """17件のダミー Finding を生成する。"""

    def f(
        tc: str,
        sub: str,
        sev: str,
        err: str,
        rvl: str,
        area: str,
        pri: int,
        cur: str,
        sug: str,
        acct: str,
        msg: str,
        conf: int = 80,
        wallet: str = "",
    ) -> Finding:
        return Finding(
            tc_code=tc,
            sub_code=sub,
            severity=sev,
            error_type=err,
            review_level=rvl,
            area=area,
            sort_priority=pri,
            current_value=cur,
            suggested_value=sug,
            confidence=conf,
            message=msg,
            wallet_txn_id=wallet,
            link_hints=LinkHints(
                target="general_ledger",
                account_name=acct,
                period_start=date(2025, 12, 1),
                period_end=date(2025, 12, 31),
            ),
        )

    return [
        # ── TC-01 売上の税区分 (area: A8) ──────────────────────────────
        f("TC-01", "TC-01-01", "🔴 High",    "direct_error",    "🔴必修",
          "A8", 100, "課対売上10%",  "免税売上",     "売上高",
          "免税事業者への売上に課税区分が設定されています。免税売上に変更してください。"),

        f("TC-01", "TC-01-02", "🟡 Medium",  "gray_review",     "🟡判断",
          "A8", 110, "課対売上8%",   "課対売上10%",  "売上高",
          "旧税率8%の区分が使われています。取引日を確認し、10%への変更を検討してください。"),

        f("TC-01", "TC-01-03", "🟢 Low",     "mild_warning",    "🟢参考",
          "A8", 120, "課対売上10%",  "対象外",       "雑収入",
          "雑収入に課税区分が設定されています。対象外収入の可能性があります。"),

        # ── TC-02 土地/住宅の非課税 (area: A4) ─────────────────────────
        f("TC-02", "TC-02-01", "🔴 High",    "direct_error",    "🔴必修",
          "A4", 200, "課対仕入10%",  "非課税仕入",   "地代家賃",
          "土地の賃借料に課税仕入が設定されています。土地は非課税取引です。"),

        f("TC-02", "TC-02-02", "🟡 Medium",  "gray_review",     "🟡判断",
          "A4", 210, "課対仕入10%",  "非課税仕入",   "賃借料",
          "住居用建物の賃借料の可能性があります。用途を確認してください。"),

        # ── TC-03 給与/人件費 (area: A5) ────────────────────────────────
        f("TC-03", "TC-03-01", "🔴 High",    "direct_error",    "🔴必修",
          "A5", 300, "課対仕入10%",  "対象外",       "給与手当",
          "給与手当に課税仕入が設定されています。給与は消費税の課税対象外です。"),

        f("TC-03", "TC-03-02", "🟡 Medium",  "gray_review",     "🟡判断",
          "A5", 310, "課対仕入10%",  "対象外",       "役員報酬",
          "役員報酬に課税仕入が設定されています。対象外に変更が必要です。",
          conf=90),

        f("TC-03", "TC-03-03", "🟢 Low",     "mild_warning",    "🟢参考",
          "A5", 320, "課対仕入10%",  "対象外",       "福利厚生費",
          "社員旅行費の一部が給与課税される可能性があります。内容を確認してください。",
          conf=60),

        # ── TC-04 非課税/対象外の収益 (area: A11) ───────────────────────
        f("TC-04", "TC-04-01", "🔴 High",    "direct_error",    "🔴必修",
          "A11", 400, "課対売上10%", "非課税売上",   "受取利息",
          "受取利息に課税売上が設定されています。利子は非課税取引です。"),

        f("TC-04", "TC-04-02", "🟠 Warning", "reverse_suspect", "🟠警戒",
          "A11", 410, "非課税売上",  "課対売上10%",  "雑収入",
          "非課税売上の区分が付いていますが、課税売上の可能性があります。内容を確認してください。",
          conf=55),

        # ── TC-05 非課税/対象外の費用 (area: A10) ───────────────────────
        f("TC-05", "TC-05-01", "🔴 High",    "direct_error",    "🔴必修",
          "A10", 500, "課対仕入10%", "非課税仕入",   "支払利息",
          "支払利息に課税仕入が設定されています。利子は非課税取引です。"),

        f("TC-05", "TC-05-02", "🟡 Medium",  "gray_review",     "🟡判断",
          "A10", 510, "課対仕入10%", "対象外",       "保険料",
          "生命保険料に課税仕入が設定されています。非課税または対象外の可能性があります。"),

        f("TC-05", "TC-05-03", "🟢 Low",     "mild_warning",    "🟢参考",
          "A10", 520, "課対仕入10%", "対象外",       "租税公課",
          "印紙税が含まれている可能性があります。対象外への変更を検討してください。",
          conf=65),

        # ── TC-06 税金/租税公課 (area: A12) ─────────────────────────────
        f("TC-06", "TC-06-01", "🔴 High",    "direct_error",    "🔴必修",
          "A12", 600, "課対仕入10%", "対象外",       "租税公課",
          "固定資産税に課税仕入が設定されています。税金は消費税の対象外です。"),

        f("TC-06", "TC-06-02", "🟡 Medium",  "gray_review",     "🟡判断",
          "A12", 610, "課対仕入10%", "対象外",       "法人税等",
          "法人税等の支払いに課税仕入が設定されています。対象外に変更が必要です。"),

        # ── TC-07 福利厚生 (area: A5) ────────────────────────────────────
        f("TC-07", "TC-07-01", "🟡 Medium",  "gray_review",     "🟡判断",
          "A5", 700, "課対仕入10%",  "対象外",       "福利厚生費",
          "慶弔見舞金に課税仕入が設定されています。対象外への変更を検討してください。"),

        f("TC-07", "TC-07-02", "🟢 Low",     "mild_warning",    "🟢参考",
          "A5", 710, "課対仕入10%",  "課対仕入10%",  "福利厚生費",
          "社員食堂費用の税区分は課税仕入で正しいと推定されます。金額が大きい場合は確認してください。",
          conf=70),
    ]


def main() -> None:
    findings = _make_findings()

    output_path = PROJECT_ROOT / "data" / "reports" / "template" / "全パターン出力例.xlsx"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    result = export_to_excel(
        findings=findings,
        output_path=output_path,
        company_name="テンプレート用サンプル株式会社",
        period="2025/12",
    )
    print(f"生成完了: {result}")
    print(f"Finding件数: {len(findings)}")

    area_counts: dict[str, int] = {}
    for fn in findings:
        area_counts[fn.area] = area_counts.get(fn.area, 0) + 1
    for area, cnt in sorted(area_counts.items()):
        print(f"  {area}: {cnt}件")


if __name__ == "__main__":
    main()
