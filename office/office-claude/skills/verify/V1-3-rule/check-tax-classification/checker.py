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

    Phase 1 では NotImplementedError を投げる骨格のみ。
    Phase 2 以降で TC ごとの checks モジュールを呼び出す dispatch を実装する。

    Args:
        ctx: CheckContext インスタンス

    Returns:
        Finding のリスト

    Raises:
        NotImplementedError: Phase 1 時点では未実装
    """
    raise NotImplementedError(
        "checker.run() is a skeleton in Phase 1. "
        "TC implementations will be added in Phase 2 onwards."
    )


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
