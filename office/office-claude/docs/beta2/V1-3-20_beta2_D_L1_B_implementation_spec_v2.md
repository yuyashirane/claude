# V1-3-20 β2-D L1-B 実装指示書

**作成日**：2026-04-30
**対象クラスタ**：B-3（partner_master 生成）→ B-1（adapter + Step 4 置換）→ B-4（実機検証）
**実装者**：Claude Code（Sonnet 推奨、設計判断はすべて確定済）
**前提文書**：V1-3-20_beta2_D_L1_B_design_memo.md（995 行、設計メモ本体）

---

## §1. サマリ

### 1.1 本書の位置付け

本書は V1-3-20 β2-D L1-B の実装指示書である。設計判断はすべて L1-B 設計メモで確定済であり、本書は **実装そのものを指示する文書** である。

設計メモの内容を本書にコピーしない。設計メモが「唯一の真実源（Single Source of Truth）」、本書が「実装指示」という役割分担を厳守する。

### 1.2 最重要原則（再掲、設計メモ §1.2 / §6.1 / §9.1 と完全同一文面）

```
L1-B は TransactionRow への完全移行ではない。
V1-3-20 の判定層は InvoiceCheckRow のまま維持し、
入力経路だけを build_check_context + adapter に寄せる。
```

**本書冒頭でこの三行を再掲する理由**：Claude Code 実装中の「親切な完全置換」を構造的に防ぐため。設計メモ §6.1 でも明示。

### 1.3 着手順序とクラスタ

| 順 | クラスタ | 内容 | 規模 |
|---|---|---|---|
| 1 | **B-3** | `freee_to_context.py` の `build_check_context` に `partner_master` 生成ブロックを追加 | ~15 行追加 |
| 2 | **B-1** | V1-3-20 `run.py` を `build_check_context` 経由 + adapter 関数で `InvoiceCheckRow` を生成する形に改修 | ~50 行追加 + 既存 Step 4 置換 |
| 3 | **B-4** | 3 社（3525430 / 12243357 / 10794380）で β2-C 連続性 + 境界線維持 + manual_journals 流入確認 | 実機検証 |

**B-2 は削除済**（旧設計の「manual_journals 取り込み」は `freee_to_context.py` で実装済のため、B-1 完了で自動的に流入する。経緯は設計メモ §1.5 / §2.6 参照）。

### 1.4 触らないもの（設計メモ §6.2 / §6.3 / §6.4 から要点抜粋、本書での再掲）

#### ファイル

- `skills/verify/V1-3-rule/check-invoice-registration-status/checker.py` （**判定層、最重要原則の核心**）
- `skills/verify/V1-3-rule/check-invoice-registration-status/schema.py` （Classification / InvoiceFinding / FindingGroup / InvoiceCheckContext）
- `skills/verify/V1-3-rule/check-tax-classification/schema.py`（V1-3-10 共通、`partner_master` フィールドは既に存在し、改修不要）
- `skills/verify/V1-3-rule/check-tax-classification/checker.py` 系（V1-3-10 判定層、無関係）
- exporter / Excel 関連ファイル全般

#### 概念

- `InvoiceCheckRow` クラス定義（V1-3-20 run.py L121〜L148、9 フィールド）
- `Classification` Enum（5 + NONE = 6 値）
- `MESSAGE_TEMPLATES`（3 分類）
- `InvoiceFinding` の構造（共通最小サブセット + classification + raw 8 フィールド）
- `FindingGroup` の構造（classification 単位）
- L1-A で確立した observations の構造（`tax_code_distribution` / `source_breakdown` のキー構造）
- L1-A で確立した groups の構造と順序（QBT → NBF → PU の固定順）

#### 論点

- InvoiceFinding と V1-3-10 Finding の統合（β2-E / 別 Phase）
- exporter / Excel 出力の統合（β2-E / 別 Phase）
- T 番号妥当性チェック（β3 以降）
- partner_master の同名 partner 後勝ち問題（B-4 で観察、修正対応は別タスク）
- `InvoiceFinding.raw["source"]` の動的化（manual_journal 由来でも "deal" 固定のまま、L1-C 以降で判断）

### 1.5 既知の制約（実装中・検証中に意識する）

#### 制約 1：`InvoiceFinding.raw["source"]` の "deal" 固定

L1-B の B-1 改修により、`build_check_context` 経由で `manual_journals` 由来の `TransactionRow` が `ctx.transactions` に流入する。adapter で InvoiceCheckRow に変換され、checker.py の `_build_raw`（L188）により Finding が生成される。

しかし、checker.py の `_build_raw` は `raw["source"]` を **"deal" 固定** にしているため、**manual_journal 由来の Finding でも `raw["source"]: "deal"` と記録される**。

これは **L1-B では修正しない**。理由：
- 設計メモ §6.2 で checker.py は「触らないファイル」として明記
- B-1 改修の責務は「経路移行 + adapter」であり、Finding 構造の調整は別タスク
- L1-A 確立の observations 構造（`source_breakdown`）は `ctx.transactions` 由来で実値化されるため、**集計レベルでは manual_journal が正しくカウントされる**
- Finding 単位の `raw["source"]` は B-4 で観察項目として記録し、必要なら L1-C 以降で扱う

#### 制約 2：partner_master の同名 partner 後勝ち問題

`build_check_context` で生成する `partner_master` は dict であり、同名 partner が存在する場合は **後勝ち** になる。設計メモ §5.1.4 でこの設計を確定済。B-4 観察で同名問題が顕在化したら別タスクで対応。

#### 補足：`ctx.company_id` の型差異について（論点消滅）

着手前チェックで「V1-3-10 `CheckContext.company_id: str` vs V1-3-20 `InvoiceCheckContext.company_id: int`」の型差異が論点として浮上したが、**B-1 改修で `company_id` を `build_check_context` に渡さない**（`build_check_context` のシグネチャに `company_id` 引数が存在せず、内部で `company_info.json` から自動抽出する）ため、**型変換の論点は L1-B の実装範囲から消滅**した。`ctx.company_id` を B-1 側で直接使う場面もない。

