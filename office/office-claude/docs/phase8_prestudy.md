# Phase 8 予備調査レポート

**作成者**: Claude Code
**作成日**: 2026-04-19
**対象**: office-claude v1.0（299 tests green / Phase 7 完了）
**指示書**: 戦略 Claude「Phase 8 予備調査指示書」
**成果物制約**: 本ファイルのみ新規作成。既存コード・テスト・テンプレートは変更しない。
**所要時間実績**: 本文末尾の「完了報告」参照

---

## 目次

- [0. FindingGroup の責務定義（仮決定）](#0-findinggroup-の責務定義仮決定)
- [1. エグゼクティブサマリー](#1-エグゼクティブサマリー)
- [2. 現状問題の定量化](#2-現状問題の定量化)
- [3. FindingGroup スキーマ設計案](#3-findinggroup-スキーマ設計案)
- [4. severity 集約ルール](#4-severity-集約ルール)
- [5. 累計モデル化設計](#5-累計モデル化設計)
- [6. 両テーマの統合設計](#6-両テーマの統合設計)
  - [6.2 group_key 設計（K4 再評価版）](#62-group_key-の設計k4-再評価版)
  - [6.3 Excel 親子表現（E1 案）](#63-excel-出力の親子行表現)
  - [6.4 テンプレ駆動哲学の拡張（Named Style 方式）](#64-テンプレート駆動哲学の拡張named-style-方式)
- [7. 影響範囲と実装分割案（3 段階版）](#7-影響範囲と実装分割案)
- [8. GO/NO-GO 判断基準](#8-gonoーgo-判断基準)
- [9. Open Questions](#9-open-questions)
- [10. 戦略 Claude 宛ての質問リスト](#10-戦略-claude-宛ての質問リスト)
- [付録 A. 旧 5 段階サブ Phase 案（記録）](#付録-a-旧サブ-phase-5-段階分割案初期案記録用)

---

## 0. FindingGroup の責務定義（仮決定）

### 仮決定: **R3「両方（二層構造）」**

- checker は従来通り `List[Finding]` を返す（既存 299 tests を壊さない）。
- `_common/lib/finding_grouper.py`（新設）が `List[Finding] → List[FindingGroup]` の純粋変換を担う。
- Excel 出力層は `List[FindingGroup]` を受け取り、親子行として展開する。
- 将来の LEARN・Kintone 連携層も `FindingGroup` を第一級オブジェクトとして参照できる。

### 選定理由

| 軸 | R1（表示のみ） | R2（ロジック単位） | **R3（二層）** |
|----|--------------|-------------------|---------------|
| A. 既存コード影響 | ◎ excel層だけ | △ 全 checker 書き換え | ○ 層を 1 つ追加のみ |
| B. 既存テスト影響 | ◎ ほぼゼロ | △ 50〜100 本書き換え | ○ 新規テスト追加のみ |
| C. Excel 表現 | ○ | ○ | ○ |
| D. 累計モデル相性 | △ 集約結果がロジック層で使えない | ◎ | ◎ |
| E. 横展開性（V1-3-20/30/40 等） | △ Skill 横串で使えない | ○ | ◎ FindingGroup が Skill 間契約になる |

**決め手は A + E**。軸 A（既存影響最小）と軸 E（将来の Skill 横展開）を両立できる唯一の案が R3。R2 は将来性が高いが「Phase 8 で 299 tests の半分を触る」という規模は MVP リリース後の改修として大きすぎる。

### 採用しても残る懸念

1. **グルーピング層の設計責務が重い**。group_key 生成関数を誰が定義するか（TC 側 or grouper 側）の設計を慎重にする必要あり → セクション 3 の A 案で解決。
2. **「Finding だけ欲しい」消費者と「FindingGroup 経由で欲しい」消費者が混在する**。Phase 8.1 時点では Excel 層のみを FindingGroup 消費者にする（checker 既存テストは `run(ctx) -> List[Finding]` の契約維持）。
3. **LEARN 設計時に「grouper を通すべきか素の Finding を見るべきか」の混乱**が起こりうる → Phase 9 の LEARN 設計時に再整理。

### この選択が Phase 8 全体に与える影響

- セクション 3（スキーマ設計）は **案 A（コンポジション型）** が R3 と最も整合する。
- セクション 5（累計モデル）では fetch / checker / 集約 / 表示 の **4 層構造** で考える（3 層ではない）。
- セクション 7（実装分割）では Phase 8.1 で grouper 層新設、Phase 8.2 で Excel 層連携 という依存関係になる。

---

## 1. エグゼクティブサマリー

### 構造図（Phase 8 後の 4 層構造）

```
┌────────────────────────────────────────────┐
│ fetch 層（freee_fetch.py / freee_to_context.py） │
│   期首〜対象月末を取得（BS: 時点残高 / PL: 累計）    │
└──────────────┬─────────────────────────────┘
               │ ctx.transactions (累計)
               ▼
┌────────────────────────────────────────────┐
│ checker 層（checks/tc01_...〜tc07_...）          │
│   行ごとに Finding を生成（**既存ロジック維持**）    │
└──────────────┬─────────────────────────────┘
               │ List[Finding]
               ▼
┌────────────────────────────────────────────┐
│ grouping 層（_common/lib/finding_grouper.py）  ← Phase 8 新設 │
│   group_key でまとめて FindingGroup を生成           │
└──────────────┬─────────────────────────────┘
               │ List[FindingGroup]
               ▼
┌────────────────────────────────────────────┐
│ 表示層（excel_report/template_engine.py）      │
│   親行 + 子行インデントで展開                      │
└────────────────────────────────────────────┘
```

### 3 段落サマリー

**（1）何をやるか**: Phase 8 は 2 つの構造的課題を同時に解決する。課題 A「Finding がフラットに並んで読みづらい」は、checker と Excel の間に集約層（grouping 層）を新設し、`FindingGroup` をハブに据えて解決する。課題 B「単月モデルを本来の累計モデルへ戻す」は fetch 層の `fetch_deals` シグネチャ拡張と、checker 層の判定ロジックの累計耐性確認で解決する。両者は **同じ grouping 層を経由する** ことで噛み合う（累計で件数が爆発しても集約で親 1 行になる）。

**（2）どう進めるか**: Phase 8 を 5 つのサブ Phase に分割する（セクション 7 詳細）。最小リスクパスは「8.1: スキーマ導入 → 8.2: grouper 実装 → 8.3: Excel 親子行表現 → 8.4: 累計 fetch → 8.5: E2E 統合」。各サブ Phase は前段を壊さず独立にコミット可能。最初の 3 サブ Phase は累計モデルに触らずとも完結するため、累計化の検証で躓いても集約機能だけは MVP2.0 として提供可能。

**（3）リスクと判断材料**: 最大の懸念は **累計モデル化時の checker 判定ロジックの回帰**。単月前提で書かれた判定（例: TC-02 の「同月内で土地家賃が課税区分」）が累計データ上で誤検知を増やす恐れがある。セクション 5.2 の 3 段階分類（そのまま動く / 微修正 / 大改修）で各 TC を事前評価した結果、TC-01〜TC-07 すべて「そのまま動く」想定だが、E2E 検証で 1 件でも回帰が出たら Phase 8.4 を切り離して Phase 9 に延期する判断基準を用意する（セクション 8）。

---

## 2. 現状問題の定量化

### 2.1 A5 人件費シート（2025/12 単月）の現状

出発点データ: `data/e2e/3525430/202512/e2e_report_phase7_20260418_233438.xlsx` の「A5 人件費」シート。

| row | sub_code | 勘定科目 | 現税区分 | 推奨税区分 | 借方 |
|-----|----------|----------|----------|------------|------|
| 4   | TC-03c | 法定福利費 | 対象外 | 非課仕入 | 17,838 |
| 5   | TC-03c | 法定福利費 | 対象外 | 非課仕入 | 32,940 |
| 6   | TC-03c | 法定福利費 | 対象外 | 非課仕入 | 1,296 |

→ **同一 sub_code × 同一科目 × 同一税区分遷移が 3 行並んでいる**。社員別の社会保険会社負担が 3 仕訳に分解されている単月ケース。

### 2.2 累計化したときの行数爆発シミュレーション

**前提**: 過去月データは参照していない。2025/12 単月の構造から累計時の爆発率を **保守推定**。

爆発要因の分解:
- **定例支払系**（社保・地代家賃・賃借料・リース料・役員報酬・給与）: 毎月ほぼ同数発生 → **× 月数**（9 ヶ月で × 9）
- **非定例系**（補助金・保険金・一時的な租税公課）: 不定期発生 → **× 1〜2**
- **TC-07 福利厚生費**: 月 10〜30 件レベル → **× 月数**
- **TC-01 売上**: 顧客数 × 月数で爆発

| TC | 想定パターン | 2025/12 単月 Finding 数（推定） | 2025/4〜12 累計（推定） | 爆発率 |
|----|------------|------------------------------|---------------------|------|
| TC-01 売上 | 顧客別売上が毎月 → 月数倍 | 5〜10 | 50〜100 | × 10 |
| TC-02 土地・住宅家賃 | 月次の地代家賃で毎月同額 | 1〜3 | 10〜30 | × 9〜10 |
| TC-03 給与・社保 | 社員別社保分解で毎月 | **3**（実測） | **27〜40**（推定） | **× 9〜13** |
| TC-04 非課税収益 | 利息は月次・補助金は不定期 | 1〜2 | 3〜10 | × 3〜5 |
| TC-05 非課税費用 | 支払利息・保険料が月次 | 2〜5 | 15〜30 | × 7〜9 |
| TC-06 租税公課 | **混在パターン多**。印紙税・自動車税等は不定期、固定資産税・事業所税は期別 | 2〜8 | 10〜40 | **× 5〜10** |
| TC-07 福利厚生費 | 月次発生が多い。忘年会等は期別 | 10〜30 | 90〜250 | **× 9〜10** |

### 2.3 課題 A の緊急度評価

**累計化後は、集約なしで A5 シート単体で 30〜50 行、TC-07 の A6 想定シートで 100 行超**が現実的。スタッフが 1 行ずつレビューするのは非現実的。Phase 8 の **集約は累計化の前提条件** であり、後付けで足せるオプションではない。

**集約後の想定**（A5 人件費の累計推定 30 行の場合）:
- 親行 3 本（TC-03a 給与 × 1、TC-03b 社保課税誤り × 1、TC-03c 社保対象外 × 1）
- 子行 30 本（折りたたみ可能）
- → スタッフは 3 本の親行を見て判断、必要時のみ子行を展開

---

## 3. FindingGroup スキーマ設計案

### 3.1 三案の比較

#### 案 A: コンポジション型（FindingGroup が Finding を抱える）

```python
@dataclass(frozen=True)
class FindingGroup:
    group_key: str                # 例: "TC-03c|法定福利費|対象外→非課仕入"
    tc_code: str                  # 親行に表示
    sub_code: str                 # 親行に表示（全子が同じ sub_code を持つ前提）
    area: str
    severity: Severity            # 子の最大値（S1 ルール）
    summary: str                  # 親行の要約メッセージ
    count: int                    # len(findings)
    total_debit: Optional[int]    # 子の借方合計（None 許容）
    total_credit: Optional[int]
    findings: list[Finding]       # 子の明細
    sort_priority: int            # 子の最小値（最も目立つ sub を昇格）
```

#### 案 B: タグ方式（Finding に group_key を生やすだけ）

```python
@dataclass(frozen=True)
class Finding:
    # 既存フィールド
    ...
    # 追加
    group_key: Optional[str] = None
    is_group_header: bool = False  # 親行フラグ
```

Excel 層で `group_key` で GROUP BY し、親行は `is_group_header=True` の合成 Finding を挿入。

#### 案 C: 二層スキーマ（GroupSpec + Finding）

```python
@dataclass(frozen=True)
class GroupSpec:
    key: str
    aggregation_rules: dict[str, str]  # 例: {"severity": "max", "debit": "sum"}

# Finding は変更なし
# grouper 層が GroupSpec リストを受け取って FindingGroup を組む
```

### 3.2 評価表（共通 5 軸 + スキーマ固有軸）

| 軸 | 案 A | 案 B | 案 C |
|----|------|------|------|
| **A. 既存コード影響の少なさ** | ○ FindingGroup は追加のみ、Finding 不変 | △ Finding に 2 フィールド追加 → 全 Finding 生成箇所に影響 | ○ Finding 不変 |
| **B. テスト影響の少なさ** | ○ 既存 299 tests 変更不要 | △ Finding の等値比較テストが全部壊れる可能性 | ○ 299 tests 変更不要 |
| **C. Excel 表現のシンプルさ** | ◎ parent.findings でループ、直感的 | ○ GROUP BY ロジックが Excel 層に入り込む | ○ Excel は FindingGroup を受けるだけ |
| **D. 累計モデルとの相性** | ◎ total_debit が累計で意味を持つ | ○ 集計値は Excel 層でその都度計算 | ◎ |
| **E. 横展開性** | ◎ LEARN・Kintone で FindingGroup を第一級に扱える | ○ タグだけなので半端 | ◎ |
| **テンプレート駆動哲学との相性** | ◎ 親行テンプレ・子行テンプレの 2 スタイルで自然 | ○ | ○ |
| **auto-extract パターンとの整合** | ◎ `create_finding_group()` を finding_factory.py に追加するだけ | △ create_finding の既存引数が増える | ○ |
| **純粋関数設計（I/O フリー）の維持** | ◎ grouper は純粋関数 | ◎ | ◎ |

### 3.3 暫定ベスト案

- **選定案: A（コンポジション型）**
- **採用理由**: 軸 C・D・E がすべて ◎、軸 A・B も ○。R3 責務定義との噛み合わせも最高。grouper 層は「List[Finding] を受けて FindingGroup のリストを組む純粋関数」という明快な契約になる。Finding 自体を汚染しない点で案 B に勝り、GroupSpec という中間概念を増やさない点で案 C に勝る。
- **懸念点**:
  1. `FindingGroup.findings` が `list[Finding]`（mutable type）なので `frozen=True` でも内部変更できてしまう → `tuple[Finding, ...]` に変えるか、`frozen=True` + `__post_init__` で検証するかを本実装時に決定。
  2. 親行に表示する `summary` をどう決めるか（子 Finding の message を流用 or 独自生成 or テンプレート）。本レポートでは「子の最初の Finding.message をそのまま採用（count>1 なら "ほか N 件"）」を暫定案とするが、実データで読みやすさを検証する必要あり。

---

## 4. severity 集約ルール

### 4.1 四案の比較（実務視点）

| 案 | ルール | 実務的な読み | リスク |
|---|------|------------|------|
| **S1** | 子の最大 severity を昇格（🔴 > 🟡 > 🟠 > 🟢） | 「このグループに何かヤバいものがある？」に答える | 🟢 が 100 件混在してても見えなくなる |
| **S2** | 件数で決定（例: 10 件以上で重大） | 「この論点が多発している？」に答える | 1 件でも致命的な誤りが埋もれる |
| **S3** | 金額合計で決定（例: 100 万円超で重大） | 「この論点の影響額は？」に答える | 少額だが頻発する誤りが見えない |
| **S4** | ハイブリッド: max(子 severity, 件数ベース昇格, 金額ベース昇格) | 複数視点 | ルール複雑化、説明困難 |

### 4.2 暫定ベスト案

- **選定案: S1（最大 severity 昇格）** をベースに、**親行に件数と金額合計を併記**。
- **採用理由**:
  - 税理士の一次レビュー要求は「このグループに赤信号あり？」であり S1 が最適。
  - 件数と金額は **別フィールド** として親行に表示すれば S2/S3 の情報も失わない（`FindingGroup.count`, `FindingGroup.total_debit/credit`）。severity に畳み込まなくても Excel で列として見える。
  - 「重み付きルール S4 は説明困難」という実務上の判断。スタッフに「なぜこのグループが赤なの？」と聞かれたとき、S1 なら「子に 1 件赤があるから」で説明完了。
- **懸念点**: 🟢 のみ 100 件のグループが存在する場合、親行も 🟢 になりサマリー上で埋もれる。→ Phase 8 時点では許容、Phase 9 で「件数サマリ色分け」を検討。

---

## 5. 累計モデル化設計

### 5.1 fetch 層の変更

#### 現状

```python
# freee_fetch.py / freee_to_context.py 系列
# Claude Code が month=202512 でデータを取得し、deals_202512.json に保存
# adapter が月次 JSON を読んで CheckContext(period_start=月初, period_end=月末) を組む
```

#### 累計化後

期間モードを **3 パターン** サポート:

| モード | period_start | period_end | 用途 |
|------|-------------|-----------|-----|
| `monthly`（現状互換） | 対象月の月初 | 対象月の月末 | 単月精査 |
| `ytd`（累計、新規デフォルト） | **期首** | 対象月の月末 | 月次・決算レビュー |
| `custom` | 任意 | 任意 | 特定期間の精査 |

#### fetch 層の変更規模

- **freee_fetch.py**: 変更ほぼなし。ページネーション統合ロジックはそのまま。保存ファイル名だけ `deals_202512.json` → `deals_2025-04_2025-12.json` のような期間表現に変更（または `deals_ytd_202512.json`）。
- **freee_to_context.py**: 期間モード引数を adapter に追加。`period_start` を「対象月の月初」から「期首」に切り替え。会計期 ID から期首を逆引きするため `company_info.json` の `fiscal_year_start` を参照する必要あり（すでに保存済み）。
- **BS 勘定 vs PL 勘定**:
  - PL 勘定（売上・費用）: 累計で取得が正（memories #6 原則）。
  - BS 勘定（現金・売掛金・土地・建物）: 時点残高で取得。ただし **本 Skill（V1-3-10 税区分）は PL 勘定のみを判定対象とする**ため、Phase 8 スコープでは BS の特別扱いは不要。将来の V1-3-50（BS 勘定チェック）で扱う。

### 5.2 checker 層への影響（各 TC の累計耐性評価）

各 checker の判定ロジックが累計データで **そのまま動く / 微修正 / 大改修** の 3 段階で分類。

| TC | サブ | 判定ロジック | 累計での挙動 | 分類 |
|----|-----|------------|-----------|-----|
| TC-01 | a〜c | 売上科目 × 課税区分判定 | 行単位判定なので月が増えても同じ | **そのまま** |
| TC-02 | a〜c | 地代家賃 × 土地/住宅家賃判定（KW） | 行単位、月依存なし | **そのまま** |
| TC-03 | a | 給与 × 課税区分 | 行単位、月依存なし | **そのまま** |
| TC-03 | b/c | 法定福利費 × 課税区分 | 行単位、月依存なし | **そのまま** |
| TC-04 | a〜d | 非課税収益科目 × 課税区分 | 行単位 | **そのまま** |
| TC-05 | a〜d | 非課税費用科目 × 課税区分 | 行単位 | **そのまま** |
| TC-06 | a〜e | 租税公課 × 課税区分 × 例外 KW | 行単位、月依存なし | **そのまま** |
| TC-07 | a〜g | 福利厚生 × KW 優先順位ディスパッチ | 行単位 | **そのまま** |

**結論**: 全 TC が「行単位判定・月境界に依存しない」設計のため、累計データが来ても判定ロジック自体は書き換え不要。**爆発するのは行数だけ**。

### 5.3 表示層の変更

#### format_target_month → format_target_period へ

```python
# 現状（template_engine.py:119-137）
def format_target_month(yyyymm: str) -> str:
    # '202512' → '2025年12月'

# 追加
def format_target_period(
    period_start: date,
    period_end: date,
    mode: str = "ytd",
) -> str:
    # mode="ytd":     '2025年4月〜2025年12月'
    # mode="monthly": '2025年12月'
    # mode="custom":  '2025年10月1日〜2025年12月31日'
```

- 既存 `format_target_month` は後方互換のため残す（Phase 8.1〜8.3 では既存テスト破壊ゼロ）。
- 本呼び出し側を段階的に `format_target_period` に置き換え（Phase 8.4）。

#### Excel メタ情報の変更点

- サマリーシート B4（対象月）: "2025年4月〜2025年12月" を許容できる列幅調整が必要な可能性。テンプレート変更範囲外であれば現状セル幅で収まるか要確認。
- 詳細シート H 列「取引日」: 現状は単月内なので日付のみ。累計だと月日が重要になるが、既存フォーマット `YYYY/MM/DD` のまま問題なし。

### 5.4 期間解釈の 3 パターン設計

```python
@dataclass(frozen=True)
class CheckContext:
    # 既存フィールド
    ...
    # Phase 8 追加
    period_mode: Literal["monthly", "ytd", "custom"] = "monthly"  # 後方互換デフォルト
```

- デフォルトは `monthly`（Phase 8.4 切替直前まで既存挙動維持）。
- Phase 8.5 で `ytd` をデフォルトに変更。
- CLI / E2E スクリプトで `--mode ytd|monthly|custom` で切り替え。

---

## 6. 両テーマの統合設計

### 6.1 累計 × 集約のデータフロー（擬似コード）

```python
# 1. fetch
ctx = build_context_from_json(
    company_id=3525430,
    period_start=date(2025, 4, 1),  # 期首
    period_end=date(2025, 12, 31),   # 対象月末
    period_mode="ytd",
)
# ctx.transactions に期首〜対象月末までの全明細が入る

# 2. checker（既存、変更なし）
findings = run(ctx)  # List[Finding]、累計で 30 行 → 300 行に爆発

# 3. grouping（Phase 8 新設）
from skills._common.lib.finding_grouper import group_findings
groups = group_findings(findings)  # List[FindingGroup]、親行 10 本に集約

# 4. Excel 出力（Phase 8 で親子行対応）
from skills.export.excel_report.template_engine import build_output
build_output(
    groups=groups,            # Phase 8 で groups 引数を追加
    findings=findings,        # 後方互換のため残す（どちらか片方を指定）
    output_path=...,
    company_name=...,
    period_start=..., period_end=..., period_mode="ytd",
)
```

### 6.2 group_key の設計（K4 再評価版）

> **Note**: 初版では K1 を暫定ベストとしたが、戦略 Claude レビューで「TC-06 の混在検出パターンを K1 は扱えない」と指摘を受け、K1/K2/K4 で再評価した（K3 の partner 案は本シナリオでは意味を持たないため除外）。

#### 6.2.1 検出パターンは 2 種類ある

同じ「勘定科目に対する税区分指摘」でも、親行に載せたい意図が 2 通り存在する。

**パターン A: 単一方向の誤り型**
- 意図: 「この科目の X 件すべてを Y に直したい」（全員が同じ方向に間違い）
- 例: TC-03c（法定福利費・対象外 → 非課仕入、全員同じ遷移）
- A5 人件費の 3 行（すべて `対象外 → 非課仕入`）はこのパターン
- 親行表現: 「法定福利費 対象外→非課仕入 3 件 計 52,074」

**パターン B: 混在検出型**
- 意図: 「この科目に税区分が混在している」（何が正しいかは別論点、まず混在自体を指摘したい）
- 例: TC-06 租税公課で「印紙税は対象外が正、自動車税も対象外が正」のように正解税区分が同じでも、元帳上は「対象外」「課対仕入 10%」「非課仕入」が混在している状況
- 現実: 悠皓さんの気づき #4 の本来の問題意識は「支払手数料という 1 つの科目に税区分が混在」という **混在自体を 1 つの親行** で出したい
- 親行表現: 「支払手数料 税区分混在 8 件（対象外 3 / 課対 4 / 非課仕 1）」

K1 は `current_tax` がキーに含まれるため、パターン B では **1 つの混在指摘が複数グループに分裂** する（科目単位で 1 親行にしたいのに、現在税区分ごとに 3 親行に割れる）。

#### 6.2.2 K4 設計: TC 別の group_key 戦略

```python
# _common/lib/finding_grouper.py
from typing import Callable

GroupKeyFn = Callable[["Finding"], str]

# TC（または sub_code）ごとに group_key 生成関数を登録する辞書
GROUP_KEY_STRATEGIES: dict[str, GroupKeyFn] = {
    # パターン A: 単一方向誤り型
    "TC-01":  lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-03a": lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-03b": lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-03c": lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-04":  lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-05":  lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    # パターン B: 混在検出型
    "TC-06":  lambda f: f"{f.sub_code}|{f.area}|{f.account()}",
    # TC-07 は sub_code で分岐（a〜g のうち一部は A、一部は B）
    "TC-07a": lambda f: f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}",
    "TC-07b": lambda f: f"{f.sub_code}|{f.area}|{f.account()}",
    # ... 以下 TC-07 は sub_code 単位で個別定義
}

def _default_group_key(f) -> str:
    """戦略未登録時のフォールバック（K1 相当）。"""
    return f"{f.sub_code}|{f.area}|{f.account()}|{f.current_value}|{f.suggested_value}"

def compute_group_key(f) -> str:
    """Finding から group_key を計算する。
    sub_code → tc_code の順で strategy を探索し、なければデフォルト。
    """
    fn = GROUP_KEY_STRATEGIES.get(f.sub_code) \
         or GROUP_KEY_STRATEGIES.get(f.tc_code) \
         or _default_group_key
    return fn(f)
```

**注記**:
- `f.account()` は `link_hints.account_name` を参照するヘルパー（現状 `_account_name` 関数が template_engine.py にあるロジック）を grouper 側にも用意する想定。
- 混在検出型（K2 形式）を選んだ場合、子行の `current_value` が異なるため「親行は科目、子行は行ごとの税区分」という Excel 表現になる。セクション 6.3 の E1 案と整合。

#### 6.2.3 K1 / K2 / K4 の再評価表（共通 5 軸）

| 軸 | K1（一律・税区分含む） | K2（一律・税区分除く） | **K4（TC 別戦略）** |
|----|------------------------|------------------------|------------------|
| **A. 既存コード影響** | ◎ 既存 Finding 不変、grouper は単一関数 | ◎ 同上 | ○ 同上 + strategy 辞書の初期定義コスト |
| **B. テスト影響** | ○ grouper テスト 1 パターン | ○ 同上 | △ grouper テストを TC パターンごとに書く必要（+5〜10 本） |
| **C. Excel 表現のシンプルさ** | △ TC-06 混在検出で親行が 3 本に割れる | △ TC-03c 等で税区分遷移情報が親行から落ちる | ◎ 各 TC の意図に合った親行表現ができる |
| **D. 累計モデルとの相性** | ◎ | ◎ | ◎ |
| **E. 横展開性（V1-3-20/30/40 等）** | △ 新 Skill でパターン B が必要なら破綻 | △ 新 Skill でパターン A が必要なら情報落ち | **◎** 新 Skill は strategy 辞書に関数を 1 つ登録するだけで拡張可能 |

#### 6.2.4 現行 TC-01〜TC-07 での最適戦略一覧

| TC / sub | 検出パターン | 最適戦略 | 理由 |
|----------|-------------|---------|------|
| TC-01a/b/c | 売上の税区分誤り | パターン A | 全員「課対 → 非課」「非課 → 課対」など方向が揃う |
| TC-02a/b/c | 土地・住宅家賃 | パターン A | 全員「課対 → 非課」方向 |
| TC-03a | 給与の課税 | パターン A | 全員「課対 → 対象外」 |
| TC-03b | 社保が課税 | パターン A | 全員「課対/課売 → 非課仕」 |
| TC-03c | 社保が対象外 | パターン A | 全員「対象外 → 非課仕」 |
| TC-04a〜d | 非課税収益 | パターン A | 全員「課対 → 非課 or 対象外」 |
| TC-05a〜d | 非課税費用 | パターン A | 全員「課対 → 非課 or 対象外」 |
| **TC-06a** | 租税公課が課税仕入 | **パターン B** | 混在検出が本来の意図（印紙税・自動車税・固定資産税が混在） |
| TC-06b | 法人税等が課税 | パターン A | 全員「課対 → 対象外」 |
| TC-06c | 租税公課が非課仕入 | パターン A | 全員「非課仕 → 対象外」の許容パターン |
| TC-06d | 軽油引取税 | パターン A | gray_review 単一パターン |
| TC-06e | ゴルフ場利用税 | パターン A | gray_review 単一パターン |
| TC-07a〜g | 福利厚生 | **混在**（KW で枝分かれしているため sub_code ごとに判断必要） | sub_code 単位で個別定義 |

#### 6.2.5 暫定ベスト案（確定）

- **選定案: K4（TC 別動的戦略）**
- **採用理由**:
  - **決め手は軸 E（横展開性）**。V1-3-20（地代家賃）・V1-3-40（源泉税）等の将来 Skill が加わる際、`GROUP_KEY_STRATEGIES` に関数を 1 つ登録するだけで拡張できる。K1/K2 は「全 TC に同じキー規約」を強制するため、新 Skill の検出パターンが従来と違う場合にスキーマ側の再設計が必要になる。
  - **軸 C（Excel 表現）**でも TC-06 混在検出を自然に表現できる唯一の案。悠皓さんの気づき #4 の本来意図（「支払手数料の税区分混在を 1 親行で見たい」）に直接応える。
  - 軸 A・B のコスト（strategy 辞書定義・TC 別テスト）は、初期 7 TC で 10 個前後の lambda 登録に収まり、テストも各 TC で 1〜2 件追加する程度で完結。許容範囲。
- **デメリット（明示）**:
  1. **TC ごとに関数を定義する実装コスト**: 現行 7 TC × sub 変種で約 10〜15 個の strategy を登録する必要。Phase 8-A で初期登録を一括実施。
  2. **strategy 辞書のメンテ性**: 新 sub_code 追加時に登録漏れするとデフォルト K1 で動く（壊れはしないが意図と違う集約になる）。→ `validate_strategies(known_sub_codes)` で未登録を警告する CI チェックを追加する案を Phase 8-A 内で検討。
  3. **strategy が副作用・例外を投げる可能性**: 関数として定義する以上、バリデーションが必要。grouper 側で `try/except` + フォールバックを実装。
- **懸念点（採用しても残るリスク）**:
  - パターン B（混在検出）の親行に `suggested_value` を表示できない（混在しているため）。→ 親行の推奨列は「混在 - 個別確認」と表記する運用ルールを Phase 8-B の Excel 表現で確定。
  - K4 の表現力が高い分、「なぜこの TC は混在型で、別の TC は方向型なのか」の判断を strategy 定義者が正しくできるかがレビュー観点になる。→ Phase 8-A の PR レビューで「strategy 登録表」を必ず添付するルールを運用で担保。
  - `Finding.account()` のようなヘルパーが Finding に存在しない（`link_hints.account_name` 経由）。strategy 関数の引数は Finding 本体か、正規化済み dict か、Phase 8-A 着手時に決定。

### 6.3 Excel 出力の親子行表現

#### 三案の比較

| 案 | 方式 | メリット | デメリット |
|---|-----|-------|--------|
| **E1** | 親行 + インデント子行（flat） | 実装が単純、テンプレートに親スタイル・子スタイルの 2 行を置く | 折りたたみできない |
| **E2** | 親行のみ + 別シート詳細 | サマリー性が高い | 2 シート間ジャンプが必要、UX 悪化 |
| **E3** | openpyxl の outline で折りたたみ | スタッフ体験最良（親だけ見る→必要時展開） | テンプレ駆動哲学との整合が要検討、outline level を何で決めるかルールが必要 |

#### 暫定ベスト案

- **選定案: E1（親行 + インデント子行）をベース、Phase 8 後のオプションとして E3（outline 折りたたみ）を別途検討**
- **採用理由**:
  - 軸 C（Excel 表現のシンプルさ）が最重要。E1 はスタッフに「このシートの読み方」を説明する際「親行は太字、子行は灰色インデント」と一言で済む。
  - 軸 A: テンプレート `TC_template.xlsx` に親スタイル行・子スタイル行のサンプル 2 行を置けば、`_extract_row_styles` の既存パターンで拾える。新しいテンプレ拡張哲学を作らない（§6.4 Named Style 方式で哲学内に収める）。
  - E3 の outline は優れているが、openpyxl の outline level 制御・折りたたみ初期状態・印刷時の挙動などに追加検証が必要。Phase 8 MVP には過剰。
- **懸念点**:
  - 親行と子行のスタイル定義をテンプレートに追加する必要があり、**テンプレート変更が発生する**。これは「哲学の例外」ではなく「哲学の拡張」として整理する（§6.4）。

---

### 6.4 テンプレート駆動哲学の拡張（Named Style 方式）

#### 6.4.1 位置付け: 「例外」ではなく「拡張」

Phase 8 の親子行スタイルは、**Phase 7 のハイパーリンク Font のような「Python 側実装の都合による例外」ではない**。Phase 7 の例外は、openpyxl が `hyperlink` を付ける際に Font をリセットする動作のため、Python 側で `Font(name="Meiryo UI", size=10, color="0563C1", underline="single")` を明示せざるを得なかった（実行時に動的に生成せざるを得ない制約）。

一方、Phase 8 の親子行スタイルは **テンプレート側で静的に定義可能** な情報である。したがって、次の方針で哲学内に収める:

> **テンプレートの責務を「レイアウトのみ」から「レイアウト + 論理的役割（親子）のスタイル定義」に拡張する。**
> Python は論理的役割の名前を指定するだけで、見た目はテンプレートが決める。

これにより、テンプレート駆動哲学を維持したまま表現力を増せる。

#### 6.4.2 Named Style 方式の設計

**基本方針**: 親子行のスタイルは **テンプレート側で Named Style として定義し、Python 側は style 名参照のみを行う**。

```python
# Python 側の実装イメージ（これが理想形）
def _write_group_rows(ws, group: FindingGroup, start_row: int) -> int:
    """親行 + 子行を書き込み、次の書き込み開始行を返す。"""
    # 親行
    parent_row = start_row
    parent_values = _build_parent_row_values(group)
    for col in range(1, _DET_TOTAL_COLS + 1):
        cell = ws.cell(parent_row, col)
        cell.value = parent_values.get(col, "")
        cell.style = "parent_row_style"  # ← テンプレで定義済みの名前を参照

    # 子行
    for i, finding in enumerate(group.findings, start=1):
        child_row = parent_row + i
        child_values = _build_child_row_values(finding)
        for col in range(1, _DET_TOTAL_COLS + 1):
            cell = ws.cell(child_row, col)
            cell.value = child_values.get(col, "")
            cell.style = "child_row_style"  # ← 同上

    return parent_row + 1 + len(group.findings)
```

**禁則事項（哲学遵守のため）**:
- ❌ Python 側で `Font(bold=True, ...)` のようにスタイルを構築する
- ❌ `styles.py` に新規スタイル定数を追加する
- ❌ Python 側で `PatternFill` / `Border` / `Alignment` を生成する

**許容される Python 側の動的処理**（哲学の範囲内として維持）:
- ✅ severity に応じた Named Style の選択（例: `parent_row_style_red` / `parent_row_style_yellow`）
- ✅ ハイパーリンク値の動的代入（Phase 7 の Font 例外はそのまま残す）

#### 6.4.3 テンプレート改修の要件

`TC_template.xlsx` に次の Named Style を追加する必要がある（**悠皓さん担当、Python 側実装とは独立**）:

| Named Style 名 | 用途 | 想定スタイル |
|---------------|------|------------|
| `parent_row_style` | 親行の基本スタイル | 背景色: 薄グレー / フォント: 太字 / 罫線: 上下太線 |
| `parent_row_style_red` | 親行（severity=🔴） | 背景色: ピンク（重大）/ フォント: 太字赤 |
| `parent_row_style_yellow` | 親行（severity=🟡 or 🟠） | 背景色: 黄（要注意）/ フォント: 太字黒 |
| `parent_row_style_green` | 親行（severity=🟢） | 背景色: 薄緑（要確認）/ フォント: 太字黒 |
| `child_row_style` | 子行 | 背景色: 白 / フォント: 通常 / インデント: 列 A に 2 レベル |

severity 別の色分けを親行にも反映するため、`parent_row_style_{red,yellow,green}` の 3 バリエーションを持つ。

#### 6.4.4 Named Style の動的複製検証計画

**懸念**: 過去セッションの備忘で「エリア別シートは動的複製される」点が指摘されている。`openpyxl.Workbook.copy_worksheet()` が Named Style を複製後も維持するかは **要検証**。

**検証方法**（Phase 8-A 着手時の事前実験、コード変更なしで実施可能）:

1. 手書き最小テンプレ `minimal_named_style_test.xlsx` に `parent_row_style` を 1 つ登録して 1 行使用。
2. `wb.copy_worksheet(ws)` で複製。
3. 複製シートのセルから `cell.style` 名が `parent_row_style` で取れるか確認。
4. 複製シートで `new_cell.style = "parent_row_style"` が動くか確認。
5. 保存 → 再読込後も Named Style 名が保持されるか確認。

**結果別の対応**:
- **ケース 1（Named Style が複製後も保持される）**: 理想形。§6.4.2 の実装そのまま。
- **ケース 2（複製で Named Style が消える / セル側の参照が切れる）**: fallback として、`build_output` 起動時に `wb.named_styles` を走査し、全シートで名前参照を再確認するヘルパーを Python 側に用意（純粋な文字列参照のみで、スタイル自体は Python が生成しない）。これは哲学内と見なす。
- **ケース 3（Named Style がワークブックレベルで消える）**: 哲学の逸脱なしに実装する方法がなくなる → §6.4.5 の Open Question に回帰。

#### 6.4.5 Named Style が動作しない場合の退避プラン

万が一 openpyxl の仕様で Named Style 方式が実現不可能と判明した場合、以下を Open Questions（§9 Q6）に追加:

- 退避案 1: **Python 側で Named Style を動的登録する**（`wb.add_named_style(NamedStyle(...))`）。スタイル定義は Python 側に置かざるを得ないが、シート書き込み時は `cell.style = "parent_row_style"` で名前参照のみ。**哲学に半分反する**（スタイル定義が Python 側に来る）。
- 退避案 2: **テンプレのサンプル 2 行をスタイル継承元として流用する**（現行 `_extract_row_styles` 方式の延長）。親行サンプル 1 行 + 子行サンプル 1 行を設置、Python が `copy()` して適用する。スタイル定義はテンプレ側に残せるが、Named Style の明示性は失う。

**戦略 Claude の判断が必要**: 退避案 1 と 2 のどちらが哲学に近いか、事前に合意しておきたい。

---

## 7. 影響範囲と実装分割案

### 7.1 影響ファイル表

| ファイル | 変更種別 | 影響度 | 推定テスト追加数 |
|----------|----------|--------|------------------|
| `schema.py` | 追加（FindingGroup） | 小 | +5（FindingGroup 単体） |
| `_common/lib/finding_grouper.py` | **新規** | 大 | +15（group_key 生成、集約、severity 昇格、空入力、K4 拡張点） |
| `_common/lib/finding_factory.py` | 追加（create_finding_group ヘルパー、任意） | 小 | +3 |
| `excel_report/template_engine.py` | 拡張（groups 引数対応、親子行描画） | 中 | +10（親子行レンダリング、空グループ、混在） |
| `excel_report/sheet_builder.py` | 拡張（グループ対応） | 中 | +5 |
| `scripts/e2e/freee_to_context.py` | 期間モード引数追加 | 中 | +4 |
| `scripts/e2e/freee_fetch.py` | 保存パス命名規則変更（任意） | 小 | +2 |
| `data/reports/template/TC_template.xlsx` | **親行・子行スタイル追加（Open Question）** | 中 | N/A |
| `checker.py` / `checks/tc0X_*.py` | **変更なし**（R3 責務定義） | なし | 0 |
| 既存 `tests/unit/test_tc0X.py` | **変更なし**（checker 出力は List[Finding] のまま） | なし | 0 |
| `tests/unit/test_excel_export.py` | groups 引数パスのテスト追加 | 中 | +8 |
| **合計（新規テスト追加）** | | | **約 +52 本** |

### 7.2 既存 299 tests への波及

- **checker 系（tc01〜tc07、約 180 本）**: **書き換えゼロ**。R3 責務定義により checker の契約 `run(ctx) -> List[Finding]` を維持するため。
- **Excel 系（test_excel_export.py、約 50 本）**: **書き換えゼロ（追加のみ）**。`build_output(findings=...)` の既存シグネチャを残し、`build_output(groups=...)` を追加する後方互換パスを用意する。ただし、内部で `build_output` が findings を受けたときに自動的に `group_findings` を呼んで groups を作る挙動に変えると既存テストのスナップショット（行数・行位置）が壊れる可能性があるため、**デフォルトは集約しない（旧動作）** として Phase 8.5 までに段階的に切り替え。
- **freee_link_generator 系（約 30 本）**: 影響なし。
- **E2E 系**: Phase 8.4 で期間モードを ytd に切り替えた瞬間、fixture が単月前提なら壊れる可能性あり。Phase 8.4 の中で fixture を期間対応に更新。

### 7.3 サブ Phase 分割案（3 段階版 / 確定）

> **Note**: 初版は 5 段階分割（Phase 8.1〜8.5）だったが、戦略 Claude レビューを経て以下の方針で 3 段階に圧縮した。旧 5 段階版は §付録 A に残す。
>
> - Phase 8 では `period_mode` のデフォルトを ytd に切り替えない（monthly 維持）。
> - 累計モデルは「実装可能状態」までを Phase 8 で完結、デフォルト切替は Phase 9 以降。
> - スキーマ導入と grouper 実装は同じ文脈のため 1 つの Phase にまとめる。
> - E2E 統合は各 Phase の出口タスクとして組み込む（独立 Phase 化しない）。

#### Phase 8-A: FindingGroup 導入 + group_key 戦略確定（目安 3〜5 日）

**目的**: grouping 層を完成させ、checker 出力から FindingGroup を機械的に作れる状態にする。Excel 層には **まだ繋がない**。

**スコープ**:
- `schema.py` に `FindingGroup`（案 A コンポジション型、frozen=True）を追加
- `_common/lib/finding_grouper.py` を新設
  - `compute_group_key(finding) -> str`（§6.2.2）
  - `group_findings(findings) -> List[FindingGroup]`
  - `GROUP_KEY_STRATEGIES` 辞書に TC-01〜TC-07 の初期 10〜15 戦略を登録
  - severity 昇格ロジック（S1）、件数・金額合計
  - strategy 未登録時のフォールバック（デフォルト K1）
- Named Style の事前検証実験（§6.4.4）を Phase 8-B 着手前に完了
- 単体テスト追加（推定 +18 本）
  - `test_finding_group.py`: スキーマ（+5 本）
  - `test_finding_grouper.py`: grouper 本体（+13 本、TC 別パターン含む）

**既存コードへの影響**:
- checker / 既存 Excel 出力・E2E に影響なし
- checker のテスト（約 180 本）は完全に無変更

**GO 条件**:
- 既存 299 tests 全 green
- 新規 +18 本 green
- A5 人件費の 3 行に `group_findings` を噛ませ、親行 1 本 / 子行 3 本にまとまることを手動確認（fixture 1 本）

**Phase 8-A の独立性**: この時点で Excel 層は何も変わらないため、Phase 8-A 完了だけでリリース可能（ただし人目には変化なし）。後続 Phase が失敗しても 8-A の成果は残る。

---

#### Phase 8-B: Excel 親子表示（目安 5〜8 日）

**目的**: FindingGroup を Excel に親子行として描画する。ここで初めてスタッフが Phase 8 の価値を体感できる。

**スコープ**:
- テンプレート `TC_template.xlsx` に Named Style を追加（悠皓さん担当、**Python 側タスクと並行**）
  - `parent_row_style`, `parent_row_style_{red,yellow,green}`, `child_row_style`（§6.4.3）
- `template_engine.build_output` に `groups: Optional[List[FindingGroup]] = None` 引数を追加
  - `groups` 指定時は親子行描画、未指定時は従来通り flat 描画（後方互換）
- `_fill_detail_sheet` を `_fill_detail_sheet_with_groups` に拡張
  - 親行生成（summary / count / total_debit / total_credit / 親 severity）
  - 子行生成（既存 `_write_finding_row` をそのまま流用、style だけ child に差し替え）
- `_fill_summary` のエリア別集計を group 単位に変更するか要検討（Phase 8-B 内で判断）
- Named Style が複製で失われる場合の fallback 実装（§6.4.5）
- 単体テスト追加（推定 +18 本）
  - `test_excel_export.py`: 親子行描画（+12 本）
  - Named Style 反映テスト（+3 本）
  - fallback 動作テスト（+3 本）

**既存コードへの影響**:
- 既存 `test_excel_export.py` の約 50 本は **基本的に無変更**（`build_output(findings=...)` のデフォルトパスを維持）
- ただし、サマリーシート集計ロジックを group ベースに変えた場合は test_excel_export.py のスナップショットテスト 2〜3 本が書き換え必要

**GO 条件**:
- 既存 299 tests 全 green（集計ロジック変更で微修正した場合は +2〜3 本、±0 を目指す）
- 新規 +18 本 green
- **定性基準**: アントレッド 2025/12 単月 E2E で A5 人件費シートの親行 ≤ 5 本、子行が折り畳みの代わりにインデントで視覚区別されていることを悠皓さんが目視確認

**NO-GO 時の代替**:
- Named Style 方式が実現不可能 → §6.4.5 の退避案 1 or 2 を採用
- テンプレ改修そのものが NG → E2 案（サマリー + 別シート）に切り替え。ただし現時点で Open Question Q1 で許容方向の合意あり

---

#### Phase 8-C: 累計モデル + ytd 実装可能状態（目安 3〜5 日）

**目的**: 累計モデル（期首〜対象月末）でデータ取得・処理・表示ができる状態を作る。**デフォルトは monthly のまま**、`--mode ytd` で切り替え可能にする。

**スコープ**:
- `CheckContext` に `period_mode: Literal["monthly", "ytd", "custom"] = "monthly"` を追加
- `freee_to_context.py` の adapter に `period_mode` 引数を伝播
- `freee_fetch.py` は現状維持（保存ファイル命名変更は任意、Phase 9 以降）
  - 期首〜対象月末を取得する場合、複数月の deals を統合する処理を adapter 側に追加
- `format_target_period(period_start, period_end, mode)` を template_engine に新設
  - `monthly` → 従来表記（後方互換）
  - `ytd` → "2025年4月〜2025年12月"
  - `custom` → "2025年10月1日〜2025年12月31日"
- CLI / E2E スクリプトに `--mode ytd|monthly|custom` を追加
- E2E スクリプト側で ytd モード時の deals 統合ロジックを実装（複数月 JSON をマージ）
- 単体テスト追加（推定 +8 本）
  - `test_common.py` / adapter テスト（+5 本）
  - `test_excel_export.py` の `format_target_period`（+3 本）

**既存コードへの影響**:
- 既存 `period_mode` 未指定のコードは自動的に `monthly` モードで動く（後方互換）
- checker / grouper / Excel 親子表示はすべて **行数が増えるだけで無変更**（§5.2 全 TC「そのまま」分類）

**GO 条件**:
- 既存 299 tests + Phase 8-A の +18 + Phase 8-B の +18 が全 green
- 新規 +8 本 green
- **E2E 手動検証**: アントレッド 2025/4〜2025/12 ytd モードで E2E 実行し、A5 人件費の親行 ≤ 5 本 / 子行 27〜40 本で Excel 出力できることを確認（集約なしなら読めないが集約ありで読めることの検証）
- **デフォルト切替はしない**: `period_mode="monthly"` がデフォルトのまま

**Phase 8-C の独立性**: 8-A / 8-B が完了していれば 8-C はオプション（やらなくてもスタッフは集約の恩恵を単月で受けられる）。ただし累計レビューの需要がある以上、同じ Phase 8 で提供しきるのが望ましい。

---

#### 各 Phase の依存関係と累計所要

| Phase | 所要 | 前提 | 累計 tests 追加 |
|-------|-----|------|---------------|
| 8-A   | 3〜5 日 | なし（単独実装可） | +18 本 |
| 8-B   | 5〜8 日 | 8-A 完了必須 | +18 本（累計 +36） |
| 8-C   | 3〜5 日 | 8-A 完了必須（8-B は望ましいが厳密には不要） | +8 本（累計 +44） |
| **合計** | **11〜18 日** | | **+44 本**（299 → 343 本） |

**推奨進行順**: 8-A → 8-B → 8-C（上から順）。8-B まで完了した時点で単月・集約の MVP が完成し、8-C は累計対応の差分として進められる。

---

## 8. GO/NO-GO 判断基準

### 8.1 Phase 8 全体の GO 基準

以下すべてを満たせば Phase 8 本実装に進む:

- 影響ファイル **12 以下**（現状推定 9）
- 既存テスト書き換え **5% 以下**（目標: 0%、最悪 15 本 / 299 本 = 5%）
- テンプレート変更が **Named Style 追加のみ**（§6.4.3、哲学の拡張として許容）
- Named Style 事前検証（§6.4.4）で openpyxl 制約が明らかになっている
- サブ Phase **3 段階分割（8-A / 8-B / 8-C）** に関して戦略 Claude の合意

### 8.2 NO-GO 基準

以下のいずれかが成立したら Phase 8 を再設計:

- テンプレート駆動哲学に新規例外が **2 つ以上** 必要（現状は親子行スタイル追加 1 つのみ）
- checker の既存判定ロジックを累計対応で **書き換える必要がある**（現状はゼロと評価）
- 既存テストの **30 本以上** が壊れる設計になる（R3 を選んだ時点でこれはゼロ）

### 8.3 中間案（部分実行）

- **8-A + 8-B のみ実行**: 集約機能と親子表示だけ提供。累計モデルは Phase 9 に延期。累計化で未知の回帰が怖い場合の保守的な選択肢。この時点でも単月の行爆発（TC-06 混在検出等）は集約で解決される。
- **8-A のみ実行**: grouper 層だけ完成、Excel は従来 flat 表示のまま。内部構造だけ整える形。スタッフ体験は変わらないため単独リリースの意味は薄い。
- **全実行（推奨）**: Phase 8-A → 8-B → 8-C を通しで進める。サブ Phase で段階的に進められるため、中途で問題が出ても手前までで確定可能。

### 8.4 Phase 8-C 完了時の「ytd デフォルト切替」に関する判断

**方針**: Phase 8 では切り替えない。`period_mode="monthly"` をデフォルトのまま維持する。

**理由**:
- 既存 299 tests + 新規 +44 本すべての期待値が monthly 前提で書かれている。Phase 8 内で ytd デフォルトに切り替えるとテスト変更範囲が跳ね上がる。
- 実運用での ytd 検証が Phase 8-C の E2E 1 ケースしかない。複数社・複数期で ytd 検証してから切り替えるのが安全。
- Phase 9 以降（LEARN 設計等）でデフォルト切替を検討、そのときに既存 fixture も期間対応に移行する。

---

## 9. Open Questions

### Q1. テンプレート変更（Named Style 追加）の可否 ← **解決済み、記録として残す**

**論点**: §6.4 の Named Style 方式は `TC_template.xlsx` に `parent_row_style` 系 / `child_row_style` の Named Style を追加する必要がある。

**判断**: §6.4.1 の通り「テンプレート駆動哲学の例外」ではなく「哲学の拡張」として許容する方針で整理済み。戦略 Claude + 悠皓さんの事前合意に基づき **Yes（テンプレ改修可）** で進行する。

### Q2. CheckContext.period_mode のデフォルト値 ← **解決済み、記録として残す**

**論点**: Phase 8-C で `period_mode` のデフォルトをどれにするか。

**判断**: §8.4 の通り、**Phase 8 では `monthly` デフォルトを維持**。ytd デフォルト切替は Phase 9 以降に延期。本論点は解決済みとし、Open Questions からは撤去。

### Q3. LEARN 設計との整合

**論点**: Phase 9 以降の LEARN（L1〜L4）は FindingGroup 単位で学習ログを残すべきか、Finding 単位か。本調査では R3 で「FindingGroup は第一級オブジェクト」としたが、LEARN の学習単位が Finding ならグループ集約は学習には邪魔。

**推奨**: 本予備調査の範囲外。Phase 9 LEARN 設計時に再整理。現時点では FindingGroup に wallet_txn_id リストを持たせて「グループ→個別 Finding」を逆引き可能にしておく。

### Q4. Kintone App 448（帳簿チェック指摘事項）連携単位

**論点**: Kintone にレコードを送る単位は Finding か FindingGroup か。

**推奨**: FindingGroup 単位（スタッフが確認する最小粒度と一致するため）。ただし Kintone 連携は Phase 10 以降のテーマであり、本調査では「FindingGroup 単位の送信を前提に設計する」と宣言するのみ。

### Q5. severity 集約時のエッジケース

- 0 件グループ（group_findings が空リストで呼ばれた場合）の扱い: `List[FindingGroup]` を空で返す。
- 同一グループ内で severity が全パターン混在: S1 で max に昇格、親行子行の色分けで識別可能。
- `total_debit` と `total_credit` の両方が非 None（稀な精算仕訳）: 現状 `extract_debit_credit` が `(None, None)` を返すのでグループでも両方 None。これで十分。

### Q6. Named Style が openpyxl の動的シート複製で消える場合の退避方針

**論点**: §6.4.4 の事前検証で以下のいずれかが成立した場合、哲学を逸脱せずに実装する方法がなくなる可能性がある。

- ケース 2: 複製で Named Style がセル側から消える
- ケース 3: Named Style がワークブックレベルで消える

**退避案**（§6.4.5 再掲）:
- **退避案 1**: Python 側で `NamedStyle` を動的登録。スタイル定義は Python 側に来るが、セル代入は名前参照のみ。哲学に半分反するが、名前参照の明示性は維持できる。
- **退避案 2**: テンプレのサンプル 2 行（親 1 / 子 1）を設置、Python が `copy()` で流用。Phase 7 の severity サンプル流用と同じ手法の延長で、哲学には近いが Named Style の明示性は失われる。

**戦略 Claude への質問**: ケース 2/3 に該当した場合、退避案 1 と 2 のどちらを採用すべきか。事前合意しておくと Phase 8-A 実装中の判断が速くなる。

---

## 10. 戦略 Claude 宛ての質問リスト

Claude Code が設計判断で確信を持ちきれなかった論点を優先度順に列挙する。

### 質問（Phase 8-A 着手前に判断が必要）

1. **K4（TC 別動的 group_key 戦略）採用の最終合意**（§6.2.5）
   - 初版 K1 から K4 に暫定ベストを切り替えた。strategy 辞書の初期定義 10〜15 個 + TC 別テスト追加のコストを受容するか。
   - 採用後の「strategy 未登録検知」の仕組み（CI チェック / 警告）を Phase 8-A 内で作るかどうか。

2. **Named Style 事前検証（§6.4.4）で複製が壊れた場合の退避方針**（§9 Q6）
   - 退避案 1（Python で NamedStyle 動的登録）vs 退避案 2（サンプル行流用）の事前合意。
   - どちらが哲学的に許容されるか、Phase 8-A 着手前に決めておきたい。

3. **サブ Phase 3 段階版（Phase 8-A / 8-B / 8-C）の粒度確認**
   - §7.3 の各 Phase の GO 条件・スコープに合意できるか。
   - 特に Phase 8-B の「サマリーシート集計を group 単位に変えるかどうか」の判断を 8-B 内で決めてよいか（予備調査では両論併記）。

4. **Phase 8-C で ytd デフォルト切替をしない方針**（§8.4）の再確認
   - 既に合意済みだが、念のため記録。Phase 9 以降に切替タイミングを持ち越す。

### 判断後に Claude Code が動けるようになる項目

- Q1 K4 合意 → `GROUP_KEY_STRATEGIES` 辞書の初期 10〜15 戦略を Phase 8-A で具体実装可能。
- Q2 退避方針合意 → Named Style 検証結果次第で即座に Phase 8-B を進行可能。
- Q3 サブ Phase 合意 → Phase 8-A を独立タスクとして切り出し、本実装指示書の作成に進める。

---

## 付録 A: 旧サブ Phase 5 段階分割案（初期案、記録用）

> **Note**: 本予備調査レポート初版で提示した 5 段階分割案。戦略 Claude レビューの結果、3 段階（§7.3）に圧縮された。ここでは初期案として記録のみ残す。

- **Phase 8.1**: FindingGroup スキーマ導入（schema.py への型追加のみ、1〜2 日）
- **Phase 8.2**: grouping 層の実装（_common/lib/finding_grouper.py 新設、2〜3 日）
- **Phase 8.3**: Excel 親子行表現（template_engine.py 拡張 + テンプレ改修、3〜5 日）
- **Phase 8.4**: 累計 fetch 層（freee_to_context.py 拡張、2〜3 日）
- **Phase 8.5**: 累計 × 集約 E2E 統合 + ytd デフォルト切替（1〜2 日）

**3 段階に圧縮した判断**:
- 8.1 と 8.2 は同じ grouper 文脈のため分離の実益が薄い → **Phase 8-A に統合**
- 8.4 と 8.5 のうち、「ytd デフォルト切替」は Phase 9 に送るため、8.5 の単独 Phase 化は不要 → 残部は **Phase 8-C に統合**
- 8.3 は単独の体感価値があるため **Phase 8-B として独立維持**

### 本調査で解決できなかった中期論点（Phase 9 以降）

- LEARN との統合単位（Q3）
- Kintone 連携単位（Q4）
- TKC 等他会計ソフトへの汎用化（指示書でスコープ外と明示、Phase 9 以降）

---

## 完了報告

### 追加ファイル

- `office/office-claude/docs/phase8_prestudy.md`（本ファイル）のみ。他ファイルへの変更・追加なし。

### テスト実行

- **なし**（コード変更なしのため pytest 実行不要、指示書準拠）。

### 責務定義の仮決定

- **R3「両方（二層構造）」**。checker は List[Finding] を返し、新設 `finding_grouper` が List[FindingGroup] に変換、Excel 層が親子行で展開する。

### 各セクションの暫定ベスト案一覧（追記版）

| セクション | 暫定ベスト案 | 一行理由 |
|----------|-----------|--------|
| §3 スキーマ | **案 A（コンポジション型）** | `FindingGroup.findings: list[Finding]` で直感的、既存 Finding 不変 |
| §4 severity 集約 | **S1（最大 severity 昇格）** + 件数・金額を別フィールド併記 | 実務一次レビュー要求と一致、説明容易 |
| §6.2 group_key | **K4（TC 別動的戦略）** ← 初版 K1 から変更 | TC-06 混在検出を扱える唯一の案、将来 Skill 横展開性 ◎ |
| §6.3 Excel 表現 | **E1（親行 + インデント子行）** | テンプレ駆動哲学と整合、最小実装 |
| §6.4 テンプレ哲学 | **Named Style 方式（哲学の拡張として整理）** | ← 本追記で新設。Python は style 名参照のみ |
| §7.3 サブ Phase | **3 段階（Phase 8-A / 8-B / 8-C）** ← 初版 5 段階から圧縮 | ytd デフォルト切替を Phase 9 に送ることで 8.5 が消える |

### 主要な発見（追記版、5 点）

1. **全 TC の判定ロジックは累計モデルに対して頑健**。行単位判定で月境界に依存しないため、累計化しても判定結果は増えるが誤検知は増えない想定。
2. **A5 人件費の 3 行は累計化で 27〜40 行まで爆発**。集約なしで累計に進むとレポートが使い物にならないため、集約は累計化の前提条件。
3. **R3 責務定義 + 案 A スキーマ + K4 group_key の組み合わせで、既存 299 tests をゼロ書き換えで進行可能**。K4 は初版 K1 から変更した暫定ベスト（TC-06 混在検出対応 + 横展開性）。
4. **テンプレート変更は「哲学の例外」ではなく「哲学の拡張」として整理可能**。Named Style 方式で Python 側は style 名参照のみ、スタイル定義はテンプレ側に維持。§6.4 で明文化。
5. **サブ Phase を 3 段階（8-A / 8-B / 8-C）に圧縮**することで、各 Phase の独立性とスタッフ体感価値が明確になった。ytd デフォルト切替は Phase 9 以降に送る。

### 戦略 Claude への質問（追記版、セクション 10 の要約）

1. K4 採用の最終合意と strategy 未登録検知の必要性
2. Named Style 検証失敗時の退避案（1 or 2）の事前合意
3. サブ Phase 3 段階（Phase 8-A / 8-B / 8-C）の粒度確認
4. Phase 8-C で ytd デフォルト切替しない方針の再確認

### 予備調査時間の実績

**初版調査**:
- 既存コード読み込み: 約 25 分
- 責務定義仮決定: 約 15 分
- 爆発シミュレーション: 約 20 分
- スキーマ設計案: 約 35 分
- 累計モデル 3 層調査: 約 30 分
- 統合設計 + 実装分割: 約 30 分
- ドキュメント化: 約 25 分
- 初版合計: 約 3 時間

**追記（本レビュー対応）**:
- K4 再評価 + TC 別戦略定義: 約 30 分
- Named Style 方式の設計: 約 25 分
- サブ Phase 3 段階への書き換え: 約 20 分
- 整合性確認 + 追記反映: 約 15 分
- 追記合計: 約 1.5 時間

- **総計: 約 4.5 時間**（上限 4 時間を 30 分オーバーしたが、追記依頼分として戦略 Claude に報告）

---

**以上、Phase 8 予備調査レポート（追記版）。**

戦略 Claude のレビュー後、Open Questions / 質問リストへの回答を踏まえて Phase 8-A の実装計画に着手可能。
