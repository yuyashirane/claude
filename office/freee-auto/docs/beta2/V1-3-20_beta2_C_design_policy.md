# V1-3-20 β2-C 設計メモ（β2-C 設計フェーズ成果物）

**作成日**: 2026-04-28
**位置づけ**: β2-C（Finding/FindingGroup 整備）の設計判断確定文書。β2-C 実装指示書の引用元。
**前提**: β2-A 完結 + β2-B 完結 + β2-C 設計フェーズ（本セッション）完了

---

## §0. このメモの目的

β2-C 実装フェーズ着手前に、6 論点の設計判断を**この時点ですべて確定**させる。

このメモは：

- ✅ β2-C 設計判断を確定する設計書（β2-A メモと同形式）
- ✅ β2-C 実装指示書の引用元
- ❌ 実装指示書ではない
- ❌ Claude Code に直接渡すプロンプトではない

β2-C 実装指示書は、次セッションで別途作成する。

---

## §1. β2-C の 6 論点と確定事項

### 論点 1：Finding に classification を組み込むか

**確定**: 案 B（Optional フィールド追加）

#### スキーマ変更

```python
@dataclass(frozen=True)
class InvoiceFinding:
    severity: str
    message: str
    wallet_txn_id: str
    classification: Classification | None = None  # ← β2-C で追加
    rule_code: str = "V1-3-20"
    raw: dict[str, Any] = field(default_factory=dict)
```

#### 確定根拠

- **β2-D / β2-E の実用性が高い**（IDE 補完、型チェック、集計の容易さ）
- **V1-3-10 統合余地を残す**（V1-3-10 は None のまま扱える）
- **A3 方針からの逸脱は最小**（必須化ではなく Optional）
- 案 A（必須化）は V1-3-10 改修を強制するため不採用
- 案 C（raw のみ）は β2-D / β2-E で実務利用が弱いため不採用

#### 方針文（β2-C 確定）

> InvoiceFinding には `classification: Classification | None = None` を追加する。
> V1-3-20 では Finding 化対象の 3 分類について必ず classification を設定する。
> V1-3-10 など他 Skill との将来統合時は None を許容する。

---

### 論点 2：raw に分類情報をどう残すか

**確定**: 案 X（控えめ拡張）

#### raw 構造の変更（β1 6 フィールド → β2-C 8 フィールド）

```json
{
  "tax_label": "課対仕入（控80）10%",
  "tax_code": 189,                     // ← β2-C で追加
  "debit_amount": "207000",
  "partner": "桟原知穂（インボイス未登録）",
  "description": "",
  "transaction_date": "2025-11-25",
  "source": "deal",
  "is_qualified_invoice": false        // ← β2-C で追加
}
```

#### 確定根拠

- **β2-D 観察に必要十分**な判定材料が揃う
- **監査トレーサビリティが強い**（実務スタッフが raw だけで判定根拠を確認可能）
- **YAGNI 寄り**（partner_id / credit_amount / is_amount_over_threshold は追加しない）
- **β2-A 論点 3 と整合**（partner_id / account_item は追加しないと確定済み）

#### Finding.classification と raw["classification"] の重複は避ける

- **Finding.classification = 判定結果**（Classification Enum）
- **raw = 判定材料 + 観察情報**（DRY 原則）

#### 方針文（β2-C 確定）

> Finding.classification は判定結果を表す。
> raw には判定材料として tax_code と is_qualified_invoice を追加する。
> raw に classification は重複保持しない。
> partner_id / account_item / 閾値判定結果は β2-C では追加しない。
> 必要になれば β2-D 以降で判断する。

---

### 論点 3：message 文言を classification 別にどこまで変えるか

**確定**: 案 X2 + 案 X2-α

#### 文言生成方式

**テンプレートベース + 分類別パラメータ**

```python
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
```

#### 共通構造

