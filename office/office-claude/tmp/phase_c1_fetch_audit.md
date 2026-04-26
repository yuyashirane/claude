# Phase C-1 クラスタ A 調査レポート — fetch 層 文脈情報総点検

**作成日**: 2026-04-25
**スコープ**: 検証③(2026-04-25)で違和感が出た項目とその周辺に限定。網羅的調査は行わない。
**目的**: 既存 Finding をスタッフが読み解くための文脈情報を補完するため、fetch 層で取り切れていない情報を事実ベースで把握する。

---

## §0. 調査対象の限定

検証③で顕在化した違和感は 2 件:

1. **アントレッド A5 人件費**: K列(品目)が None。freee 上は品目タグに「健康保険料(事業主負担分)」が入っているはず → **deals 由来 detail の品目情報が落ちている**
2. **キャラクターアニメ 子行 J〜N列空欄**: 頻度未把握 → **manual_journals 由来 detail の文脈情報の取得有無**

上記に直接関係する 2 関数とその上流(freee_fetch.py のマスタ取得)に調査を限定した。
checker / Finding 構造 / observation 文言 / 他カラム(取引先列の左詰め等)は調査対象外。

---

## §1. 関係コードの所在

| 層 | ファイル | 該当箇所 | 役割 |
|---|---|---|---|
| fetch | [scripts/e2e/freee_fetch.py](scripts/e2e/freee_fetch.py) | merge_deals_pages / normalize_partners / normalize_taxes_codes / account_items 取得 | freee API レスポンスの取得・キャッシュ JSON 生成 |
| transform | [scripts/e2e/freee_to_context.py:143](scripts/e2e/freee_to_context.py:143) | `transform_deal_to_rows` | deal → TransactionRow リストへ展開 |
| transform | [scripts/e2e/freee_to_context.py:238](scripts/e2e/freee_to_context.py:238) | `transform_journal_to_rows` | manual_journal → TransactionRow リストへ展開 |
| schema | skills/verify/V1-3-rule/check-tax-classification/schema.py:265-267 | `TransactionRow.item / memo_tag / notes` | オプションフィールド(default=None) |

---

## §2. freee API レスポンスに含まれるが取得していないフィールド

### 2.1 deals API (検証③の主因)

実データ(`data/e2e/3525430/2025-12/deals_2025-04_to_2025-12.json` 他)で確認した detail のキー:

```
['account_item_id', 'amount', 'description', 'entry_side', 'id',
 'item_id', 'section_id', 'tag_ids', 'tax_code', 'vat']
```

- **detail 直下に `item_id / section_id / tag_ids` の数値 ID は存在する**
- **しかし `item_name / section_name / tag_names` は含まれない** (deals API は名前を返さない仕様)
- `transform_deal_to_rows` は `item_id / section_id / tag_ids` を `raw` にも入れていない (L218-227)、 `TransactionRow.item / memo_tag` にも渡していない (L208-228) → **TransactionRow.item / memo_tag / notes は常に None になる**

**これがアントレッド A5 K列 None の直接原因**。

### 2.2 manual_journals API (検証③の副因)

実データ(`data/e2e/12243357/2025-07/manual_journals_2024-08_to_2025-07.json`)で確認した detail のキー:

```
['account_item_id', 'amount', 'description', 'entry_side', 'id',
 'item_id', 'item_name', 'partner_code', 'partner_id',
 'partner_long_name', 'partner_name',
 'section_id', 'section_name',
 'tag_ids', 'tag_names', 'tax_code', 'vat']
```

- **manual_journals は detail に `*_name` 系を含む** (deals と異なる仕様)
- `transform_journal_to_rows` は `item_name / tag_names` を TransactionRow に渡している (L302-316)
- ただし `section_name` は raw に入れているのみで TransactionRow には未マッピング (L331)
- `partner_name` は detail.partner_name → cache 逆引きの順で解決済み (L289-294)

### 2.3 fetch 層に master 取得が無い

`data/e2e/{company}/{period}/` の master 系 JSON:

```
3525430/2025-12: account_items_all.json, partners_all.json, taxes_codes.json
10794380/2025-12: 同上
12243357/2025-07: 同上
```

- **`items_all.json` / `sections_all.json` / `tags_all.json` は存在しない**
- freee_fetch.py に items/sections/tags マスタ取得処理が無い (Grep "items|sections|tags" → account_items のコメント1件のみヒット)
- → deals 由来の `item_id / section_id / tag_ids` を名前解決する手段が現状無い

---

## §3. TransactionRow スキーマとの対応関係

| TransactionRow フィールド | deals(transform_deal_to_rows) | manual_journals(transform_journal_to_rows) |
|---|---|---|
| `partner` | deal.partner_id → cache 逆引き(deal レベル共通) | detail.partner_name → cache 逆引き |
| `item` (Optional) | **未マッピング (常に None)** | detail.item_name (空なら None) |
| `memo_tag` (Optional) | **未マッピング (常に None)** | detail.tag_names を「、」結合 |
| `notes` (Optional) | **未マッピング (常に None)** | **未マッピング (常に None)** |
| `description` | detail.description | detail.description |

**ギャップ**:
1. **deals 由来は item / memo_tag / notes すべて None** — 検証③ K列 None の直接原因
2. **manual_journals 由来も notes は None** (description はあるが「備考」相当の `notes` は別欄として未充填)
3. deals 由来で section_name(部門) を埋めるには items/sections マスタ fetch が必要

