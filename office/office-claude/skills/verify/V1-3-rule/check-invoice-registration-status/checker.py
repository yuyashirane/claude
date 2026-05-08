"""V1-3-20 β2-C Finding 変換層（テンプレートベース文言 + 8 フィールド raw）。

InvoiceCheckRow + Classification → InvoiceFinding への変換のみを担う。
判定ロジック（5 分類）は run.py 側の classify_transaction() に集約済み（β2-B 確定、不変）。
本モジュールは純粋関数のみ（I/O フリー）。

依存:
    - schema.py の InvoiceFinding / Classification
    - run.py の InvoiceCheckRow（型ヒント目的のみ）

公開 API（β2-C）:
    - to_finding(row, classification): 1 行変換
    - to_findings(rows, classifications): リスト変換、順序保持

公開 API ではない（モジュール内部）:
    - MESSAGE_TEMPLATES: 3 分類別文言テンプレート
    - _format_message: テンプレート差し込み
    - _build_raw: raw 8 フィールド組み立て

β2-B → β2-C 変更点:
    - to_finding(row) → to_finding(row, classification)
    - to_findings(rows) → to_findings(rows, classifications)
    - _format_message(row) → _format_message(row, classification)
    - raw 6 → 8 フィールド（_build_raw に切り出し、tax_code + is_qualified_invoice 追加）
    - β1 / β2-B の固定文言「インボイス未登録の可能性: ...」は廃止
    - 文言は MESSAGE_TEMPLATES + テンプレート差し込み方式に置換
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any


# ─────────────────────────────────────────────────────────────────────
# schema / run の解決（パッケージとしてもスタンドアロンでもロード可）
# ─────────────────────────────────────────────────────────────────────

_DIR = Path(__file__).resolve().parent


def _load_sibling(module_name: str, filename: str):
    """同階層の .py を sys.modules キャッシュ付きでロードする。"""
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, _DIR / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {filename}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


try:
    from .schema import Classification, InvoiceFinding  # type: ignore
    from .severity_map import to_common_severity  # type: ignore
except ImportError:
    _schema = _load_sibling("v1_3_20_invoice_schema", "schema.py")
    Classification = _schema.Classification  # type: ignore
    InvoiceFinding = _schema.InvoiceFinding  # type: ignore
    _severity_map_mod = _load_sibling("v1_3_20_severity_map", "severity_map.py")
    to_common_severity = _severity_map_mod.to_common_severity  # type: ignore


# ─────────────────────────────────────────────────────────────────────
# Classification → sub_code 番号の対応 (β2-E E3-b で導入)
# ─────────────────────────────────────────────────────────────────────

_CLASSIFICATION_TO_SUB_CODE: dict = {
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX:      "01",
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: "02",
    Classification.PARTNER_UNKNOWN:                     "03",
}
"""Classification (3 分類) を共通 Finding の sub_code 番号に変換するマップ。

V1-3-10 体系と統一するため番号制を採用。E3-b 確定。
"""


if TYPE_CHECKING:
    from .run import InvoiceCheckRow  # noqa: F401


# ─────────────────────────────────────────────────────────────────────
# MESSAGE_TEMPLATES（β2-C 確定、3 分類のみ）
# ─────────────────────────────────────────────────────────────────────

MESSAGE_TEMPLATES = {
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX: {
        "headline": "適格事業者ですが経過措置コード（{tax_label}）が使用されています",
        "action": "通常の課税仕入コードへの修正をご検討ください",
    },
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: {
        "headline": "非適格事業者ですが通常課税仕入（{tax_label}）として処理されています",
        "action": "経過措置コード（控80/控50）への修正をご検討ください",
    },
    Classification.PARTNER_UNKNOWN: {
        "headline": "取引先がマスタに登録されていない経過措置取引です",
        "action": "取引先マスタの整備と税区分の妥当性確認をお願いします",
    },
}
"""β2-C 確定の message テンプレート（設計メモ §1 論点 3）。

3 分類のみ定義する：
    - QUALIFIED_BUT_TRANSITIONAL_TAX
    - NONQUALIFIED_BUT_FULL_DEDUCTION_TAX
    - PARTNER_UNKNOWN

EXPECTED_TRANSITIONAL_TAX / EXPECTED_FULL_DEDUCTION_TAX / NONE は
Finding 化しないため定義不要（KeyError で「設計違反を検知」）。