---

## §2. 必読ドキュメントと前提

### 2.1 必読ドキュメント（実装着手前）

| 文書 | 役割 |
|---|---|
| 本書（V1-3-20_beta2_D_L1_B_implementation_spec.md） | 実装指示そのもの（Claude Code が実装するための文書） |
| V1-3-20_beta2_D_L1_B_design_memo.md（995 行） | **Single Source of Truth**（設計判断の確定版） |
| V1-3-20_beta2_D_L1_implementation_spec.md（928 行） | L1-A 仕様本体（β2-C 構造の理解、observations 出力構造の参考） |
| V1-3-20_beta2_D_L1_A_completion_log.md（394 行） | L1-A 完結ログ（型の継承元、テスト方針の参考） |

### 2.2 実装環境の前提（運用原則 7・15・16）

- Python 3.12.8、venv、pytest、openpyxl
- PowerShell 環境（`Select-Object -Last 20` 等）
- 文字コード：`PYTHONIOENCODING=utf-8`
- プロジェクトルート：`C:\Users\yuya_\claude\office\office-claude\`

### 2.3 実装の事前条件（GO 時に確認）

実装着手前に Claude Code は以下を確認すること：

- [ ] 本書の全章を通読し、最重要原則（§1.2）を理解した
- [ ] 設計メモ §1 / §6 / §9 を view し、最重要原則の三重配置を確認した
- [ ] `freee_to_context.py` / V1-3-20 `run.py` / V1-3-10 `schema.py` の現物を view し、改修対象の行番号と前提を確認した
- [ ] V1-3-20 `schema.py` / V1-3-20 `checker.py` を view し、**触らないファイル**であることを確認した
- [ ] 現状のテスト一覧を確認し（V1-3-20: 127 tests、V1-3-10: 211 tests が L1-A 完結時点）、改修後の比較基準を把握した
- [ ] **B-4 着手前に実データの所在を確認する**（`data/e2e/` → `tests/e2e/` 移動の影響、§5.0 参照）

---

## §3. B-3 実装指示（partner_master 生成ブロック追加）

### 3.1 改修対象ファイル

`scripts/e2e/freee_to_context.py`（全 614 行、改修対象は `build_check_context` 関数内の 1 箇所）

### 3.2 改修内容の概要

`build_check_context` 関数の **L437 直後**（既存の `partners_cache` 生成の直後）に **`partner_master` 生成ブロック**（約 12 行）を追加する。さらに **L581〜L589** の `CheckContext(...)` 呼び出しに `partner_master=partner_master,` を追加する。

設計メモ §5.1 / §5.1.1 / §5.1.2 / §5.1.3 / §5.1.4 を参照（具体的な疑似コードはそちら）。本書では **完全実装** を提示する。

### 3.3 改修前後の状態

#### 改修前（freee_to_context.py L432〜L437、現物）

```python
    partners_data = (
        partners_payload.get("partners", []) if isinstance(partners_payload, dict) else partners_payload
    ) if partners_payload else []

    partners_cache: dict[int, str] = {p["id"]: p.get("name", "") for p in partners_data if isinstance(p, dict) and "id" in p}
```

#### 改修後（L432〜L437 の直後に追加）

```python
    partners_data = (
        partners_payload.get("partners", []) if isinstance(partners_payload, dict) else partners_payload
    ) if partners_payload else []

    partners_cache: dict[int, str] = {p["id"]: p.get("name", "") for p in partners_data if isinstance(p, dict) and "id" in p}

    # ─ partner_master 生成（L1-B 追加: V1-3-20 / V1-3-10 共通）
    # name → {partner_id, is_invoice_registered} の逆引き辞書を構築する。
    # 同名 partner は後勝ちとなる（設計メモ §5.1.4）。
    # name 解決ロジックは _resolve_partner_name と整合（name → long_name → ""）。
    partner_master: dict[str, dict] = {}
    for p in partners_data:
        if not isinstance(p, dict):
            continue
        name = p.get("name") or p.get("long_name") or ""
        if not name:
            continue
        partner_master[name] = {
            "partner_id": p.get("id"),
            "is_invoice_registered": bool(p.get("qualified_invoice_issuer")),
        }
```

### 3.4 CheckContext 構築の改修（L581〜L589）

#### 改修前（freee_to_context.py L581〜L589、現物）

```python
    ctx = CheckContext(
        company_id=company_id,
        fiscal_year_id=fiscal_year_id,
        period_start=period_start,
        period_end=period_end,
        transactions=all_rows,
        tax_code_master=tax_code_master,
        company_name=company_data["company_name"],
    )
```

#### 改修後

```python
    ctx = CheckContext(
        company_id=company_id,
        fiscal_year_id=fiscal_year_id,
        period_start=period_start,
        period_end=period_end,
        transactions=all_rows,
        tax_code_master=tax_code_master,
        partner_master=partner_master,
        company_name=company_data["company_name"],
    )