```
{見出し}: {取引先} / {税区分} / 借方 {金額} 円。{修正アクション}
```

例:
- `適格事業者ですが経過措置コード（課対仕入（控80）10%）が使用されています: 桟原知穂 / 課対仕入（控80）10% / 借方 207,000 円。通常の課税仕入コードへの修正をご検討ください。`

#### partner 空欄時の扱い

- **全分類で「取引先不明」と表示**（X2-α、例外処理なし）
- partner_unknown でも特殊扱いせず、テンプレート構造を統一
- raw["partner"] = "" との一貫性を保つ

#### 確定根拠

- **保守性高い**（1 関数 + テンプレート辞書）
- **文言の一貫性**（共通部分の再利用）
- **「修正アクションを出す」設計思想と整合**
- **拡張性**（β3 で文言改善するときに 1 箇所変更）
- **β2-E Excel 表示で 1 行に収まる**（〜100 文字）

#### 方針文（β2-C 確定）

> message はテンプレートベースで生成する。
> 共通構造は「見出し: 取引先 / 税区分 / 借方金額。修正アクション」とする。
> 分類ごとに見出しと修正アクションを切り替える。
> partner が空の場合は、全分類で「取引先不明」と表示する。

---

### 論点 4：FindingGroup の単位と実装範囲

**確定**: 案 Q + 最小実装まで

#### FindingGroup 単位

**classification 単位**

```python
@dataclass(frozen=True)
class FindingGroup:
    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]
```

groups は 3 件（Finding 化対象 3 分類のみ）：
- qualified_but_transitional_tax
- nonqualified_but_full_deduction_tax
- partner_unknown

#### 実装範囲

**最小実装まで**

| 範囲 | 含むか |
|---|---|
| FindingGroup dataclass を作る | ✅ |
| classification 単位で group 化する | ✅ |
| JSON 出力に groups を含める | ✅ |
| 単体テストを書く | ✅ |
| Excel exporter | ❌ β3 |
| 親子行レイアウト | ❌ β2-E / β3 |
| severity 4 色帯 | ❌ β2-E / β3 |
| V1-3-10 との統合 | ❌ 持ち越し |

#### 確定根拠

- **V1-3-20 の主役は tax 分類**（β2 設計思想と完全整合）
- **修正アクションも classification ごとに変わる**
- **β2-D 観察で分類別に見やすい**
- **β2-E の Excel 設計につながる**
- 案 P（partner 単位）は partner_unknown が巨大グループになる、設計思想と矛盾
- 案 R（partner × classification）はグループ意味が薄れる
- 案 S（フラット維持）は β2-E で戻り作業のリスク

#### 方針文（β2-C 確定）

> V1-3-20 の FindingGroup は classification 単位で作る。
> partner 単位ではなく、tax 分類を主軸に集約する。
> β2-C では FindingGroup の最小実装まで行い、Excel 表示ロジックは β2-E / β3 に送る。

---

### 論点 5：expected_* の 2 分類は FindingGroup に含めるか

**確定**: 案 α（含めない）

#### 対象範囲

| 分類 | FindingGroup | classification_counts |
|---|---|---|
| qualified_but_transitional_tax | ✅ 含める | ✅ 集計 |
| nonqualified_but_full_deduction_tax | ✅ 含める | ✅ 集計 |
| partner_unknown | ✅ 含める | ✅ 集計 |
| expected_transitional_tax | ❌ 含めない | ✅ 集計 |
| expected_full_deduction_tax | ❌ 含めない | ✅ 集計 |
| none | ❌ 含めない | ✅ 集計 |

#### 確定根拠

- **groups の意味を「対応が必要な指摘グループ」に統一**できる
- **expected_* は正常確認**であり、実務スタッフが通常見る対象ではない
- **β2-A の「Finding 化しない」方針と整合**
- 必要になれば β2-D で観察用出力として別途追加できる
- 案 β（含める）は JSON サイズ膨張、Finding 化方針との整合性曖昧
- 案 γ（count のみ）は「count あって findings 空」が不自然

