# V1-3 Context 統合 (E4) 事前調査レポート

**作成日**: 2026-05-07
**作成者**: Claude Code (戦略 Claude プロンプト指示)
**対象**: β2-E E4 (Context 統合) の事前調査
**前提**: E1〜E3-b 完了、512 件テスト PASS

---

## 1. 調査の目的

設計メモ v2 §3.1 に基づく E4 の方針:

- V1-3-10 既存の `CheckContext` / `TransactionRow` / `ReferenceBundle` を `skills/_common/context.py` に共通昇格する
- V1-3-20 の `InvoiceCheckContext` を共通 `CheckContext` に寄せる

本レポートは E4-1〜E4-3 の実装に入る前の現状把握。E1 (Finding) の事前調査 (`finding-schema-comparison-20260506.md`) と同パターン。

---

## 2. V1-3-10 Context 系の現状

すべて `skills/verify/V1-3-rule/check-tax-classification/schema.py` に定義されており、同ファイルから `__all__` で export されている。

### 2.1 CheckContext

- **定義位置**: `skills/verify/V1-3-rule/check-tax-classification/schema.py:107-129`
- **デコレータ**: `@dataclass(frozen=True)`
- **docstring 冒頭**: `Skill 実行時に注入される環境情報。`
- **フィールド一覧**:

| 名前 | 型 | デフォルト |
|---|---|---|
| `company_id` | `str` | (必須) |
| `fiscal_year_id` | `str` | (必須) |
| `period_start` | `date` | (必須) |
| `period_end` | `date` | (必須) |
| `transactions` | `list[TransactionRow]` | `field(default_factory=list)` |
| `account_master` | `dict[str, dict]` | `field(default_factory=dict)` |
| `tax_code_master` | `dict[str, str]` | `field(default_factory=dict)` |
| `partner_master` | `dict[str, dict]` | `field(default_factory=dict)` |
| `references` | `Optional[ReferenceBundle]` | `None` |
| `company_name` | `str` | `""` |
| `skill_name` | `str` | `""` |
| `debug_mode` | `bool` | `False` |

- **メソッド**: なし（dataclass、属性のみ）

### 2.2 TransactionRow

- **定義位置**: `skills/verify/V1-3-rule/check-tax-classification/schema.py:46-70`
- **デコレータ**: `@dataclass(frozen=True)`
- **docstring 冒頭**: `仕訳1件の正規形。`
- **フィールド一覧**:

| 名前 | 型 | デフォルト |
|---|---|---|
| `wallet_txn_id` | `str` | (必須) |
| `deal_id` | `Optional[str]` | `None` |
| `transaction_date` | `Optional[date]` | `None` |
| `account` | `str` | `""` |
| `tax_label` | `str` | `""` |
| `partner` | `str` | `""` |
| `description` | `str` | `""` |
| `debit_amount` | `Decimal` | `Decimal("0")` |
| `credit_amount` | `Decimal` | `Decimal("0")` |
| `item` | `Optional[str]` | `None` |
| `section` | `Optional[str]` | `None` |
| `memo_tag` | `Optional[str]` | `None` |
| `notes` | `Optional[str]` | `None` |
| `raw` | `Optional[dict]` | `None` |

- **メソッド**: なし

### 2.3 ReferenceBundle

- **定義位置**: `skills/verify/V1-3-rule/check-tax-classification/schema.py:78-99`
- **デコレータ**: `@dataclass(frozen=True)`
- **docstring 冒頭**: `references/JSON 辞書の束。`
- **フィールド一覧**:

| 名前 | 型 | デフォルト |
|---|---|---|
| `common` | `dict[str, dict]` | `field(default_factory=dict)` |
| `skill_specific` | `dict[str, dict]` | `field(default_factory=dict)` |

- **メソッド**:
  - `@classmethod load_for_skill(cls, skill_name: str) -> "ReferenceBundle"` — 実体は `_common/lib/finding_factory.py:495` の `_build_reference_bundle()` 側にあり、schema.py 側は `NotImplementedError` を投げるスタブ。
  - `get(self, category: str, key: str) -> dict` — 同様にスタブ。

### 2.4 callsite サマリ (V1-3-10 の 3 クラス、`schema.py.bak_*` は除外)

ファイル別の出現状況（出現行数の概算）。同一ファイル内で複数クラスを使う例が多い。

