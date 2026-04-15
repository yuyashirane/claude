"""税区分コード判定ヘルパー。

Part 1 で配置した _common/references/ の JSON を読み込み、
税区分コードのカテゴリ判定を提供する。

出典: v1.2.2 §13.4.6 + Step 4-D 付録 §2.4
配置: skills/_common/lib/tax_code_helpers.py (§13.4.5 準拠)
"""
import json
from pathlib import Path

# ── JSON 読み込み（モジュール初期化時に1回だけ実行） ──

_REFS = Path(__file__).parent.parent / "references"

_TAX_CODE_NAMES: dict[int, str] = {
    int(k): v
    for k, v in json.loads(
        (_REFS / "tax-codes-master.json").read_text(encoding="utf-8")
    ).items()
}

_categories_raw: dict = json.loads(
    (_REFS / "tax-code-categories.json").read_text(encoding="utf-8")
)

TAXABLE_PURCHASE_CODES: frozenset[int] = frozenset(
    _categories_raw["taxable_purchase"]["codes"]
)
REDUCED_PURCHASE_CODES: frozenset[int] = frozenset(
    _categories_raw["reduced_purchase"]["codes"]
)
STANDARD_PURCHASE_10_CODES: frozenset[int] = frozenset(
    _categories_raw["standard_purchase_10"]["codes"]
)
NON_TAXABLE_PURCHASE_CODES: frozenset[int] = frozenset(
    _categories_raw["non_taxable_purchase"]["codes"]
)
TAXABLE_SALES_CODES: frozenset[int] = frozenset(
    _categories_raw["taxable_sales"]["codes"]
)
STANDARD_TAXABLE_SALES_CODES: frozenset[int] = frozenset(
    _categories_raw["standard_taxable_sales"]["codes"]
)
REDUCED_TAXABLE_SALES_CODES: frozenset[int] = frozenset(
    _categories_raw["reduced_taxable_sales"]["codes"]
)
EXPORT_SALES_CODES: frozenset[int] = frozenset(
    _categories_raw["export_sales"]["codes"]
)
NON_TAXABLE_SALES_CODES: frozenset[int] = frozenset(
    _categories_raw["non_taxable_sales"]["codes"]
)
NON_SUBJECT_CODE: int = _categories_raw["non_subject"]["codes"][0]  # 2


# ── 11 関数 ──

def is_taxable_purchase(code: int) -> bool:
    """課税仕入系か判定する。codes: [34, 108, 136, 183-190]"""
    return code in TAXABLE_PURCHASE_CODES

def is_reduced_purchase(code: int) -> bool:
    """軽減税率仕入系か判定する。codes: [163, 187, 188]"""
    return code in REDUCED_PURCHASE_CODES

def is_standard_purchase_10(code: int) -> bool:
    """標準税率仕入10%か判定する。codes: [136, 189, 190]"""
    return code in STANDARD_PURCHASE_10_CODES

def is_non_taxable_purchase(code: int) -> bool:
    """非課税仕入か判定する。codes: [37]"""
    return code in NON_TAXABLE_PURCHASE_CODES

def is_taxable_sales(code: int) -> bool:
    """課税売上系(全体)か判定する。codes: [21, 101, 129, 156]"""
    return code in TAXABLE_SALES_CODES

def is_standard_taxable_sales(code: int) -> bool:
    """課税売上10%(標準)か判定する。codes: [21, 129]"""
    return code in STANDARD_TAXABLE_SALES_CODES

def is_reduced_taxable_sales(code: int) -> bool:
    """課税売上8%(軽減)か判定する。codes: [101, 156]"""
    return code in REDUCED_TAXABLE_SALES_CODES

def is_export_sales(code: int) -> bool:
    """輸出免税売上か判定する。codes: [22]"""
    return code in EXPORT_SALES_CODES

def is_non_taxable_sales(code: int) -> bool:
    """非課税売上か判定する。codes: [23]"""
    return code in NON_TAXABLE_SALES_CODES

def is_non_subject(code: int) -> bool:
    """対象外(不課税)か判定する。code: 2"""
    return code == NON_SUBJECT_CODE

def get_tax_label(code: int) -> str:
    """税区分コードから名称を返す。不明コードは 'tax_code_{code}' を返す。"""
    return _TAX_CODE_NAMES.get(code, f"tax_code_{code}")
