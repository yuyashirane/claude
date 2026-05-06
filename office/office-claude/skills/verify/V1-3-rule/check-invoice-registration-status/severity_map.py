"""V1-3-20 (check-invoice-registration-status) 用の Severity マッピング。

V1-3-20 内部の severity 文字列値を共通 Severity Literal に変換する。
β2-E E3-b で導入。

設計メモ: docs/design/V1-3-20_beta2_E_design_v0.md
調査結果: docs/analysis/v1-3-20-migration-survey-2026-05-06.md
"""

from __future__ import annotations

from skills._common.schema import Severity


V1320_SEVERITY_MAP: dict[str, Severity] = {
    "warning": "🟠 High",
}
"""V1-3-20 の severity 値を共通 Severity Literal に変換するマップ。

現状は ``"warning"`` のみ。将来別の値が追加される場合はここに追加する。
"""


def to_common_severity(v1320_severity: str) -> Severity:
    """V1-3-20 の severity 値を共通 Severity Literal に変換する。

    マップに存在しない値が渡された場合は ValueError を送出する。
    """
    if v1320_severity not in V1320_SEVERITY_MAP:
        raise ValueError(
            f"Unknown V1-3-20 severity value: {v1320_severity!r}. "
            f"Known values: {list(V1320_SEVERITY_MAP.keys())}"
        )
    return V1320_SEVERITY_MAP[v1320_severity]


__all__ = ["V1320_SEVERITY_MAP", "to_common_severity"]