| ファイル | CheckContext | TransactionRow | ReferenceBundle | 区分 |
|---|---|---|---|---|
| `scripts/e2e/freee_to_context.py` | ✓ (8) | ✓ (10) | – | 実装 (adapter) |
| `scripts/verify_part1_schema.py` | ✓ | ✓ | ✓ | 検証スクリプト |
| `scripts/verify_part2_lib.py` | ✓ | ✓ | – | 検証スクリプト |
| `skills/_common/lib/finding_factory.py` | ✓ (型注釈) | ✓ (実装) | ✓ (実装) | 共通ライブラリ |
| `skills/_common/lib/keyword_matcher.py` | – | ✓ (TYPE_CHECKING) | – | 共通ライブラリ |
| `skills/_common/lib/freee_link_generator.py` | ✓ (型注釈) | – | – | 共通ライブラリ |
| `skills/export/excel_report/exporter.py` | ✓ (型注釈) | – | – | Excel 出力 |
| `skills/export/excel_report/template_engine.py` | ✓ (型注釈) | ✓ (型注釈) | – | Excel 出力 |
| `skills/verify/V1-3-rule/check-invoice-registration-status/run.py` | ✓ (実装で使用) | ✓ (adapter で使用) | – | V1-3-20 |
| `skills/verify/V1-3-rule/check-tax-classification/checker.py` | ✓ | – | – | V1-3-10 本体 |
| `skills/verify/V1-3-rule/check-tax-classification/checks/tc03_payroll.py` | ✓ | – | – | V1-3-10 TC-03 |
| `skills/verify/V1-3-rule/check-tax-classification/run.py` | ✓ | – | – | V1-3-10 ランナー |
| `tests/conftest.py` | ✓ (`sample_ctx` fixture) | ✓ (`sample_row` fixture) | – | テスト fixture |
| `tests/fixtures/make_row.py` | – | ✓ (factory) | – | テスト fixture |
| `tests/unit/test_common.py` | – | ✓ | – | テスト |
| `tests/unit/test_invoice_registration_status.py` | ✓ | ✓ (mock 経由) | – | V1-3-20 テスト |
| `tests/unit/test_step3c_exporter.py` | ✓ | ✓ | – | テスト |
| `tests/unit/test_suggested_value_constraint.py` | ✓ | – | – | テスト |
| `tests/unit/test_tc01.py` 〜 `test_tc07.py` | ✓ × 7 | – | – | テスト (TC01〜07 各 1) |
| `tests/unit/test_template_engine_phase8b.py` | ✓ (コメントのみ) | – | – | テスト |
| **合計ファイル数** | **約 19** | **約 12** | **3** | |

### 2.5 重要な観察

- `_common/` 配下の共通ライブラリ (`finding_factory.py`, `keyword_matcher.py`, `freee_link_generator.py`) は既に V1-3-10 の `CheckContext` / `TransactionRow` を**動的 import (`importlib.util.spec_from_file_location`) または TYPE_CHECKING で参照**している。
- `tests/conftest.py` は `importlib.util.spec_from_file_location("schema", ...)` で V1-3-10 の `schema.py` を `"schema"` として `sys.modules` に登録しており、テスト全体がこの「`schema`」モジュール経由で `CheckContext` / `TransactionRow` を参照している。
- E4-1 で `_common/context.py` を新設する場合、V1-3-10 `schema.py` 側で re-export を維持すれば、conftest の動的ロード機構経由でテストは透過的に動く見込み（E2-a の Finding 共通化と同パターン）。

---

## 3. V1-3-20 Context 系の現状

### 3.1 InvoiceCheckContext

- **定義位置**: `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py:64-83`
- **デコレータ**: `@dataclass(frozen=True)`
- **docstring 冒頭**: `V1-3-20 β1 専用の最小 CheckContext。`
- **フィールド一覧**:

| 名前 | 型 | デフォルト |
|---|---|---|
| `company_id` | `int` | (必須) |
| `period_start` | `date` | (必須) |
| `period_end` | `date` | (必須) |
| `target_month` | `date \| None` | `None` |
| `single_month` | `bool` | `False` |

- **メソッド**: なし

### 3.2 callsite サマリ

| ファイル | 出現箇所 | 区分 |
|---|---|---|
| `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` | 定義 + `__all__` | 定義元 |
| `tests/unit/test_invoice_registration_status.py` | コンストラクタ 4 箇所 (line 287-324、`TestInvoiceCheckContext` クラス) | テスト |

合計 **2 ファイルのみ**（定義元 + テスト）。

### 3.3 重要な観察 — InvoiceCheckContext は run.py で未使用

