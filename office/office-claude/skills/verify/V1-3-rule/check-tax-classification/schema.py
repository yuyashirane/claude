"""V1-3-10 check-tax-classification の共通データスキーマ。

本ファイルは v1.2.2 §13.4.2 Finding スキーマ v0.2 を実装時の正とし、
Step 4-C 横断テーマ v0.2.1 第2章の型定義を採用する。
office-claude の全Skillで共通利用する6つのデータ構造を定義する:

    2.1 Finding           Skillが出力する検出結果のサマリ情報
    2.2 FindingDetail     Findingの詳細情報(根拠・推奨アクション・スナップショット)
    2.3 LinkHints         freee画面への導線ヒント(URLは含まない)
    2.4 CheckContext      Skill実行時に注入される環境情報(I/Oフリー化の核)
    2.5 TransactionRow    入力仕訳の正規形
    2.6 ReferenceBundle   references/JSON 辞書の束

設計原則(v1.2.2 §13.4.1):
    - P1  I/Oフリー原則: Skill 層は外部 API・DB を叩かない
    - P3  3軸独立: severity / error_type / review_level は別軸
    - P10 Skill本体は薄く保つ: schema / checker / checks / lib の責務分離
    - P12 決定的動作: frozen=True で不変性を保証し、再現性を担保

freeeリンク運用(v1.2.2 第12章 + §13.4.2):
    - 第12章: freeeリンクは必須の業務要件(総勘定元帳・仕訳帳の2系統)
    - §13.4.2: Finding 内の URL 文字列は optional、link_hints は必須
    - 正解: Skill 層は link_hints まで返す。URL 組み立ては Excel 層
      (将来の shared/freee-link-generator/)が担当する

本ファイルは Phase 1 で実装される。ReferenceBundle.load_for_skill / get は
Part 2 の finding_factory.py で差し替えられるまで NotImplementedError を投げる。

配置: skills/verify/V1-3-rule/check-tax-classification/schema.py
     (v1.2.2 §13.4.5 準拠)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal, Optional


# ─────────────────────────────────────────────────────────────────────
# 型エイリアス(Literal型による enum 相当の制約)
# ─────────────────────────────────────────────────────────────────────

Severity = Literal["🔴 High", "🟡 Medium", "🟠 Warning", "🟢 Low"]
"""severity の4段階。3軸独立の1つ目。"""

ErrorType = Literal["direct_error", "mild_warning", "gray_review", "reverse_suspect"]
"""error_type の4種類。3軸独立の2つ目。"""

ReviewLevel = Literal["🔴必修", "🟡判断", "🟠警戒", "🟢参考"]
"""review_level の4段階。3軸独立の3つ目。error_type から自動導出される。"""

LinkTarget = Literal["general_ledger", "journal", "deal_detail"]
"""freee画面の導線ターゲット。"""


# ─────────────────────────────────────────────────────────────────────
# 2.2 FindingDetail
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FindingDetail:
    """Finding の詳細情報(根拠・推奨アクション・スナップショット)。

    Finding 本体はサマリ情報のみを持ち、FindingDetail は人間がレビュー
    するために必要な根拠情報を保持する。Excel の詳細シートで展開される。

    Attributes:
        matched_rules: マッチしたルール名のリスト。
            例: ["salary_account × taxable_classification"]
        evidence: マッチした具体的な値の辞書。
            例: {"account": "給与手当", "tax_label": "課対仕入10%"}
        confidence_breakdown: confidence の内訳。
            例: {"account_match": 60, "tax_label_match": 30}
        recommended_actions: 推奨アクションのリスト(オプション)。
            例: ["税区分を「対象外」に変更"]
        related_law: 関連法令(オプション)。
            例: "消費税法 第2条第1項第8号"
        related_docs: 関連文書のリスト(オプション)。
            例: ["tax-classification.md R03", "GAS版 rules.gs R01-1"]
    """

    matched_rules: list[str] = field(default_factory=list)
    evidence: dict[str, str] = field(default_factory=dict)
    confidence_breakdown: dict[str, int] = field(default_factory=dict)
    recommended_actions: list[str] = field(default_factory=list)
    related_law: Optional[str] = None
    related_docs: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────
# 2.3 LinkHints
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class LinkHints:
    """freee 画面への導線ヒント。URLは含まず、意図のみを宣言する(P5)。

    v1.2.2 の運用:
        - 第12章: freeeリンクは必須の業務要件
        - §13.4.2: Finding 内の URL 文字列は optional、link_hints は必須
        - Skill 層は LinkHints まで返す。URL 組み立ては Excel 層が担当

    Skill 層は I/O フリー(P1)であり、URL を直接生成しない。
    LinkHints は「どの画面に、どのフィルタで飛ばしたいか」という意図のみを宣言する。
    URL 組み立ては Excel レポート層(将来の shared/freee-link-generator/)が
    LinkHints を読んで実行する。

    target 別の必須フィールド:
        general_ledger: account_name, period_start, period_end
        journal:        period_start, period_end
        deal_detail:    deal_id

    Attributes:
        target: リンクターゲット(general_ledger / journal / deal_detail)
        account_name: 勘定科目名(general_ledger 用)
        period_start: 期間開始(月単位が原則)
        period_end: 期間終了
        tax_group_codes: 税区分絞り込み(general_ledger 用、オプション)
        deal_id: freee の取引ID(deal_detail 用)
        fiscal_year_id: 会計期ID(全 target で共通)
        company_id: 会社ID(全 target で共通)
    """

    target: LinkTarget

    # ─── general_ledger 用 ───
    account_name: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    tax_group_codes: Optional[list[str]] = None

    # ─── deal_detail 用 ───
    deal_id: Optional[str] = None

    # ─── 全 target 共通 ───
    fiscal_year_id: Optional[str] = None
    company_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────
# 2.1 Finding
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Finding:
    """Skill が出力する検出結果のサマリ情報。

    v1.2.2 §13.4.2 Finding スキーマ v0.2 準拠(実装時の正)。
    1 Finding = 1検出結果(1仕訳に対する1つの指摘)。
    detail フィールドに FindingDetail(詳細情報)を持つ。

    3軸独立(P3):
        severity / error_type / review_level は別軸として扱い、無理に
        1対1対応させない。ただし finding_factory.create_finding() では
        error_type から review_level を自動導出する(デフォルト挙動)。

    決定的動作の保証(P12):
        frozen=True により生成後の変更を禁止。同じ入力に対して常に同じ
        Finding を返す。テスト時に Finding == Finding で完全一致比較可能。

    フィールド制約:
        tc_code:       正規表現 ^TC-0[1-8]$
        sub_code:      正規表現 ^TC-0[1-8][a-g]$
        severity:      Literal型で制約
        error_type:    同上
        review_level:  同上
        area:          正規表現 ^A(1[0-3]|[1-9])$
        sort_priority: 1〜99(必須、Step 4-C v0.2.1 で必須化)
        confidence:    0〜100
        note:          "tax_impact_negligible" または "defer_to_V1-3-XX" 形式

    freeeリンク:
        link_hints は必須(§13.4.2)、URL 文字列は持たない(第12章の業務要件は
        Excel 層で担保する)
    """

    # ─── 識別子 ───
    tc_code: str
    sub_code: str

    # ─── 3軸独立(P3) ───
    severity: Severity
    error_type: ErrorType
    review_level: ReviewLevel

    # ─── 表示制御 ───
    area: str
    sort_priority: int  # 必須。v0.2.1 でデフォルト値 50 を削除

    # ─── 検出内容 ───
    wallet_txn_id: str = ""
    current_value: str = ""
    suggested_value: str = ""
    confidence: int = 50
    message: str = ""

    # ─── 金額（Phase 6.11b） ───
    debit_amount: Optional[int] = None   # 借方金額（None = 不明 / 対象外）
    credit_amount: Optional[int] = None  # 貸方金額（同上）

    # ─── オプション(デフォルト値あり) ───
    subarea: Optional[str] = None
    show_by_default: bool = True
    deal_id: Optional[str] = None

    # ─── 構造化情報 ───
    link_hints: Optional[LinkHints] = None
    detail: Optional[FindingDetail] = None

    # ─── マーカー(P7, P8 / §13.4.4 notes マーカー) ───
    note: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────
# 2.5 TransactionRow
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TransactionRow:
    """仕訳1件の正規形。

    freee CSV、API レスポンス、手入力テストデータなど、入力ソースは複数ある。
    TransactionRow という正規形を定めることで、Skill 層はソースを意識せず
    判定に集中できる。

    借方/貸方の判定規約:
        is_debit  = debit_amount > 0 and credit_amount == 0
        is_credit = credit_amount > 0 and debit_amount == 0
        両方 > 0 は異常(精算仕訳等、本 Skill のスコープ外)
        判定は finding_factory.py の is_debit_side / is_credit_side で吸収

    Attributes:
        wallet_txn_id: 一意の取引ID(内部用、必須)
        deal_id: freee の deal_id(オプション)
        transaction_date: 取引日
        account: 勘定科目名
        tax_label: 税区分名
        partner: 取引先名
        description: 摘要
        debit_amount: 借方金額(Decimal、float は使わない)
        credit_amount: 貸方金額(Decimal、float は使わない)
        item: 品目(オプション)
        section: 部門(オプション、Phase C-1 クラスタ B 追加)
        memo_tag: メモタグ(オプション)
        notes: 備考(オプション)
        raw: CSVの元行など(デバッグ用、オプション)
    """

    # ─── 識別子(必須) ───
    wallet_txn_id: str

    # ─── 取引情報(デフォルト値ありは後ろに配置) ───
    deal_id: Optional[str] = None
    transaction_date: Optional[date] = None
    account: str = ""
    tax_label: str = ""
    partner: str = ""
    description: str = ""

    # ─── 金額 ───
    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")

    # ─── メタ情報(オプション) ───
    item: Optional[str] = None
    section: Optional[str] = None
    memo_tag: Optional[str] = None
    notes: Optional[str] = None

    # ─── 生データ参照(デバッグ用) ───
    raw: Optional[dict] = None


# ─────────────────────────────────────────────────────────────────────
# 2.6 ReferenceBundle
# ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ReferenceBundle:
    """references/JSON 辞書の束。

    Skill 本体のコードから JSON を直接読まず、この束を経由する。
    - 共通辞書(_common/references/)と Skill 固有辞書を統一的に扱う(P11)
    - JSON 読み込みを1箇所に集約してテスト容易性を確保(P1, P10)

    Phase 1 時点では load_for_skill / get の実装は NotImplementedError を
    投げる仮実装となっている。Part 2 の finding_factory.py(または専用の
    reference_loader 節)で実装される。

    Attributes:
        common: 共通辞書。例: {"severity-levels": {...}, "area-definitions": {...}}
        skill_specific: Skill固有辞書。例: {"payroll-accounts": {...}}
    """

    common: dict[str, dict] = field(default_factory=dict)
    skill_specific: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def load_for_skill(cls, skill_name: str) -> "ReferenceBundle":
        """Skill名から対応する全 references を読み込んで束にする。

        Args:
            skill_name: Skill名(例: "check-tax-classification")

        Returns:
            ロード済みの ReferenceBundle

        Raises:
            NotImplementedError: Part 1 時点では未実装。
                Part 2 の finding_factory.py で実装される。
        """
        raise NotImplementedError(
            "ReferenceBundle.load_for_skill is implemented in Part 2 "
            "(finding_factory.py). Phase 1 Part 1 では schema 定義のみ。"
        )

    def get(self, category: str, key: str) -> dict:
        """カテゴリとキーから辞書を取得する。

        Args:
            category: "common" または "skill_specific"
            key: ファイル名(拡張子なし)

        Returns:
            対応する dict

        Raises:
            NotImplementedError: Part 1 時点では未実装。
        """
        raise NotImplementedError(
            "ReferenceBundle.get is implemented in Part 2 "
            "(finding_factory.py). Phase 1 Part 1 では schema 定義のみ。"
        )


# ─────────────────────────────────────────────────────────────────────
# 2.4 CheckContext
# ─────────────────────────────────────────────────────────────────────
#
# ReferenceBundle を参照するため、ReferenceBundle より後に定義する。

@dataclass(frozen=True)
class CheckContext:
    """Skill 実行時に注入される環境情報。

    Skill 層はこの CheckContext を読むだけで外部 API を叩かない(P1)。
    これにより pytest で CheckContext をモック生成するだけで全 Skill を
    ユニットテスト可能になり、実行環境の差異(freee API / CSV / Fixture)を
    Skill 層に影響させない。

    Attributes:
        company_id: 会社ID(例: "2422271")
        fiscal_year_id: 会計期ID(例: "fy2026")
        period_start: 通常は期首
        period_end: 通常は期末
        transactions: 入力仕訳のリスト
        account_master: 勘定科目マスタ。
            例: {"給与手当": {"account_item_id": "123", "category": "expense"}}
        tax_code_master: 税区分マスタ(名称→コード)。
            例: {"課対仕入10%": "136"}
        partner_master: 取引先マスタ。
            例: {"〇〇不動産": {"partner_id": "456", "is_invoice_registered": True}}
        references: references/JSON の束
        skill_name: 呼び出し元 Skill 名(ログ用)
        debug_mode: デバッグモードフラグ
    """

    # ─── 会社・会計期情報(必須) ───
    company_id: str
    fiscal_year_id: str
    period_start: date
    period_end: date

    # ─── 入力データ ───
    transactions: list[TransactionRow] = field(default_factory=list)

    # ─── マスタデータ ───
    account_master: dict[str, dict] = field(default_factory=dict)
    tax_code_master: dict[str, str] = field(default_factory=dict)
    partner_master: dict[str, dict] = field(default_factory=dict)

    # ─── references/JSON の束 ───
    references: Optional[ReferenceBundle] = None

    # ─── メタ情報 ───
    company_name: str = ""   # 会社名（レポート表示用。Phase 6.11b で追加）
    skill_name: str = ""
    debug_mode: bool = False


# ─────────────────────────────────────────────────────────────────────
# __all__ (外部から import されるシンボル)
# ─────────────────────────────────────────────────────────────────────

__all__ = [
    # 型エイリアス
    "Severity",
    "ErrorType",
    "ReviewLevel",
    "LinkTarget",
    # dataclass
    "Finding",
    "FindingDetail",
    "LinkHints",
    "CheckContext",
    "TransactionRow",
    "ReferenceBundle",
]
