# `.claude/skills/` と `skills/` 二重管理 実態調査

- 調査日: 2026-05-01
- 担当: 実装 Claude
- 目的: 戦略 Claude による統合方針判断のための事実情報収集（**調査のみ・変更操作なし**）
- 関連: `reports/workspace_cleanup_20260501.md` §4-3

---

## 1. サマリー

| 項目 | 件数 |
| --- | --- |
| `.claude/skills/` 配下の SKILL.md | 2件 |
| `skills/` 配下の SKILL.md | 2件 |
| 両方に SKILL.md が存在する Skill | 1件（`check-tax-classification`） |
| 内容が完全一致するファイル | 0件 |
| 内容に差分があるファイル | 1件（`check-tax-classification`） |

**重要な発見**: 単純な「重複」ではなく、**役割分担**を意図した構造になっている可能性が高い。
`.claude/skills/check-tax-classification/SKILL.md` 本文（L33-36）に以下の明示的な記述がある。

> **実装の正本**: `skills/verify/V1-3-rule/check-tax-classification/` 配下の
> `run.py` および `checker.py`, `checks/`, `references/`, `schema.py`。
> 本 SKILL.md は `.claude/skills/` への登録用エントリであり、
> 実装コードは既存配置を参照します。

---

## 2. ディレクトリ構造対比

### 2.1 `.claude/skills/`（SKILL.md のみ）

```
.claude/skills/
├── check-invoice-registration-status/
│   └── SKILL.md                        (15905 B, 2026-05-01 09:37)
└── check-tax-classification/
    └── SKILL.md                        (12000 B, 2026-05-01 09:37)
```

- 配下にコード（.py）は一切存在しない
- 各 Skill ディレクトリは SKILL.md 単独配置

### 2.2 `skills/`（実装本体 + 一部 SKILL.md）

```
skills/
├── _common/                             ← 共通ライブラリ（SKILL.md なし）
│   ├── lib/                             (account_matcher.py, finding_factory.py,
│   │                                     finding_grouper.py, freee_link_generator.py,
│   │                                     keyword_matcher.py, note_markers.py,
│   │                                     overseas_services.py, schema.py,
│   │                                     tax_code_helpers.py)
│   └── references/                      (area-definitions.json, overseas-services.json,
│                                         severity-levels.json, tax-code-categories.json,
│                                         tax-codes-master.json)
├── export/
│   └── excel_report/
│       ├── SKILL.md                     (1266 B, 2026-04-16 16:54)
│       ├── exporter.py
│       ├── sheet_builder.py
│       ├── sort_priority_map.py
│       ├── styles.py
│       ├── template_engine.py
│       └── references/
└── verify/
    └── V1-3-rule/
        ├── check-invoice-registration-status/
        │   ├── checker.py               (10085 B)
        │   ├── run.py                   (46047 B)
        │   └── schema.py                (6159 B)
        │   ※ SKILL.md は無い
        └── check-tax-classification/
            ├── SKILL.md                 (10395 B, 2026-05-01 09:37)
            ├── checker.py               (2574 B)
            ├── run.py                   (21243 B)
            ├── schema.py                (18490 B)
            ├── checks/
            └── references/
```

---

## 3. SKILL.md 4ファイルの存在マトリクス

| Skill 名 | `.claude/skills/` | `skills/` | 備考 |
| --- | :---: | :---: | --- |
| `check-tax-classification` | ✅ | ✅ | 両方に存在・内容差分あり |
| `check-invoice-registration-status` | ✅ | ❌ | `.claude/` のみ。`skills/` 配下にはコードのみ存在し SKILL.md なし |
| `excel_report` | ❌ | ✅ | `skills/export/` のみ。`.claude/` には未登録 |
| `_common`（ライブラリ） | ❌ | ❌ | SKILL.md なし（共通モジュール扱い） |

---

## 4. 差分があるファイルの詳細：`check-tax-classification/SKILL.md`

### 4.1 メタデータ