V1-3-20 の本番コード (`run.py`) を `git grep "InvoiceCheckContext"` で検索した結果、**1 件もヒットしない**。代わりに run.py は V1-3-10 の `CheckContext` を直接使用している:

- `run.py:782` — `ctx: V1-3-10 共通の CheckContext。`
- `run.py:1104` — `message=f"CheckContext 構築または adapter 変換に失敗: ..."`
- `run.py:1059` — `Step 4: build_check_context 経由で TransactionRow を取得し、adapter で InvoiceCheckRow に変換（L1-B）`

つまり **`InvoiceCheckContext` は schema.py で定義され、テストでのみインスタンス化されているが、本番コードパスでは使われていない**。設計メモの「V1-3-20 は最小 CheckContext を持つ」という意図と現実の実装の間に乖離がある（β2-D の L1-B 以降で V1-3-10 の build_check_context に統合された結果と推測）。

### 3.4 V1-3-20 配下の他 Context 系クラス

`git grep "^class " -- "skills/verify/V1-3-rule/check-invoice-registration-status/"` の結果:

- `Classification` (Enum) — 5 分類体系、Context とは無関係
- `InvoiceCheckContext` — 上記
- `FindingGroup` — Finding の親子グルーピング、Context とは無関係
- `InvoiceCheckRow` (`run.py:124`) — 入力仕訳行の正規形、V1-3-10 `TransactionRow` の subset。`classify_transaction()` の入力型として使われる。
- `_Parser` (`run.py:461`) — argparse、Context とは無関係

**`InvoiceCheckRow` は V1-3-20 固有の入力行型で、V1-3-10 の `TransactionRow` から `_build_invoice_check_rows(ctx)` adapter で変換される**。設計メモ §3 では言及されていないが、E4 で扱うか否かは要相談（§5.2 参照）。

---

## 4. 差分分析

### 4.1 CheckContext vs InvoiceCheckContext のフィールド差分

| フィールド | V1-3-10 CheckContext | V1-3-20 InvoiceCheckContext | 分類 |
|---|---|---|---|
| `company_id` | `str`（必須） | `int`（必須） | **(d) 型違い** |
| `fiscal_year_id` | `str`（必須） | (なし) | (c) V1-3-10 のみ |
| `period_start` | `date`（必須） | `date`（必須） | (a) 完全一致 |
| `period_end` | `date`（必須） | `date`（必須） | (a) 完全一致 |
| `transactions` | `list[TransactionRow] = []` | (なし) | (c) V1-3-10 のみ |
| `account_master` | `dict[str, dict] = {}` | (なし) | (c) V1-3-10 のみ |
| `tax_code_master` | `dict[str, str] = {}` | (なし) | (c) V1-3-10 のみ |
| `partner_master` | `dict[str, dict] = {}` | (なし) | (c) V1-3-10 のみ |
| `references` | `Optional[ReferenceBundle] = None` | (なし) | (c) V1-3-10 のみ |
| `company_name` | `str = ""` | (なし) | (c) V1-3-10 のみ |
| `skill_name` | `str = ""` | (なし) | (c) V1-3-10 のみ |
| `debug_mode` | `bool = False` | (なし) | (c) V1-3-10 のみ |
| `target_month` | (なし) | `date \| None = None` | **(b) V1-3-20 のみ** |
| `single_month` | (なし) | `bool = False` | **(b) V1-3-20 のみ** |

**集計**:
- (a) 完全一致: 2 件 (`period_start`, `period_end`)
- (b) V1-3-20 のみ: 2 件 (`target_month`, `single_month`)
- (c) V1-3-10 のみ: 9 件
- (d) 同名で型違い: 1 件 (`company_id`)

### 4.2 メソッド差分

両者ともメソッドなし（dataclass、属性のみ）。差分なし。

### 4.3 V1-3-20 における TransactionRow / ReferenceBundle 利用状況

- **TransactionRow**: V1-3-20 の本番 (`run.py`) で V1-3-10 ctx 経由で **使用している**。具体的には `_build_invoice_check_rows(ctx)` adapter で `ctx.transactions: list[TransactionRow]` を `list[InvoiceCheckRow]` に変換する箇所。
- **ReferenceBundle**: V1-3-20 では一切使用していない。`InvoiceCheckContext` にも `references` フィールドはない。

---

## 5. 設計判断ポイント

### 5.1 自明な部分（戦略 Claude 確認なしで進められる）