```

**変更点**：`partner_master=partner_master,` を 1 行追加（`tax_code_master` の直後、`company_name` の直前）。

### 3.5 重要な設計判断（B-3 での確定事項）

#### 判断 1：partner_id の型は int のまま

`partners_data` の `p.get("id")` は freee API の partner_id（int 型）であり、そのまま str 化せず int で保持する。理由：
- freee API の native 型を尊重
- 不要な変換を避ける（運用原則 13: YAGNI）
- 設計メモ §5.1.3 の疑似コードと整合

#### 判断 2：partner_master の生成位置は「partners_cache 生成直後」

設計メモ §5.1.1 では「partners_cache 生成（L434〜L437）の直後または CheckContext 構築（L581〜L589）の直前」の二択だったが、**partners_cache 生成直後**を採用する。理由：
- partners_data の処理を 1 箇所にまとめる方が読みやすい
- partners_cache と partner_master は同じデータソース（partners_data）を使う
- CheckContext 構築直前に書くと、L581 までの距離が遠くなる

#### 判断 3：name 解決ロジックは `_resolve_partner_name` と完全一致

V1-3-20 run.py の `_resolve_partner_name`（L767〜L771）が `partner.get("name") or partner.get("long_name") or ""` のフォールバック順で name を解決している。**partner_master 生成でも同じ順序を使う**。これにより、partner_master の key が `_resolve_partner_name` の出力と一致し、adapter の逆引きが確実に機能する。

#### 判断 4：空 name のスキップ

name が空文字列（`""`）の場合は dict に登録しない（continue）。理由：
- 空 name は partner として識別できない
- adapter の逆引きで使えない
- 設計メモ §5.1.4 の「空 name は登録しない」と整合

### 3.6 B-3 の完了基準

- [ ] `partner_master` 生成ブロック（~12 行）が L437 直後に追加されている
- [ ] `CheckContext(...)` 呼び出しに `partner_master=partner_master,` が追加されている
- [ ] `partner_master` の構造が `dict[str, dict]` で、各 dict が `{partner_id, is_invoice_registered}` の 2 キーを持つ
- [ ] V1-3-10 の既存 211 tests + 関連テスト（あれば）が **全 PASS**
- [ ] 3 社（3525430 / 12243357 / 10794380）で V1-3-10 を実行し、Finding 件数が 44 / 75 / 37 と完全一致（設計メモ §4.2 B-3 完了基準と整合、L1-A 不変条件 1 とは別の独立した V1-3-10 連続性確認）

### 3.7 B-3 で触らないもの

- schema.py（partner_master フィールドは既に存在、改修不要）
- `partners_cache` の構造（既存の `dict[int, str]`、id → name のままを維持）
- `transform_journal_to_rows` 等の他関数
- import 文（新規 import 不要）

### 3.8 B-3 完了後のテストコマンド

```powershell
$env:PYTHONIOENCODING = "utf-8"
cd C:\Users\yuya_\claude\office\office-claude
.\venv\Scripts\Activate.ps1

# V1-3-10 全テスト実行
python -m pytest skills/verify/V1-3-rule/check-tax-classification/tests/ -v | Select-Object -Last 20

# 期待結果: 127 passed (または既存テスト全 PASS)
```

実機検証は B-4 で 3 社まとめて実施する（B-3 単体での 3 社検証は不要）。


---

## §4. B-1 実装指示（adapter 関数 + Step 4 置換 + observations 動的化）

### 4.1 改修対象ファイル

`skills/verify/V1-3-rule/check-invoice-registration-status/run.py`（全 1129 行、改修対象は 4 箇所）

### 4.2 改修箇所のサマリ

| # | 改修箇所 | 行範囲（現物） | 改修内容 |
|---|---|---|---|
| (1) | `_calculate_source_breakdown` 関数 | L375〜L393 | 引数を `rows` から `transactions` に変更、`raw["source"]` で deals/manual_journals を分岐 |
| (2) | `main()` Step 4（deals → InvoiceCheckRow 正規化） | L972〜L1002 | `build_check_context` + adapter 呼び出しに置換 |
| (3) | adapter 関数 `_build_invoice_check_rows` 新規追加 | L785 直前（`_normalize_deals` の前） | TransactionRow → InvoiceCheckRow の純粋変換関数 |
| (4) | `scope.manual_journals` の動的化 | L1088 | `False` リテラル固定 → `(manual_journals_path is not None)` |

### 4.3 触らないもの（B-1 の絶対制約）

- `InvoiceCheckRow` クラス定義（L121〜L148、9 フィールド固定）
- `classify_transaction()` 関数および 5 分類ロジック（β2-A / β2-B 確定）
- `find_groups()` / FindingGroup 構造（β2-C 確定）
- `MESSAGE_TEMPLATES` / `to_finding` / `to_findings`（checker.py、最重要原則の核心）
- 5 つの dead code 化対象関数（**削除しない、L1-B では残す**）：
  - `_build_partners_map`（L741〜L749）
  - `_build_taxes_map`（L752〜L764）
  - `_resolve_partner_name`（L767〜L771）
  - `_is_qualified_invoice`（L774〜L783）
  - `_normalize_deals`（L786〜L880）
- L1-A で確立した observations の構造とキー（`tax_code_distribution` / `source_breakdown` / `partner_unknown_breakdown`）
- L1-A で確立した observations の出力順序（`partner_unknown_breakdown` → `tax_code_distribution` → `source_breakdown`）
- Step 5 以降（`classify_transaction` 呼び出し / `find_groups` / Excel 出力等）

### 4.4 改修 (3)：adapter 関数 `_build_invoice_check_rows` の追加

#### 4.4.1 配置場所

`_normalize_deals` 関数（L786〜L880）の **直前**（L785 のセクションコメント `# deals → InvoiceCheckRow 正規化`（L738）と `_normalize_deals` の間）に新規セクションを追加する。

具体的には：
- L738 の既存コメント `# deals → InvoiceCheckRow 正規化` の上に、新規セクション `# TransactionRow → InvoiceCheckRow adapter（L1-B 追加）` を挿入
- adapter 関数本体は `_normalize_deals` の直前に配置

#### 4.4.2 完全実装

