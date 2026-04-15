"""NOTE_MARKERS 定義とバリデーション。

出典: v1.2.2 §13.4.4 notes マーカー一覧(P9/P10)
配置: skills/_common/lib/note_markers.py (§13.4.5 準拠)

notes の役割:
    UI/集計用の正規化マーカー（機械処理向け、集中管理）。
    rule_basis とは役割が異なる（rule_basis = 自由記述の判定根拠ログ）。
"""

# ── §13.4.4 確定版 ──

NOTE_MARKERS: frozenset[str] = frozenset({
    "tax_impact_negligible",         # 税額影響軽微
    "defer_to_V1-3-20",              # 軽減税率Skillへ委譲
    "defer_to_V1-3-30",              # 軽油引取税Skillへ委譲
    "high_anomaly",                  # 高異常度
    "reverse_detection",             # 逆方向検出
    "affects_taxable_sales_ratio",   # 課税売上割合に影響
})


def validate_note(marker: str) -> str:
    """マーカーが NOTE_MARKERS に含まれるか検証する。

    タイポ防止用。Finding 生成時に必ず通す。

    Args:
        marker: 検証するマーカー文字列

    Returns:
        検証済みのマーカー文字列（そのまま返す）

    Raises:
        ValueError: marker が NOTE_MARKERS に含まれない場合
    """
    if marker not in NOTE_MARKERS:
        raise ValueError(
            f"Unknown note marker: '{marker}'. "
            f"Valid markers: {sorted(NOTE_MARKERS)}"
        )
    return marker