- **E4-1 (共通切り出し)**:
  - `skills/_common/context.py` を新設し、V1-3-10 の `CheckContext` / `TransactionRow` / `ReferenceBundle` をそのまま移植。
  - V1-3-10 `schema.py` 側は re-export に切り替え（E2-a の Finding と同パターン）。
  - `_common/lib/*.py` の動的 import は V1-3-10 `schema.py` 経由で透過的に動く見込み。
  - 影響: 2 ファイル（`_common/context.py` 新設、`V1-3-10/schema.py` 修正）。

- **E4-2 (V1-3-10 re-export 化)**:
  - 実質 E4-1 と同時に完了する見込み。`__all__` の維持で互換性確保。

- **テスト**:
  - 既存テスト（512 件）は `tests/conftest.py` の動的 import 経由で V1-3-10 `schema` モジュールから `CheckContext` 等を参照しているため、re-export を維持する限り既存テストは無修正で PASS する見込み。

### 5.2 要相談（戦略 Claude に判断仰ぐ）

#### 論点 1: `company_id` の型統一 — `int` か `str` か

- V1-3-10 `CheckContext.company_id: str`（callsite では `"2422271"` のように文字列）
- V1-3-20 `InvoiceCheckContext.company_id: int`
- **freee API の事業所 ID は数値**だが、URL や CLI 引数では文字列で扱われる場面も多い。
- 寄せ方の選択肢:
  - 案 A: 共通 `CheckContext.company_id: str` に統一（V1-3-20 の int を str に変換）
  - 案 B: 共通 `CheckContext.company_id: int` に統一（V1-3-10 の str を int に変換）
  - 案 C: `int | str` のユニオン型（妥協案、型安全性は下がる）
- 既存 callsite が広範な V1-3-10 側に合わせる（案 A）のが影響最小だが、freee API の本来の型を考えると案 B も妥当。**業務上の意味論判断が必要**。

#### 論点 2: V1-3-20 固有フィールド (`target_month`, `single_month`) の扱い

- V1-3-20 の `InvoiceCheckContext` には共通 `CheckContext` にない 2 フィールドが存在（パターン 2/3 単月モード用）。
- 寄せ方の選択肢:
  - 案 A: 共通 `CheckContext` に `target_month: date | None = None` と `single_month: bool = False` を追加（V1-3-10 では未使用だが Optional なので影響小）
  - 案 B: 共通 `CheckContext` には追加せず、V1-3-20 専用のサブクラスや別 dataclass で持つ
  - 案 C: V1-3-20 は共通 `CheckContext` を使い、`target_month` / `single_month` は実行時に別途渡す（runtime parameter）
- 設計メモ §3.1「`InvoiceCheckContext` を共通 `CheckContext` に寄せる」に最も忠実なのは案 A。

#### 論点 3: `InvoiceCheckContext` の存続

- **§3.3 で確認したとおり、`InvoiceCheckContext` は run.py で未使用、テストでのみ存在**。
- 寄せ方の選択肢:
  - 案 A: `InvoiceCheckContext` を完全削除し、テストも共通 `CheckContext` を使うよう書き換え（4 箇所）
  - 案 B: `InvoiceCheckContext` を残すが、共通 `CheckContext` のエイリアス（`InvoiceCheckContext = CheckContext`）にする
  - 案 C: `InvoiceCheckContext` を残すが、論点 2 の案 B/C で V1-3-20 固有のままにする
- 「V1-3-20 から V1-3-10 依存を切る」という当初の design intent と「実装上は既に V1-3-10 ctx を使っている」現実をどう調整するかは戦略判断。

#### 論点 4: `InvoiceCheckRow` の扱い

- V1-3-20 固有の入力行型。V1-3-10 の `TransactionRow` から adapter で変換される。
- 設計メモ v2 §3 では言及されていないが、E4 (Context 統合) のスコープに含めるか?
- 含めるなら、`InvoiceCheckRow` を `TransactionRow` のサブセット相当に整理するかどうかも論点。
- 含めないなら、E4 完了後も V1-3-20 内に残置（現状維持）。

#### 論点 5: `_common/lib/finding_factory.py` の動的 import

- `finding_factory.py:103` で `importlib.util.spec_from_file_location("schema", schema_path)` を使っている箇所がある（V1-3-10 の schema.py を動的ロード）。
- E4-1 で V1-3-10 `schema.py` を re-export 形式にしてもこの動的ロードは V1-3-10 schema を読み込むので動くが、**E4 完了後にこの動的ロード自体を _common.context への直接 import に切り替えるべきか?** は別論点。本タスク（E4-1〜E4-3）のスコープか、E5 以降か。