#### 方針文（β2-C 確定）

> FindingGroup は、Finding 化対象の 3 分類のみを対象とする。
> expected_transitional_tax / expected_full_deduction_tax は FindingGroup に含めない。
> これらは classification_counts による集計対象に留める。
> expected_* の個別観察が必要になった場合は、β2-D で別途観察用出力として扱う。

---

### 論点 6：β2-D 観察フェーズへの出力項目

**確定**: 案 R3 + 最小

#### observations セクションの追加

```json
"observations": {
  "partner_unknown_breakdown": {
    "absorbed_into_nonqualified": 2,
    "remaining_partner_unknown": 0
  }
}
```

#### 集計の定義

- **absorbed_into_nonqualified**: partner 空文字 × 通常課税仕入 × 20 万以上 → `nonqualified_but_full_deduction_tax` に推定吸収された件数
- **remaining_partner_unknown**: 単独の `partner_unknown` 分類件数（partner 空文字 × 経過措置 × 20 万以上）

#### 確定根拠

- **解釈 X（推定吸収）の可視化に直結**
- **β2 設計思想の核心を確認できる**（「partner_unknown は補助情報、tax 分類が主役」）
- code_108_count などは β2-D で必要なら追加判断
- observations を肥大化させない（YAGNI 寄り）
- 案 R1（β2-C で何もしない）は β2-D 着手時の負荷が高い
- 案 R2（フル集計）は YAGNI 違反、スコープ膨張
- 案 R4（CLI フラグ）は不要な複雑化

#### 方針文（β2-C 確定）

> β2-C では observations を最小限追加する。
> 対象は partner_unknown_breakdown のみとする。
> これは Q3'解釈 X（partner 不明を止めずに推定吸収する）の影響を観察するための集計である。
> その他の観察項目（code=108、tax_code 分布、partner 分布など）は β2-D で必要に応じて追加判断する。

---

## §2. β2-C 完結時の JSON 出力構造（最終形）

論点 1〜6 確定を踏まえた、β2-C 完結時の最終 JSON 出力：

```json
{
  "status": "ok",
  "exit_code": 0,
  "company_id": 3525430,
  "mode": "target_month_cumulative",
  "period_start": "2025-04-01",
  "period_end": "2025-12-31",
  "target_month": "2025-12",
  "single_month": false,
  "rule_code": "V1-3-20",
  "scope": {"deals": true, "manual_journals": false},
  "classification_counts": {
    "qualified_but_transitional_tax": 0,
    "nonqualified_but_full_deduction_tax": 2,
    "partner_unknown": 0,
    "expected_transitional_tax": 95,
    "expected_full_deduction_tax": 818,
    "none": 1149
  },
  "groups": [
    {
      "classification": "qualified_but_transitional_tax",
      "findings_count": 0,
      "findings": []
    },
    {
      "classification": "nonqualified_but_full_deduction_tax",
      "findings_count": 2,
      "findings": [
        {
          "severity": "warning",
          "rule_code": "V1-3-20",
          "classification": "nonqualified_but_full_deduction_tax",
          "message": "非適格事業者ですが通常課税仕入（課対仕入10%）として処理されています: 取引先不明 / 課対仕入10% / 借方 258,500 円。経過措置コード（控80/控50）への修正をご検討ください。",
          "wallet_txn_id": "3131570552-8534302832",
          "raw": {
            "tax_label": "課対仕入10%",
            "tax_code": 136,
            "debit_amount": "258500",
            "partner": "",
            "description": "（㈱すきなことでいきていく）",
            "transaction_date": "2025-11-03",
            "source": "deal",
            "is_qualified_invoice": false
          }
        }
      ]
    },
    {
      "classification": "partner_unknown",
      "findings_count": 0,
      "findings": []
    }
  ],
  "findings_count": 2,
  "observations": {
    "partner_unknown_breakdown": {
      "absorbed_into_nonqualified": 2,
      "remaining_partner_unknown": 0
    }
  }
}
```

