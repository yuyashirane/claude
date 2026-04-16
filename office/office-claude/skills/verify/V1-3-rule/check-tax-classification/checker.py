"""V1-3-10 check-tax-classification: メイン checker。

本ファイルは §13.4.5 の checker.py であり、TC-01〜TC-07 の
ディスパッチャ（振り分け役）として機能する。

Phase 1 では骨格のみ。各 TC の実ロジックは Phase 2 以降で
checks/tc01_sales.py 〜 checks/tc07_welfare.py に実装する。

配置: skills/verify/V1-3-rule/check-tax-classification/checker.py
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def run(ctx) -> list:
    """メインエントリポイント。CheckContext を受け取り、Finding のリストを返す。

    Phase 2: TC-03 のみ実装済み。他の TC は Phase 3 以降で追加。
    """
    findings = []

    # TC-01: 売上の税区分検証
    from checks.tc01_sales import run as run_tc01
    findings.extend(run_tc01(ctx))

    # TC-02: 土地・住宅家賃の課税誤り
    from checks.tc02_land_rent import run as run_tc02
    findings.extend(run_tc02(ctx))

    # TC-03: 給与・法定福利費の課税誤り
    from checks.tc03_payroll import run as run_tc03
    findings.extend(run_tc03(ctx))

    # TC-04: 受取利息・配当・保険金・補助金の課税誤り
    from checks.tc04_non_taxable_revenue import run as run_tc04
    findings.extend(run_tc04(ctx))

    # TC-05: 支払利息・保険料の非課税漏れ
    from checks.tc05_non_taxable_expense import run as run_tc05
    findings.extend(run_tc05(ctx))

    # TC-06: 租税公課の課税誤り
    from checks.tc06_tax_public_charges import run as run_tc06
    findings.extend(run_tc06(ctx))

    # TC-07: 福利厚生費の不課税・非課税判定誤り(Pattern D: KW優先順位ディスパッチ型)
    from checks.tc07_welfare import run as run_tc07
    findings.extend(run_tc07(ctx))

    return findings


def _dispatch_tc(tc_code: str, ctx) -> list:
    """TC コードに対応する checks モジュールを呼び出す。

    Phase 2 以降で実装予定の dispatch テーブル:
        TC-01 → checks.tc01_sales.run(ctx)
        TC-02 → checks.tc02_land_rent.run(ctx)
        TC-03 → checks.tc03_payroll.run(ctx)
        TC-04 → checks.tc04_non_taxable_revenue.run(ctx)
        TC-05 → checks.tc05_non_taxable_expense.run(ctx)
        TC-06 → checks.tc06_tax_public_charges.run(ctx)
        TC-07 → checks.tc07_welfare.run(ctx)
    """
    raise NotImplementedError(
        f"_dispatch_tc('{tc_code}') is not yet implemented. "
        f"Phase 2 will add TC-03, Phase 3 will add TC-04/05/06, etc."
    )