---

## 6. E4-1〜E4-3 の影響範囲見積もり

| クラスタ | 変更ファイル数 | 主要ファイル | 備考 |
|---|---|---|---|
| **E4-1** (共通切り出し) | 2 | `skills/_common/context.py` 新設、`skills/verify/V1-3-rule/check-tax-classification/schema.py` 修正 | E2-a と同パターン。`__all__` 維持で既存テスト無修正。 |
| **E4-2** (V1-3-10 re-export) | 0 (E4-1 で完了) | – | 実質 E4-1 と同時。 |
| **E4-3** (V1-3-20 寄せ) | 論点次第で 1〜N | `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py`、`tests/unit/test_invoice_registration_status.py` (4 箇所) | 論点 1〜4 の判断次第で変更範囲が大きく変わる。最小ケース（エイリアス化）なら schema.py + tests のみで完結。 |

各クラスタ後のテスト維持見込み:
- E4-1 完了後: 512 件 PASS 維持見込み（re-export パターンの再利用）
- E4-3 完了後: `test_invoice_registration_status.py` の `TestInvoiceCheckContext` クラス (4 テスト) が論点 3 の案によっては修正必要。

---

## 7. テスト影響

`git grep "CheckContext|TransactionRow|ReferenceBundle|InvoiceCheckContext" -- "tests/"` の結果:

| ファイル | 主な出現 | E4 で修正必要? |
|---|---|---|
| `tests/conftest.py` | `sample_ctx` fixture (CheckContext)、`sample_row` fixture (TransactionRow)、動的 import 機構 | 不要（re-export 経由で透過的） |
| `tests/fixtures/make_row.py` | `make_row` factory (TransactionRow) | 不要 |
| `tests/unit/test_common.py` | TransactionRow を多数生成 | 不要 |
| `tests/unit/test_step3c_exporter.py` | CheckContext + TransactionRow | 不要 |
| `tests/unit/test_suggested_value_constraint.py` | CheckContext fixture | 不要 |
| `tests/unit/test_tc01.py` 〜 `test_tc07.py` | 各 TC 用の CheckContext fixture (7 ファイル) | 不要 |
| `tests/unit/test_template_engine_phase8b.py` | コメントのみ | 不要 |
| `tests/unit/test_invoice_registration_status.py` | `TestInvoiceCheckContext` クラス (4 テスト) + `InvoiceCheckRow` 多数 | **論点 3 の判断次第で修正** |

E4-3 で修正が必要な fixture / テストは `test_invoice_registration_status.py` の `TestInvoiceCheckContext` 配下のみ（4 箇所のコンストラクタ呼び出し）。論点 3 が案 B（エイリアス）なら修正不要、案 A（削除）なら修正必要。

---

## 8. 結論と次のアクション

### 8.1 進め方の推奨

E4-1（共通切り出し）と E4-2（V1-3-10 re-export）は **E1 (Finding) の事前調査 → 実装と同パターン**で安全に進められる見込み。影響範囲も限定的（2 ファイル）で、テストは無修正で PASS する想定。

E4-3（V1-3-20 寄せ）は **§5.2 の論点 1〜4 の戦略判断が前提**。特に論点 3（`InvoiceCheckContext` の存続）と論点 1（`company_id` の型）は実装方針を大きく変える。

### 8.2 戦略 Claude への質問・確認事項リスト

E4-1〜E4-3 の実装プロンプト設計に入る前に、以下の判断をお願いしたい:

1. **論点 1**: 共通 `CheckContext.company_id` の型は `str` / `int` / `int | str` のどれにするか?
2. **論点 2**: `target_month` / `single_month` を共通 `CheckContext` に追加するか、V1-3-20 固有のままにするか?
3. **論点 3**: `InvoiceCheckContext` を「削除」「共通 `CheckContext` のエイリアス」「独立の minimal context として残す」のどれにするか?
4. **論点 4**: `InvoiceCheckRow` を E4 のスコープに含めるか? (含めない=現状維持が無難)
5. **論点 5**: `_common/lib/finding_factory.py` の動的 import を `_common.context` への直接 import に切り替えるのは E4 内 / E5 以降のどちらか?

論点 1〜3 は E4-3 の実装方針に直結。論点 4〜5 はスコープの広さに関わる。

---

**作成者**: Claude Code
**バージョン**: v1