```python
# ─────────────────────────────────────────────────────────────────────
# TransactionRow → InvoiceCheckRow adapter（L1-B 追加）
# ─────────────────────────────────────────────────────────────────────

def _build_invoice_check_rows(ctx) -> list["InvoiceCheckRow"]:  # type: ignore[no-untyped-def]
    """V1-3-10 共通の TransactionRow を V1-3-20 の InvoiceCheckRow に変換する。

    本関数は **純粋な変換のみ** を担う（L1-B 設計確定）：
        - 入力: ctx.transactions（list[TransactionRow]）+ ctx.partner_master
        - 出力: list[InvoiceCheckRow]
        - 条件分岐や正規化ロジックは持たない
        - I/O フリー（運用原則 P1）
        - 決定論的（同じ ctx に対して常に同じ rows を返す）

    入力は deals 由来 / manual_journals 由来の TransactionRow が混在する。
    両方とも同じマッピングで InvoiceCheckRow に変換する。

    9 フィールドのマッピング:
        - wallet_txn_id ← tr.wallet_txn_id
        - transaction_date ← tr.transaction_date
        - partner ← tr.partner
        - description ← tr.description
        - tax_label ← tr.tax_label
        - debit_amount ← tr.debit_amount
        - credit_amount ← tr.credit_amount
        - is_qualified_invoice ← ctx.partner_master[tr.partner]["is_invoice_registered"]
            （partner_master に未登録の場合は False）
        - tax_code ← tr.raw.get("tax_code") を int 化
            （None / 変換失敗の場合は None）

    Args:
        ctx: V1-3-10 共通の CheckContext。
            必要なフィールド: transactions, partner_master。

    Returns:
        InvoiceCheckRow のリスト。順序は ctx.transactions の順序を保持する。
    """
    rows: list[InvoiceCheckRow] = []
    partner_master = ctx.partner_master if ctx.partner_master else {}

    for tr in ctx.transactions:
        # tax_code の int 化（_normalize_deals L839〜L845 のロジックを踏襲）
        tax_code_raw = (tr.raw or {}).get("tax_code")
        if tax_code_raw is None:
            tax_code: Optional[int] = None
        else:
            try:
                tax_code = int(tax_code_raw)
            except (TypeError, ValueError):
                tax_code = None

        # is_qualified_invoice の解決
        # partner_master の key は partner name（_resolve_partner_name 由来）
        partner_info = partner_master.get(tr.partner) or {}
        is_qualified = bool(partner_info.get("is_invoice_registered", False))

        rows.append(
            InvoiceCheckRow(
                wallet_txn_id=tr.wallet_txn_id,
                transaction_date=tr.transaction_date,
                partner=tr.partner,
                description=tr.description,
                tax_label=tr.tax_label,
                debit_amount=tr.debit_amount,
                credit_amount=tr.credit_amount,
                is_qualified_invoice=is_qualified,
                tax_code=tax_code,
            )
        )

    return rows
```

#### 4.4.3 adapter の絶対制約（最重要）

**adapter は「変換だけ」に徹する。ロジックを持たせない。**

以下は **すべて禁止**：

| 禁止事項 | 理由 |
|---|---|
| 条件分岐で行をスキップ（filter） | `_calculate_source_breakdown` の `total = len(transactions)` と整合しなくなる |
| TransactionRow の値を加工（金額調整・partner 名変換等） | 入力データの意味を変えると判定層の挙動が変わる |
| partner_master 未登録時の代替処理（外部 API 呼び出し等） | I/O フリー原則違反 + 決定論性違反 |
| tax_code の正規化（経過措置コード判定等） | 判定層（classify_transaction）の責務 |
| Finding 生成 / 分類 | checker.py / `classify_transaction` の責務 |

「変換だけ」とは、**TransactionRow の各フィールドを InvoiceCheckRow の対応フィールドに移し替える + ctx.partner_master から `is_qualified_invoice` を逆引きする** という 2 種類のみの操作を指す。

### 4.5 改修 (1)：`_calculate_source_breakdown` の引数変更

#### 4.5.1 改修前（run.py L375〜L393、現物）

```python
def _calculate_source_breakdown(rows: list) -> dict[str, int]:
    """observations.source_breakdown 用の集計を返す（L1-A 暫定固定値）。

    L1-A 暫定: deals 固定として扱う（manual_journals 未取り込み）。
    L1-B（manual_journals / 共通 context 移行）で source 由来で分岐する構造に拡張する。

    Args:
        rows: InvoiceCheckRow のリスト（main() で _normalize_deals が生成済み）

    Returns:
        {"deals_rows": N, "manual_journals_rows": 0, "total": N}
    """
    return {
        "deals_rows": len(rows),
        "manual_journals_rows": 0,
        "total": len(rows),
    }
```

#### 4.5.2 改修後（完全実装）

```python
def _calculate_source_breakdown(transactions: list) -> dict[str, int]:
    """observations.source_breakdown 用の集計を返す（L1-B: source 由来で分岐）。

    L1-A 暫定固定（manual_journals_rows: 0）を廃止し、TransactionRow.raw["source"]
    で deals 由来 / manual_journals 由来をカウントする。

    入力は ctx.transactions（list[TransactionRow]）であり、InvoiceCheckRow ではない。
    InvoiceCheckRow は raw フィールドを持たないため、source 判定ができない。

    Args:
        transactions: ctx.transactions（list[TransactionRow]）。
            各 TransactionRow は raw["source"] を持つ前提（freee_to_context.py が必ず付与）。

    Returns:
        {"deals_rows": N, "manual_journals_rows": M, "total": N + M}
    """
    deals_rows = 0
    manual_journals_rows = 0
    for tr in transactions:
        source = (tr.raw or {}).get("source")
        if source == "manual_journal":
            manual_journals_rows += 1
        else:
            deals_rows += 1
    return {
        "deals_rows": deals_rows,
        "manual_journals_rows": manual_journals_rows,
        "total": deals_rows + manual_journals_rows,
    }
```

#### 4.5.3 改修の核心

- **引数名**：`rows` → `transactions`（型コメントは `list`、内部は TransactionRow）
- **判定軸**：`tr.raw.get("source")` で `"manual_journal"` を判定
  - `"manual_journal"` 以外（"deal" を含む / None / 想定外文字列）はすべて `deals_rows` にカウント
  - `_normalize_deals` 由来の TransactionRow には source を持たせていない可能性があるが、L1-B 改修後は `_normalize_deals` を経由しない（B-1 改修で Step 4 が `build_check_context` 経由になる）
- **`raw is None` の防御**：`(tr.raw or {})` で None ガード（schema.py L272 で `raw: Optional[dict] = None` がデフォルト）

### 4.6 改修 (2)：`main()` Step 4 の置換

#### 4.6.1 改修前（run.py L972〜L1002、現物）