---

## §3. β2 設計思想（β2-C で守る判断軸、再確認）

β2-A メモ §3 + β2-C で再確認した思想：

### 3.1 業務フロー観点

- レビューは「**同時に見る**」もの
- description に情報があるなら **判定を止めない**
- 実務上ほしいのは「**修正アクション**」
- partner_unknown は「例外」ではなく「**補助情報**」

### 3.2 一言まとめ

- **判定は止めない**
- **推定してでも前に進める**
- **修正アクションを出す**

### 3.3 実装思想

- **判定ロジックは「壊れないこと」を最優先**
- **責務分離を守る**（判定はシンプルに、検知は別でやる）
- **YAGNI 原則**

### 3.4 β2-C で再確認した思想

- **DRY 原則**（Finding.classification と raw["classification"] を重複させない）
- **テンプレートベースの一貫性**（message の保守性 / 拡張性）
- **classification 中心主義**（FindingGroup の単位、tax 分類が主役）

---

## §4. β2-C 実装フェーズ着手前の準備事項

β2-C 実装指示書を作る前に、以下を確認・準備しておく。

### 4.1 確定済み（β2-C 設計フェーズで確定）

- ✅ Finding スキーマへの classification 追加方式（Optional）
- ✅ raw 8 フィールド化（β1 6 + tax_code + is_qualified_invoice）
- ✅ message テンプレート構造（共通構造 + 分類別差分）
- ✅ partner 空欄時の表示方針（全分類「取引先不明」）
- ✅ FindingGroup 単位（classification）と実装範囲（最小実装）
- ✅ expected_* の扱い（FindingGroup に含めない）
- ✅ observations セクションの最小限内容（partner_unknown_breakdown のみ）

### 4.2 β2-C 実装フェーズで確定する持ち越し論点

- 🔄 message テンプレートの **具体的な日本語文言**（β2-C 実装指示書に草稿、Claude Code 実装で確定）
- 🔄 FindingGroup の dataclass フィールドの最終決定（classification + findings_count + findings の他に必要か）
- 🔄 main() で findings → groups への変換ロジックの位置（既存 main() 内 or 別関数）
- 🔄 既存テストの書き換え方針（TestExitZeroEndToEnd 等の出力構造変更対応）

### 4.3 β2-D で確定する持ち越し論点

- 🔄 manual_journals の必要性
- 🔄 observations の追加項目（code_108_count、tax_code 分布、partner 分布等）
- 🔄 474381 のデータ整備
- 🔄 件数妥当性の評価（β2-A メモ §4.3 持ち越し）

### 4.4 β2-E で確定する持ち越し論点

- 🔄 V1-3-10 レポートとの統合方式
- 🔄 親子行構造（FindingGroup を親、Finding を子）
- 🔄 Excel での severity 色分け
- 🔄 V1-3-20 固有列（classification、qualified_invoice_issuer 等）

---

## §5. β2-B から β2-C への変更点まとめ

β2-C 実装指示書を作る際の**差分確認用**。

### 削除されるもの（β2-C で）

なし。β2-B クラスタ A で β1 ロジックは削除済み。

### 追加されるもの

```python
# schema.py
@dataclass(frozen=True)
class FindingGroup:
    classification: Classification
    findings_count: int
    findings: list[InvoiceFinding]

# checker.py または run.py（実装位置は β2-C 実装指示書で決定）
MESSAGE_TEMPLATES = {
    Classification.QUALIFIED_BUT_TRANSITIONAL_TAX: { ... },
    Classification.NONQUALIFIED_BUT_FULL_DEDUCTION_TAX: { ... },
    Classification.PARTNER_UNKNOWN: { ... },
}

def _format_message_v2(row: InvoiceCheckRow, classification: Classification) -> str: ...
def find_groups(findings: list[InvoiceFinding]) -> list[FindingGroup]: ...
def _calculate_partner_unknown_breakdown(classified: list[tuple]) -> dict: ...
```