| 項目 | `.claude/skills/` 版 | `skills/verify/V1-3-rule/` 版 |
| --- | --- | --- |
| サイズ | 12000 B | 10395 B |
| 最終更新 | 2026-05-01 09:37 | 2026-05-01 09:37（※本日の Task 1 で両方を編集） |

### 4.2 frontmatter `description` の差異

- **`.claude/skills/` 版**: 多行 YAML（`|` リテラルブロック）。発動トリガー、単月/累積判定、類似スキルとの差別化、誤発動回避ルールなどを **詳細記述**
- **`skills/` 版**: 1段落の単純テキスト。トリガーキーワードの列挙のみ

### 4.3 本文の差異（diff 結果から抜粋）

`.claude/skills/` 版にのみ存在する記述:

1. **「実装の正本」セクション（L33-36）**:
   `.claude/skills/` の SKILL.md は登録用エントリであり、
   実装本体は `skills/verify/V1-3-rule/check-tax-classification/` を参照する旨を明記
2. **誤発動回避ルール（L48-51）**:
   `anthropic-skills:freee-verify-monthly` との責務分離
3. **manual_journals 対応（L135-145）**:
   オプショナル合流の仕様
4. **実行コマンド例（L208-214）**:
   具体的な run.py 実行コマンド
5. **関連情報の `実装本体（参考）` リンク（L300）**

`skills/` 版にのみ存在する記述: **なし**（`.claude/` 版が上位互換）

### 4.4 解釈

`.claude/skills/check-tax-classification/SKILL.md` は **Skill登録の正本**。
`skills/verify/V1-3-rule/check-tax-classification/SKILL.md` は **過去の登録正本の名残**であり、現在は実装ディレクトリに付随する古いドキュメントの可能性が高い（自己言及がなく、`.claude/` 版より情報量が少ない）。

---

## 5. Claude Code の認識経路

### 5.1 settings.json の確認

| 場所 | 存在 | 内容 |
| --- | --- | --- |
| `office/office-claude/.claude/settings.json` | ❌ 存在しない | — |
| `office/office-claude/.claude/settings.local.json` | ❌ 存在しない | — |
| `~/.claude/settings.json`（グローバル） | ✅ 存在 | `enabledPlugins`, `autoUpdatesChannel`, `theme` のみ。**skills 検索パスの設定なし** |

### 5.2 認識ルートの推定（実装側調査の範囲）

- Claude Code の標準仕様では `.claude/skills/` 配下の SKILL.md がプロジェクトレベル Skill として自動認識される（プラグイン互換構造）
- 本セッション開始時の system reminder にも、自動発動可能な Skill として
  `check-invoice-registration-status` と `check-tax-classification` の **2件のみ**が列挙されており、
  これは `.claude/skills/` 配下の SKILL.md と一致する
- `skills/excel_report` および `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` は
  自動発動候補リストに **含まれていない**（実装コードとして利用されるのみ）

### 5.3 結論

- `.claude/skills/` = Claude Code の **Skill登録ディレクトリ**（自動認識される）
- `skills/` = **実装コードのリポジトリ**（自動認識されない、Skill 内から `from skills.verify...` 等で import される）
- 両者は**役割分担**しており、本来は二重管理ではない
- **`skills/...` 配下に残存する SKILL.md（特に `check-tax-classification/SKILL.md`）が紛らわしい**

---

## 6. 履歴的経緯

| 日付 | コミット | 内容 |
| --- | --- | --- |
| 2026-04-15 | `914e5ff` | `skills/` 配下を最初に作成（実装コード） |
| 2026-04-15 | `ad763cd` | `skills/_common/lib/` 等の共通モジュール追加 |
| 2026-04-16 | `817936e`〜`fb4d322` | `skills/verify/V1-3-rule/check-tax-classification/` の実装＋SKILL.md |
| 2026-04-16 | `fb4d322` | `skills/export/excel_report/SKILL.md` 追加 |
| 2026-04-24 | `8268eb5` | `.claude/skills/check-tax-classification/SKILL.md` を**登録用エントリとして追加** |
| 2026-04-27 | `27a2664` | `.claude/skills/check-invoice-registration-status/SKILL.md` 追加 |
| 2026-05-01 | （本日） | Task 1 で `.claude/` 版と `skills/` 版の両方に注釈追加 |