```python
    # Step 4: deals → InvoiceCheckRow 正規化
    try:
        partners_path = base_dir / "partners_all.json"
        taxes_path = base_dir / "taxes_codes.json"
        deals_path = base_dir / f"deals_{period_start}_to_{period_end}.json"

        with partners_path.open("r", encoding="utf-8") as f:
            partners_json = json.load(f)
        with taxes_path.open("r", encoding="utf-8") as f:
            taxes_json = json.load(f)
        with deals_path.open("r", encoding="utf-8") as f:
            deals_json = json.load(f)

        partners_map = _build_partners_map(partners_json)
        taxes_map = _build_taxes_map(taxes_json)

        rows = _normalize_deals(deals_json, partners_map, taxes_map)
    except Exception as e:
        _emit_error(
            error_code="UNEXPECTED",
            message=f"deals 正規化に失敗: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "error_stage": "normalize",
            },
        )
        return EXIT_UNEXPECTED
```

#### 4.6.2 改修後（完全実装）

```python
    # Step 4: build_check_context 経由で TransactionRow を取得し、adapter で InvoiceCheckRow に変換（L1-B）
    sink = sys.stderr if args.verbose else io.StringIO()
    manual_journals_path: Optional[Path] = None  # B-1 で scope 動的化のため保持
    try:
        with contextlib.redirect_stdout(sink):
            sys.path.insert(0, str(PROJECT_ROOT))
            from scripts.e2e.freee_to_context import build_check_context

            # manual_journals は対象月以前のすべてを対象とするため、freee 側で取得済みのファイルを参照
            mj_candidate = base_dir / f"manual_journals_{period_start}_to_{period_end}.json"
            if mj_candidate.exists() and mj_candidate.stat().st_size > 0:
                manual_journals_path = mj_candidate

            ctx = build_check_context(
                deals_path=base_dir / f"deals_{period_start}_to_{period_end}.json",
                partners_path=base_dir / "partners_all.json",
                account_items_path=base_dir / "account_items_all.json",
                company_info_path=base_dir / "company_info.json",
                taxes_codes_path=base_dir / "taxes_codes.json",
                manual_journals_path=manual_journals_path,
            )

        rows = _build_invoice_check_rows(ctx)
    except Exception as e:
        _emit_error(
            error_code="UNEXPECTED",
            message=f"CheckContext 構築または adapter 変換に失敗: {type(e).__name__}: {e}",
            extra={
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "error_stage": "normalize",
            },
        )
        return EXIT_UNEXPECTED
```

#### 4.6.3 改修の核心

##### 改修内容

| 観点 | 改修前 | 改修後 |
|---|---|---|
| 入力 | partners.json / taxes.json / deals.json を直接読み込み | `build_check_context` 経由で 5+1 ファイルを統合読み込み |
| 中間表現 | partners_map / taxes_map（dict）+ deals_json | CheckContext（V1-3-10 共通スキーマ）|
| 変換 | `_normalize_deals(deals_json, partners_map, taxes_map)` | `_build_invoice_check_rows(ctx)` |
| 出力 | `rows: list[InvoiceCheckRow]` | `rows: list[InvoiceCheckRow]`（同型） |
| stdout 抑制 | なし | `with contextlib.redirect_stdout(sink):`（V1-3-10 と整合） |

##### 重要事項

1. **import の位置**：`from scripts.e2e.freee_to_context import build_check_context` は **main() 内ローカル import**（V1-3-10 と整合）。モジュール先頭に上げない。
2. **`sys.path.insert`**：PROJECT_ROOT を追加（V1-3-10 L424 と同パターン）。
3. **`contextlib` / `io` の追加 import**：モジュール先頭の import 文に `contextlib` と `io` を追加する必要がある。
4. **`manual_journals_path` の保持**：(4) `scope.manual_journals` 動的化で参照するため、try 内で確定した値を try 外で使えるようにする。具体的には `try:` の前に `manual_journals_path: Optional[Path] = None` を宣言する。
5. **items / sections / tags は渡さない**：設計メモ §5.2.3 通り、V1-3-20 では使わない。
6. **必須引数（5 つ）**：`build_check_context` のシグネチャ（freee_to_context.py L374〜L383）に従い、以下 5 つは必須：`deals_path` / `partners_path` / `account_items_path` / `company_info_path` / `taxes_codes_path`。**ファイル名は実装上の規約と完全一致**（`account_items_all.json` / `company_info.json` / `taxes_codes.json`）。
7. **`period_start` / `period_end` / `company_id` は渡さない**：`build_check_context` のシグネチャに**存在しない**。CheckContext の `period_start` / `period_end` / `company_id` / `fiscal_year_id` は内部で `company_info.json` から自動抽出される。引数として渡そうとすると `TypeError` になる。
8. **Path 型のまま渡す**：`build_check_context` のシグネチャは `Path` 型を要求する。`str()` 変換は不要。`base_dir / "..."` の Path オブジェクトをそのまま渡す（V1-3-10 run.py L449〜L459 と整合）。
9. **`manual_journals_path` は Optional[Path]**：`Path | None` で渡す。`str()` 変換は不要。

### 4.7 改修 (4)：`scope.manual_journals` の動的化

#### 4.7.1 改修前（run.py L1088、現物）

```python
            "scope": {"deals": True, "manual_journals": False},
```

#### 4.7.2 改修後

```python
            "scope": {"deals": True, "manual_journals": manual_journals_path is not None},
```

#### 4.7.3 改修の核心

- 改修 (2) で `main()` 関数内に `manual_journals_path: Optional[Path] = None` を宣言済
- `manual_journals_path is not None` を直接 scope に書き込む
- リテラル `False` の固定値を廃止

### 4.8 必要な import 追加（モジュール先頭）

V1-3-20 run.py の現状の import 文（L45〜L58）に以下を追加する：

```python
import contextlib
import io
```

`Optional` は既に L58 でインポートされている。`Path` は L57 でインポートされている。

### 4.9 dead code の扱い