---

## §4. null 率測定 (検証③の対象 3 社)

### 4.1 3525430 アントレッド株式会社 (2025-04 〜 2025-12)

```
deals=1724  deal.partner=78.1%
details=2064
  item_id set:    63.6%   ← raw にも未保持、TransactionRow.item は常に None
  section_id set: 0.0%
  tag_ids set:    0.0%
  description set: 21.9%
```

**重要**: A5 人件費の K列 None は、`item_id` 自体は freee 側に存在する(63.6%)が、fetch→transform で落ちている結果である。検証③で対象になった行は item_id を持っているはず(健康保険料の品目タグ)。

### 4.2 10794380 株式会社デイリーユニフォーム (2025-06 〜 2025-12)

```
deals=2054  deal.partner=25.9%
details=2284
  item_id set:    18.3%
  section_id set: 0.0%
  tag_ids set:    0.0%
  description set: 74.8%
```

deal レベル partner が 25.9% と低く、description が 74.8% と高い。description で文脈を補えるケースが多い会社。

### 4.3 12243357 キャラクターアニメーションスタジオ株式会社 (2024-08 〜 2025-07)

deals は 0件 (manual_journals 主体の運用)。

```
manual_journals=1454  details=3032
  partner_id:   4.1%
  partner_name: 4.1%
  item_name:    1.0%
  section_name: 0.0%
  tag_names:    0.0%
  description:  31.9%
```

**子行 J〜N列空欄の頻度: 概算で 90% 以上**。これは fetch / transform の不具合ではなく、**そもそも freee 側で文脈情報がほぼ入力されていない会社**である。description のみが 31.9% で唯一の文脈源。

---

## §5. クラスタ A の結論

### 落ちている文脈情報 (実装で取り切れる)

| 項目 | 取れる元 | 落ちている箇所 | 影響会社 |
|---|---|---|---|
| **deals 由来 item 名** | detail.item_id + items master(要新設) | transform_deal_to_rows で未マッピング + master fetch 自体が無い | アントレッド(63.6%)、デイリー(18.3%) |
| deals 由来 section 名 | detail.section_id + sections master(要新設) | 同上 | 0% (実データに section_id 無し) |
| deals 由来 tag 名 | detail.tag_ids + tags master(要新設) | 同上 | 0% (実データに tag_ids 無し) |
| **manual_journals 由来 section 名** | detail.section_name(API レスポンスに含まれる) | transform_journal_to_rows で raw のみ・TransactionRow 未マッピング | キャラアニメ 0% |

### 取り切れない情報 (実装で解決不可、運用課題)

- キャラクターアニメで manual_journals の partner_name / item_name / tag_names がそもそも入力されていない (90%+ null) → fetch を直しても J〜N列の大半は空欄のまま。これは **freee 側の入力運用の問題** であり、本タスクの対象外。

### クラスタ B 着手時の最低限の追加実装 (調査結果として確定したもの)

検証③で問題が出たアントレッド A5 K列 None を解消するため、最低限必要なのは:

1. **items master の fetch 追加** (`/api/1/items` の取得・JSON 永続化)
2. `transform_deal_to_rows` に items_cache を渡し、`detail.item_id` → `item_name` 解決して `TransactionRow.item` に格納
3. (副次) `transform_journal_to_rows` で `detail.section_name` を TransactionRow に流す経路の追加可否(現状は raw のみ) ※ manual_journals の section_name は実データで 0% のため緊急性は低い

sections / tags については実データに存在しないため、本タスクではスコープアウト候補(クラスタ B で意思決定)。

---

## §6. 想定外論点 (クラスタ A 段階で気づいたもの)

| レベル | 内容 | 対応 |
|---|---|---|
| B(記録) | キャラアニメで manual_journals の partner/item/tag が freee 側で 90%+ null。fetch を直しても J〜N列はほぼ空欄のまま改善されない。これは入力運用課題で、別タスク(運用改善)候補。 | Phase_C_Candidates_Raw_List.md に追記候補 |
| B(記録) | manual_journals の `section_name` は API 応答に含まれるが TransactionRow にマッピングされず raw のみ保持。実データで 0% のため緊急性は低いが、対応方針を決める論点はある。 | 同上 |
| B(記録) | deals 由来 detail の `description` は TransactionRow.description に既にマッピング済みだが、デイリーユニフォームで 74.8% 充填されており、N列(摘要)表示の改善余地あり。**ただし K列 None の本論点とは別系統**。 | 同上 |
| C(既知) | items/sections/tags master の fetch 追加は ADDENDUM v6 §3 項目1「freee に存在する文脈情報は最大粒度で取り切る」と整合する方向性で、想定内。 | 触らない |

レベル A(即時報告)該当なし。

---

## §7. 調査範囲外として触れなかった論点 (記録のみ)

- V1-3-10 判定ロジック(checker 層)
- Finding / FindingGroup スキーマ
- 累計モデル化(2-J.3 で施錠済み)
- observation 文言改善(D2 残論点)
- 取引先列左詰め(テンプレート側で悠皓さん対応)
- styles.py 追加(Phase 6.12 で施錠)

これらは「ついでに直す」原則に従い、本クラスタでは一切触れていない。