**経緯の解釈**: `skills/` 構造で開発を始めた後、Claude Code の Skill 自動認識仕様に合わせて `.claude/skills/` を「登録ディレクトリ」として後付けで追加。`skills/` 側の SKILL.md は移行漏れ（あるいは意図的な参考資料）として残存。

---

## 7. 不明点・未確認事項

| # | 項目 | 理由 |
| --- | --- | --- |
| U1 | `skills/export/excel_report/SKILL.md` を `.claude/skills/` に登録すべきか | 戦略Claude側のスキル設計判断が必要 |
| U2 | `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` を削除してよいか | 内部参照（import 等）に依存しているか未確認。`run.py` 等が SKILL.md を読み込むコードがあれば削除不可 |
| U3 | `skills/verify/V1-3-rule/check-invoice-registration-status/` に SKILL.md がない理由 | 意図的（`.claude/` のみで管理する方針への移行）か漏れか不明 |
| U4 | `.claude/skills/` 内の Skill のサブカテゴリ階層化（戦略Claude案の7カテゴリ × 番号体系） | 現状は `.claude/skills/{Skill名}/SKILL.md` のフラット構造。`.claude/skills/verify/V1-3-10-check-tax-classification/SKILL.md` 形式への変更可否の方針が未確定 |
| U5 | プラグイン化時の `.claude/skills/` 階層構造の許容範囲 | Claude Code 仕様調査が必要 |

---

## 8. 戦略Claudeへの判断依頼事項

以下について、統合方針の決定をお願いします。

### 8.1 即時対応可能な軽微な項目（次セッションでまとめて実装可）
1. `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` の取り扱い
   - 案A: 削除（`.claude/` 版が上位互換のため）
   - 案B: 残置（過渡期の参考資料として）
   - 案C: シンボリックリンク or 「正本は `.claude/skills/` 参照」のスタブ化
2. `skills/export/excel_report/SKILL.md` を `.claude/skills/` に登録すべきか

### 8.2 中規模の方針判断
3. `.claude/skills/` 配下の階層化方針
   - 戦略案: `.claude/skills/{機能カテゴリ}/{番号-Skill名}/SKILL.md`
   - 現状: `.claude/skills/{Skill名}/SKILL.md`（フラット）
   - 変更時、Claude Code の自動発動が機能するかの **実セッション検証**が別途必要

### 8.3 大規模の方針判断
4. `skills/` の最終的な位置づけ
   - 案A: 現状維持（実装本体リポジトリとしての役割を残す）
   - 案B: `src/` への改名（戦略Claudeのグローバルルール CLAUDE.md と整合）
   - 案C: `.claude/skills/{カテゴリ}/{Skill名}/` 配下にコードも統合（プラグイン互換最優先）

---

## 9. 完了確認

- [x] §2.3.1 ディレクトリ構造の対比 → §2 に記載
- [x] §2.3.2 ファイル単位の差分 → §3, §4 に記載
- [x] §2.3.3 Claude Code の実動作確認 → §5 に記載
- [x] §2.3.4 履歴的経緯の推定 → §6 に記載
- [x] **本セッション中にディレクトリ構造を一切変更していない**（調査のみ）
- [x] 統合方針判断が必要な項目を §8 に明示

---

## 10. 戦略Claudeへの報告メッセージ

**本調査は事前調査として完了しました。`.claude/skills/` と `skills/` は単純な重複ではなく「Skill登録ディレクトリ」と「実装コードリポジトリ」の役割分担構造です。ただし `skills/verify/V1-3-rule/check-tax-classification/SKILL.md` のみが過去の名残として両方に存在しており、この扱いを含め統合方針判断が必要です。詳細は §8 の判断依頼事項を参照してください。実装は別セッションでの指示書化を待ちます。**