以下の 5 関数は **B-1 完了後、main() から呼ばれなくなる** が、**削除しない**。L1-B では dead code として残す（設計メモ §6.6）。

- `_build_partners_map`（L741〜L749）
- `_build_taxes_map`（L752〜L764）
- `_resolve_partner_name`（L767〜L771）
- `_is_qualified_invoice`（L774〜L783）
- `_normalize_deals`（L786〜L880）

理由：
- B-1 改修の責務は経路移行のみ
- 削除すると差分が大きくなり、レビューと検証のコストが上がる
- L1-B 完了後、別タスクで dead code 整理を行う（設計メモ §6.6）

### 4.10 B-1 の完了基準

- [ ] adapter 関数 `_build_invoice_check_rows` が `_normalize_deals` の直前に新規追加されている
- [ ] adapter は変換のみ（条件分岐で行スキップ・正規化ロジック・外部 API 呼び出しなし）
- [ ] `main()` Step 4 が `build_check_context` + adapter 呼び出しに置換されている
- [ ] `_calculate_source_breakdown` の引数が `transactions` に変更され、source 由来で分岐している
- [ ] L1088 の `scope.manual_journals` が `manual_journals_path is not None` に変更されている
- [ ] 5 つの dead code 関数は削除されていない（コメントアウトもしない）
- [ ] `contextlib` / `io` の import が追加されている
- [ ] V1-3-20 既存テストが全 PASS（127 tests passed が L1-A 完結時点）
- [ ] 観察事項として、V1-3-10 の 211 tests も PASS（B-3 改修の影響を再確認）

### 4.11 B-1 完了後のテストコマンド

```powershell
$env:PYTHONIOENCODING = "utf-8"
cd C:\Users\yuya_\claude\office\office-claude
.\venv\Scripts\Activate.ps1

# V1-3-20 全テスト実行
python -m pytest skills/verify/V1-3-rule/check-invoice-registration-status/tests/ -v | Select-Object -Last 30

# V1-3-10 全テスト実行（B-3 + B-1 両方の影響を確認）
python -m pytest skills/verify/V1-3-rule/check-tax-classification/tests/ -v | Select-Object -Last 20

# 期待結果: 両方とも既存テスト全 PASS
```

実機検証は B-4 で実施する。

---

## §5. B-4 実装指示（3 社実機検証 + 不変条件確認）

### 5.0 B-4 着手前の事前確認（実データ所在）

直近の作業で `data/e2e/` 配下のファイルが `tests/e2e/` 配下に移動した可能性がある（workspace_cleanup_20260501.md §2.3 で実施、3525430 / 12243357 / 10794380 の実データの所在は要確認）。

B-4 着手前に Claude Code は以下を確認する：

#### 5.0.1 実データの所在確認

```powershell
# data/e2e/ 配下に各社ディレクトリが存在するか確認
ls C:\Users\yuya_\claude\office\office-claude\data\e2e\

# tests/e2e/ 配下に各社ディレクトリが存在するか確認
ls C:\Users\yuya_\claude\office\office-claude\tests\e2e\
```

#### 5.0.2 確認結果に応じた対応

| 状態 | 対応 |
|---|---|
| `data/e2e/{company_id}/...` に実データが存在 | そのまま B-4 検証に進む（コード変更不要） |
| `tests/e2e/{company_id}/...` のみに存在 | **実装を停止し、悠皓さんに報告**（PROJECT_ROOT override の方針判断を仰ぐ） |
| 両方に存在 | 悠皓さんに最新版の所在を確認 |
| どちらにも存在しない | 実装を停止し、データ復元 or 再取得の方針判断を仰ぐ |

**Claude Code は独自に PROJECT_ROOT override 等のコード変更を行わない**。B-1 改修との競合を避けるため、データ所在問題は B-4 着手時点で悠皓さんに判断を仰ぐ。

### 5.1 検証対象

| 会社ID | 期間 | 期待 V1-3-20 Finding 件数（β2-C 連続性） |
|---|---|---|
| 3525430 | 2025-12 累積（期首〜2025-12） | 設計メモ §4.2 / β2-C 観察ログを参照（L1-A と同件数を維持） |
| 12243357 | 設計メモ指定の期間 | L1-A と同件数を維持 |
| 10794380 | 設計メモ指定の期間 | L1-A と同件数を維持 |

具体的な期間と期待件数は L1-A 完結ログまたは設計メモ §4.2 を参照する（本書は数値を引用しない、参照のみ）。

### 5.2 検証コマンド（3 社共通）

```powershell
$env:PYTHONIOENCODING = "utf-8"
cd C:\Users\yuya_\claude\office\office-claude
.\venv\Scripts\Activate.ps1

# 例: 3525430 / 2025-12 累積
python -m skills.verify.V1-3-rule.check-invoice-registration-status.run `
    --company-id 3525430 `
    --target-month 2025-12

# JSON 出力をファイルに保存して検証
python -m skills.verify.V1-3-rule.check-invoice-registration-status.run `
    --company-id 3525430 `
    --target-month 2025-12 > out_3525430.json

# 観察項目を抽出
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); print(json.dumps(d.get('observations', {}), ensure_ascii=False, indent=2))"
```

V1-3-10 の検証も同様：

```powershell
python -m skills.verify.V1-3-rule.check-tax-classification.run `
    --company-id 3525430 `
    --target-month 2025-12 > v1310_out_3525430.json
```

### 5.3 検証項目（実機 3 社で確認）

#### 5.3.1 V1-3-20 連続性（β2-C）

各社で以下を確認：

| 検証項目 | 期待 |
|---|---|
| `findings_count` の妥当性 | L1-A 観察ログと同件数（または合理的に説明可能な差分） |
| `groups` の構造 | `[QUALIFIED_BUT_TRANSITIONAL_TAX, NONQUALIFIED_BUT_FULL_DEDUCTION_TAX, PARTNER_UNKNOWN]` の固定順 |
| `groups[].findings_count` | classification_counts の対応値と整合 |
| Finding の `message` 整合 | MESSAGE_TEMPLATES が正しく適用されている（取引先 / 税区分 / 借方金額 / 修正アクション） |
| Finding の `raw` 8 フィールド | tax_label / tax_code / debit_amount / partner / description / transaction_date / source / is_qualified_invoice |