末尾句点なし（GO 時の論点 0-4 確定、action 末尾「。」を付けない）。
"""


# ─────────────────────────────────────────────────────────────────────
# 公開 API
# ─────────────────────────────────────────────────────────────────────

def to_finding(row, classification):  # type: ignore[no-untyped-def]
    """1 件の InvoiceCheckRow + Classification を共通 Finding に変換する(β2-E E3-b)。

    InvoiceFinding は共通 Finding のエイリアス(schema.py で再エクスポート)。
    本関数は共通 Finding の必須属性 7 個 + V1-3-20 由来の Optional 属性を埋める。

    必須属性の対応:
        - tc_code         = "V1-3-20"
        - sub_code        = _CLASSIFICATION_TO_SUB_CODE[classification]  ("01"/"02"/"03")
        - severity        = "🟠 High" (V1320_SEVERITY_MAP 経由)
        - error_type      = "invoice_warning" (E3-pre で追加)
        - review_level    = "🟠 重点確認"
        - area            = "A14" (インボイス専用エリア)
        - sort_priority   = 30 (中優先度)

    raw 構造は β2-C 8 フィールドのまま維持(E3-c で解体予定)。

    Args:
        row: InvoiceCheckRow(β2 拡張、tax_code 含む)。
        classification: Classification(3 分類のいずれか)。
            EXPECTED_* / NONE が渡されると _format_message で KeyError。

    Returns:
        共通 Finding(InvoiceFinding エイリアス、severity="🟠 High"、
        classification は Enum.value 文字列、raw 8 フィールド)。

    Raises:
        KeyError: classification が MESSAGE_TEMPLATES または
                  _CLASSIFICATION_TO_SUB_CODE に未定義の場合
                  (EXPECTED_* / NONE が誤って渡された＝設計違反)。
    """
    return InvoiceFinding(
        # === 必須属性 (V1-3-10 由来) ===
        tc_code="V1-3-20",
        sub_code=_CLASSIFICATION_TO_SUB_CODE[classification],
        severity=to_common_severity("warning"),  # = "🟠 High"
        error_type="invoice_warning",
        review_level="🟠 重点確認",
        area="A14",
        sort_priority=30,
        # === Optional 属性 (V1-3-10 由来) ===
        wallet_txn_id=row.wallet_txn_id,
        message=_format_message(row, classification),
        current_value=row.tax_label,
        # === V1-3-20 由来の追加属性 (E1 で共通 Finding に追加済) ===
        classification=classification.value if classification else None,
        partner=row.partner,
        transaction_date=(
            row.transaction_date.isoformat()
            if row.transaction_date is not None
            else ""
        ),
        is_qualified_invoice=row.is_qualified_invoice,
        tax_code=row.tax_code,
        debit_amount=int(row.debit_amount),
        credit_amount=int(row.credit_amount),
        # === raw 構造は維持 (raw の完全解体は将来の別タスク) ===
        raw=_build_raw(row),
    )


def to_findings(rows, classifications):  # type: ignore[no-untyped-def]
    """rows と classifications のペアから InvoiceFinding を生成する（β2-C）。

    rows と classifications は同じ長さで、対応する行ごとに 1:1 対応する前提。
    呼び出し側（run.py）で 3 分類のみフィルタ済みのリストを渡す責務を持つ。

    Args:
        rows: Finding 化対象の InvoiceCheckRow（3 分類のみ）
        classifications: 各 row に対応する Classification（3 分類のいずれか）

    Returns:
        InvoiceFinding のリスト（順序は入力順を保持、空リスト入力は空リスト）。

    Raises:
        ValueError: rows と classifications の長さが一致しない場合。
        KeyError: classification が MESSAGE_TEMPLATES に未定義の場合
                  （_format_message から伝播）。
    """
    if len(rows) != len(classifications):
        raise ValueError(
            f"rows ({len(rows)}) and classifications ({len(classifications)}) "
            f"must have the same length"
        )
    return [to_finding(r, c) for r, c in zip(rows, classifications)]


# ─────────────────────────────────────────────────────────────────────
# 内部ヘルパ
# ─────────────────────────────────────────────────────────────────────

def _format_message(row, classification) -> str:  # type: ignore[no-untyped-def]
    """β2-C: classification ベースのテンプレート文言生成。

    共通構造:
        {見出し}: {取引先} / {税区分} / 借方 {金額} 円。{修正アクション}

    末尾句点なし（GO 論点 0-4 確定）。
    partner が空の場合は全分類で「取引先不明」と表示する（X2-α、例外処理なし）。

    Args:
        row: InvoiceCheckRow（β2 拡張版）
        classification: 分類結果（3 分類のいずれか）

    Returns:
        テンプレート差し込み済みの message 文字列。

    Raises:
        KeyError: classification が MESSAGE_TEMPLATES に未定義の場合（設計違反）。
    """
    template = MESSAGE_TEMPLATES[classification]  # KeyError は設計違反として伝播
    headline = template["headline"].format(tax_label=row.tax_label)
    action = template["action"]
    partner_display = row.partner if row.partner else "取引先不明"
    amount_display = f"{int(row.debit_amount):,}"
    return (
        f"{headline}: {partner_display} / {row.tax_label} / "
        f"借方 {amount_display} 円。{action}"
    )


def _build_raw(row) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    """InvoiceCheckRow から raw dict を組み立てる（β2-C 8 フィールド化）。

    β1/β2-B 6 フィールド → β2-C 8 フィールド：
        既存 6: tax_label, debit_amount, partner, description, transaction_date, source
        追加 2: tax_code, is_qualified_invoice

    transaction_date は実装指示書 §5.2 A-6 仕様通り、None のとき空文字 ""（GO v2 論点 0-3 確定）。
    β1 / β2-B では None だったが β2-C で破壊的変更（JSON 型安定性 + Excel 表示の理由）。
    Finding.classification は判定結果のため raw に含めない（DRY 原則）。
    """
    return {
        "tax_label": row.tax_label,
        "tax_code": row.tax_code,
        "debit_amount": str(row.debit_amount),
        "partner": row.partner,
        "description": row.description,
        "transaction_date": (
            row.transaction_date.isoformat()
            if row.transaction_date is not None
            else ""
        ),
        "source": "deal",
        "is_qualified_invoice": row.is_qualified_invoice,
    }


__all__ = ["to_findings", "MESSAGE_TEMPLATES"]
