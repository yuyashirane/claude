"""sub_code → sort_priority のマッピング。

仕様書 §11.5 に従い、以下のレンジで割り付ける:
- 1〜10:   最優先レビュー(🔴 High の主要)
- 11〜30:  通常レビュー
- 31〜50:  軽微・参考(現状未使用、将来拡張用)
- 90〜99:  初期非表示(show_by_default=False)
"""

SORT_PRIORITY_MAP: dict[str, int] = {
    # 1〜10 最優先レビュー(仕様書 §11.5.1)
    "TC-03a": 1,
    "TC-03b": 2,
    "TC-06b": 3,
    "TC-04a": 4,
    "TC-04b": 5,
    "TC-02a": 6,
    "TC-02b": 7,
    "TC-02c": 8,
    "TC-01b": 9,
    "TC-01c": 10,
    "TC-01d": 10,    # 仕様書上「10 並列」
    "TC-01e": 10,    # 同上

    # 11〜30 通常レビュー(仕様書 §11.5.2)
    "TC-06a": 11,
    "TC-07a": 12,
    "TC-07b": 13,
    "TC-05a": 14,
    "TC-05b": 15,
    "TC-02d": 16,
    "TC-02e": 17,
    "TC-02f": 18,
    "TC-04e": 19,
    "TC-04f": 20,
    "TC-07c": 21,
    "TC-07d": 22,
    "TC-07e": 23,
    "TC-01a": 24,
    "TC-05e": 25,
    "TC-06d": 26,
    "TC-06e": 27,
    "TC-07f": 28,

    # 90〜99 初期非表示(仕様書 §11.5.4)
    "TC-03c": 91,
    "TC-04c": 92,
    "TC-04d": 93,
    "TC-05c": 94,
    "TC-05d": 95,
    "TC-06c": 96,
}


def get_sort_priority(sub_code: str) -> int:
    """sub_code に対応する sort_priority を返す。未登録は 999(最後尾)。"""
    return SORT_PRIORITY_MAP.get(sub_code, 999)