#### 5.3.2 V1-3-10 連続性（B-3 改修の影響確認）

| 検証項目 | 期待 |
|---|---|
| Finding 件数 | L1-A 完結時の 44 / 75 / 37（3525430 / 12243357 / 10794380） |
| Finding の構造 | tc_code / sub_code / severity / area / sort_priority 等が L1-A と同じ |

#### 5.3.3 境界線の切り替え（L1-A → L1-B）

各社で以下を確認：

| 項目 | L1-A 完結時 | L1-B 完了後（期待） |
|---|---|---|
| `scope.manual_journals` | `false` | `true`（manual_journals ファイルが存在する場合） |
| `observations.source_breakdown.manual_journals_rows` | `0` | 実値（>= 0、manual_journals が空でなければ > 0） |
| `observations.source_breakdown.deals_rows` | `len(rows)` | deals 由来 TransactionRow 数 |
| `observations.source_breakdown.total` | `len(rows)` | `deals_rows + manual_journals_rows` |

#### 5.3.4 manual_journals 流入確認

3 社のうち、少なくとも **1 社で `manual_journals_rows > 0`** になることを確認する。これにより、manual_journals が実際に流入していることを実機レベルで確認できる。

もし全 3 社で `manual_journals_rows == 0` の場合、以下のいずれかを確認：
- `manual_journals_*.json` が base_dir に存在するか
- 存在する場合、ファイルサイズが > 0 か
- 中身に対象期間内の取引が含まれているか

### 5.4 不変条件の確認（§3.3 不変条件 + 補完項目）

設計メモ §3.3 の不変条件 5 項目について、本書では **明示的な検証コマンド** を提供する。

#### 5.4.1 不変条件 1：β2-C 構造の維持

```powershell
# groups の数と順序を確認（3 つ、QBT → NBF → PU の順）
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); print([g['classification'] for g in d.get('groups', [])])"

# 期待出力: ['qualified_but_transitional_tax', 'nonqualified_but_full_deduction_tax', 'partner_unknown']
```

#### 5.4.2 不変条件 2：classification_counts の sum 整合（補完項目）

```powershell
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); cc = d.get('classification_counts', {}); print('sum:', sum(cc.values()), 'total tx:', d.get('observations', {}).get('source_breakdown', {}).get('total', 0))"

# 期待: sum >= 0 で、total と論理整合（sum は 6 値の合計、total は TransactionRow 数）
# 厳密な等号は成立しない（NONE もカウントされるため）が、sum > total はバグ
```

#### 5.4.3 不変条件 3：MESSAGE_TEMPLATES の境界（補完項目）

```powershell
# Finding の classification が EXPECTED_* / NONE になっていないことを確認
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); fcs = [f.get('classification') for g in d.get('groups', []) for f in g.get('findings', [])]; bad = [c for c in fcs if c in ['expected_transitional_tax', 'expected_full_deduction_tax', 'none']]; print('bad classifications:', bad)"

# 期待出力: bad classifications: []
# bad が空でない場合は MESSAGE_TEMPLATES KeyError が出るはずなので、本来到達しない
```

#### 5.4.4 不変条件 4：L1-A observations の構造維持

```powershell
# observations のキー構造を確認
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); obs = d.get('observations', {}); print(list(obs.keys()))"

# 期待出力: ['partner_unknown_breakdown', 'tax_code_distribution', 'source_breakdown']
```

#### 5.4.5 不変条件 5：observations の出力順序（補完項目）

```powershell
# JSON のキー順序を確認（Python dict は挿入順を保持）
python -c "import json; from collections import OrderedDict; d = json.load(open('out_3525430.json', encoding='utf-8'), object_pairs_hook=OrderedDict); print(list(d.get('observations', OrderedDict()).keys()))"

# 期待出力: ['partner_unknown_breakdown', 'tax_code_distribution', 'source_breakdown']
```

### 5.5 観察項目（修正対応ではなく記録のみ）

#### 5.5.1 manual_journal 由来 Finding の raw["source"] 観察

```powershell
# manual_journal 由来の TransactionRow が adapter を通って Finding になった場合、raw["source"] が "deal" 固定で記録される（既知の制約、§1.5 制約 1）
# B-4 では「raw["source"] が "deal" だが、実際は manual_journal 由来である Finding」が存在することを観察として記録する。修正対応は L1-C 以降で判断
python -c "import json; d = json.load(open('out_3525430.json', encoding='utf-8')); sources = [f.get('raw', {}).get('source') for g in d.get('groups', []) for f in g.get('findings', [])]; from collections import Counter; print('Finding source distribution:', Counter(sources))"

# 期待: すべて "deal"（既知の制約、L1-B では修正しない）
```

#### 5.5.2 partner_master の同名 partner 後勝ち観察

```powershell
# partners_data の partner 名が重複していないかを確認
python -c "import json; from collections import Counter; p = json.load(open('C:/Users/yuya_/claude/office/office-claude/data/companies/3525430/partners_all.json', encoding='utf-8')); names = [item.get('name') or item.get('long_name') or '' for item in p.get('partners', p) if isinstance(item, dict)]; dup = [n for n, c in Counter(names).items() if c > 1 and n]; print('Duplicate partner names:', dup)"

# 期待: 通常は重複なし。重複が多数の場合は L1-C 以降で別タスク化
```

### 5.6 B-4 の完了基準