### 変更されるもの

```python
# schema.py
@dataclass(frozen=True)
class InvoiceFinding:
    # ... 既存 ...
    classification: Classification | None = None  # ← 追加

# checker.py の to_findings 系
def to_findings(rows: list[InvoiceCheckRow], classifications: list[Classification]) -> list[InvoiceFinding]:
    # row + classification ペアで Finding 生成
    ...

# run.py の main()
# 出力 JSON に "groups" キーと "observations" キーを追加
# raw に tax_code と is_qualified_invoice を追加
```

### 維持されるもの

```python
# 維持
Classification (Enum)  # β2-B クラスタ A で確定
TRANSITIONAL_TAX_CODES, FULL_DEDUCTION_TAX_CODES
classify_transaction()
classification_counts (Counter, setdefault 6 値)
EXIT_UNEXPECTED 経路（方針 3 不変条件チェック）
```

---

## §6. テスト戦略（β2-C 実装指示書作成時の指針）

### 6.1 既存テスト（β2-B 完結時 77 件）の影響予測

| テストクラス | 件数 | β2-C での扱い |
|---|---|---|
| TestInvoiceCheckContext | 4 | 不変 |
| TestCliArgValidation | 9 | 不変 |
| TestMissingFiles | 1 | 不変 |
| TestNormalizeDeals | 11 | **書き換え**（raw 8 フィールド化対応） |
| TestFindingConversion | 9 | **書き換え**（classification 追加対応） |
| TestExitZeroEndToEnd | 3 | **書き換え**（groups + observations 追加対応） |
| TestClassifyTransaction | 12 | 不変 |
| TestTransitionalTaxBoundary | 5 | 不変 |
| TestFullDeductionTaxBoundary | 8 | 不変 |
| TestInvoiceCheckRowTaxCode | 2 | 不変 |
| TestClassificationEnum | 1 | 不変 |
| TestBeta1RemovalCheck | 5 | 不変 |
| TestClassifyTransactionLegacyIntents | 7 | 不変 |

→ **書き換え対象は 23 件**（TestNormalizeDeals + TestFindingConversion + TestExitZeroEndToEnd）

### 6.2 新規追加すべきテスト

#### TestInvoiceFindingClassification（Finding スキーマ拡張）

- classification フィールドの基本動作
- None / Classification 値での生成

#### TestRawSchemaExtended（raw 拡張）

- raw に tax_code が含まれる
- raw に is_qualified_invoice が含まれる
- 既存 6 フィールドの保持

#### TestMessageTemplate（message 文言）

- 3 分類それぞれの message 生成
- partner 空欄時の「取引先不明」表示
- テンプレート差し込み（tax_label など）

#### TestFindingGroup（FindingGroup スキーマ）

- 3 分類の FindingGroup 生成
- findings_count と findings.length の整合
- expected_* / none が含まれないことの確認

#### TestFindGroups（find_groups 関数）

- findings → groups への変換
- 3 分類すべての groups が生成される（findings 0 件でも空配列で出力）
- 順序保証（qualified_but_transitional_tax → nonqualified_but_full_deduction_tax → partner_unknown）

#### TestObservations（observations 追加）

- partner_unknown_breakdown の集計
- absorbed_into_nonqualified の正確性
- remaining_partner_unknown の正確性

---

## §7. β2-C 完了状態（β2-C 設計フェーズの完了チェックリスト）

### 設計フェーズ完了チェック