- [ ] 3 社（3525430 / 12243357 / 10794380）で V1-3-20 を実機実行し、JSON 出力を取得
- [ ] V1-3-20 連続性（β2-C）：findings_count / groups 構造 / message 整合がすべて期待通り
- [ ] V1-3-10 連続性：3 社で Finding 件数が L1-A 完結時と完全一致（44 / 75 / 37）
- [ ] 境界線切り替え：3 社で `scope.manual_journals` と `source_breakdown` が L1-B 期待値に切り替わっている
- [ ] manual_journals 流入確認：少なくとも 1 社で `manual_journals_rows > 0`
- [ ] L1-A observations 構造維持：3 社で観察キー構造と出力順序が L1-A と完全一致
- [ ] 不変条件 1〜5 のすべてが 3 社で確認できる
- [ ] 観察項目（5.5.1 / 5.5.2）の記録が完了

### 5.7 B-4 で停止する条件（設計メモ §4.3 と整合）

以下のいずれかが発生したら、**実装指示書の改修を停止し、悠皓さんに報告する**：

| 停止条件 | 想定原因 |
|---|---|
| 3 社のうち 1 社でも V1-3-20 Finding 件数が L1-A から大幅に変動（差分が説明できない） | β2-C 構造の破壊、判定層への意図しない影響 |
| classification_counts の sum が source_breakdown.total を大きく超える | カウントロジックの破綻 |
| Finding の classification に EXPECTED_* / NONE が出現 | MESSAGE_TEMPLATES の境界違反 |
| observations の出力順序が変わる | dict 挿入順序の意図しない変更 |
| V1-3-10 の Finding 件数が 44 / 75 / 37 から変動 | B-3 改修が V1-3-10 に意図しない影響 |
| すべての社で `manual_journals_rows == 0` で、かつ `manual_journals_*.json` が存在する | adapter / build_check_context の連携不具合 |

---

## §6. 想定外論点への対処方針

### 6.1 実装中に「設計メモに書かれていない論点」が出たとき

Claude Code は **独自判断で実装を進めず**、必ず以下のいずれかを行う：

1. **本書（実装指示書）に既に書かれているかを確認**（§3〜§5 を再 view）
2. 書かれていない場合、**実装を停止し、悠皓さんに報告**（運用原則 12）

#### 想定される「想定外論点」の例

- 既存テストが PASS しない（テストファイル自体の修正が必要に見える場合 → これは構造変更で許可される、運用原則 5）
- TransactionRow に想定外のフィールド値がある（None / 空文字 / 想定外型）
- partner_master の生成で重複 name が大量に発生する
- `build_check_context` の戻り値の型が想定と異なる
- `manual_journals_*.json` のフォーマットが想定と異なる

### 6.2 GO フローと独自判断の境界（運用原則 15）

タスク境界（B-3 完了 / B-1 完了 / B-4 完了）で **必ず GO を求める**。

実装中に推測で進めない（運用原則 6）：
- 「設計メモに書いてあるから」を理由に view を後回しにしない
- 「たぶんこうなっているはず」で実装しない
- 不明な点は推測で埋めず、本書または設計メモを参照する

### 6.3 既存テストの扱い（運用原則 5）

B-3 / B-1 改修により、既存テストの **構造的書き換え** が必要になる場合がある（例：Step 4 のモック構造が変わる）。これは運用原則 5 で許可されている：

> 構造変更での既存テスト書き換え許可

ただし、以下は **禁止**：
- テストの期待値（findings_count / groups 等）を恣意的に変更する
- L1-A で確立した不変条件を緩和するテスト変更

テスト書き換えが必要な場合、変更内容を **完了報告に明記**する。

---

## §7. 完了報告フォーマット

実装完了時、Claude Code は以下のフォーマットで報告する：

```
## V1-3-20 β2-D L1-B 実装完了報告

### B-3 完了状態
- [ ] partner_master 生成ブロックを freee_to_context.py L437 直後に追加（行数: ~12 行）
- [ ] CheckContext 構築に partner_master=partner_master を追加
- [ ] V1-3-10 既存 211 tests PASS
- [ ] 3 社で V1-3-10 Finding 件数 44 / 75 / 37 完全一致

### B-1 完了状態
- [ ] adapter 関数 _build_invoice_check_rows を新規追加（変換のみ、ロジックなし）
- [ ] main() Step 4 を build_check_context + adapter 呼び出しに置換
- [ ] _calculate_source_breakdown を transactions 引数に変更
- [ ] scope.manual_journals を動的化
- [ ] dead code 5 関数は削除せず残存
- [ ] V1-3-20 既存 127 tests PASS
- [ ] V1-3-10 既存 211 tests PASS（B-3 影響再確認）

### B-4 検証状態
- [ ] 3 社実機実行完了
- [ ] V1-3-20 連続性: findings_count / groups / message 整合 OK
- [ ] V1-3-10 連続性: 44 / 75 / 37 完全一致
- [ ] 境界線切り替え: scope.manual_journals が true 化、source_breakdown 実値化
- [ ] manual_journals 流入: 少なくとも 1 社で manual_journals_rows > 0
- [ ] 不変条件 1〜5 すべて確認

### 観察項目
- raw["source"] 分布: ...（5.5.1 結果）
- 同名 partner 観察: ...（5.5.2 結果）

### 想定外論点（あれば）
- ...

### テスト書き換えがあった場合の記録
- ファイル名: ...
- 書き換え理由: ...
- 既存不変条件への影響: ...

### 次のセッションへの引き継ぎ事項
- ...
```

---

## §8. 末尾原則（再掲）

### 8.1 最重要原則

```
L1-B は TransactionRow への完全移行ではない。
V1-3-20 の判定層は InvoiceCheckRow のまま維持し、
入力経路だけを build_check_context + adapter に寄せる。
```

### 8.2 adapter の絶対制約

```
adapter は「変換だけ」に徹する。
ロジックを持たせない。
```

### 8.3 L1-B の本質

```
L1-A：作る
L1-B：繋ぐ（bridge）
```

実装規模は ~70 行追加 + 検証で完了する。「もっと書くべきことがあるはず」と思って詳細化しないこと。設計メモ §6 の「触らないもの」を守り、本書の §3〜§5 の指示を**そのまま**実装することが、L1-B 成功の唯一の道筋である。

---

**本書終わり。実装着手は §2.3 の事前条件を満たしてから開始すること。**