- [x] 論点 1 確定（Finding に classification: Optional 追加）
- [x] 論点 2 確定（raw に tax_code + is_qualified_invoice 追加）
- [x] 論点 3 確定（テンプレートベース文言、X2-α）
- [x] 論点 4 確定（classification 単位、最小実装まで）
- [x] 論点 5 確定（expected_* は groups に含めない）
- [x] 論点 6 確定（observations.partner_unknown_breakdown のみ）
- [x] β2-C 完結時の JSON 出力構造の文書化
- [x] β2-B → β2-C 変更点まとめ
- [x] テスト戦略の指針

### β2-C 設計フェーズ成果物

このメモ自体（`V1-3-20_beta2_C_design_policy.md`）が β2-C 設計フェーズの成果物。

### 次のステップ

**β2-C 実装指示書の作成**（次セッション）→ Claude Code への GO → 実装 → 検証 → β2-C 完結。

---

## §8. β2-C 実装指示書への申し送り事項

β2-C 実装指示書を作成する際に**必ず引用する**べき内容：

1. **§1 論点 1**：Finding に `classification: Classification | None = None` 追加
2. **§1 論点 2**：raw に tax_code + is_qualified_invoice 追加（8 フィールド化）
3. **§1 論点 3**：テンプレートベース message + 共通構造 + partner 空時「取引先不明」
4. **§1 論点 4**：FindingGroup classification 単位 + 最小実装まで
5. **§1 論点 5**：expected_* は groups に含めない
6. **§1 論点 6**：observations.partner_unknown_breakdown のみ
7. **§2 β2-C 完結時の JSON 出力構造**
8. **§3 β2 設計思想**（特に DRY 原則、テンプレート一貫性、classification 中心主義）
9. **§5 β2-B → β2-C 変更点**
10. **§6 テスト戦略**（書き換え対象 23 件 + 新規追加）

---

## §9. 想定論点（β2-C 実装フェーズで観察）

β2-C 設計フェーズで議論した中で、**実装フェーズで判断すべき具体論点**：

### 9.1 message テンプレートの日本語文言の最終調整

§1 論点 3 で示した文言案は草稿。Claude Code が実装時に微調整する余地がある（漢字 / かな、敬体 / 常体、句読点）。**β2-C 実装指示書で文言を確定**して Claude Code に渡す。

### 9.2 _format_message_v2 の名前と置き場所

β1 / β2-B の `_format_message` をどう扱うか：

- 案 1：`_format_message` を β2-C 用に書き換え（既存名維持）
- 案 2：`_format_message_v2` 等の別名で追加、`_format_message` は段階的に廃止
- 案 3：`_format_message_by_classification` という明示的な名前

→ β2-C 実装指示書で確定。

### 9.3 to_findings の引数追加

`to_findings(rows: list[InvoiceCheckRow])` から `to_findings(rows, classifications)` に変える必要がある。これは **論理不可分性の事例 3 候補**として観察。

### 9.4 main() の出力構造変更

groups + observations を main() の出力 JSON に追加する。これも **論理不可分性の事例 4 候補**として観察。

---

## §10. 論理不可分性の観察軸（β2-C 継続）

K5 で確定した観察軸：

| 観察軸 | 想定 |
|---|---|
| **Finding schema 変更 ↔ checker.py** | classification 追加で `to_findings` の引数変更が必要 |
| **FindingGroup 新設 ↔ run.py 出力** | groups を JSON に含めるには main() 改修が必要 |
| **観察用出力 ↔ CLI JSON 構造** | observations セクション追加で test_exit_zero_end_to_end が壊れる |

→ β2-C 実装指示書で**クラスタ分割を慎重に設計**する必要。

---

## §11. このメモの位置づけ（再確認）

- ✅ β2-C 設計フェーズの最終成果物
- ✅ β2-C 実装指示書の引用元
- ✅ β2-D / β2-E でも参照される設計判断の根拠
- ❌ Claude Code に渡すプロンプトではない
- ❌ 実装指示書ではない

β2-C 実装指示書は次セッションで別途作成する。
