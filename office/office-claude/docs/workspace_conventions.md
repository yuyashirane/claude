# office-claude ワークスペース運用規約

- 制定日: 2026-05-01
- 根拠: `reports/workspace_cleanup_20260501.md`
- 適用範囲: `office/office-claude/` 配下のすべての作成・保存・参照操作

## 1. ディレクトリ構造

| ディレクトリ | 用途 | 例 |
| --- | --- | --- |
| `scripts/` | 汎用Pythonスクリプト | merge_*.py, verify_*.py, gen_*.py |
| `data/` | 解析素材・入力データ | *.json, *.xlsx（サンプル） |
| `tests/e2e/` | E2E系テスト・実行ファイル | e2e_*.py, run_e2e_*.py |
| `tests/unit/` | 単体テスト | test_*.py（pytest） |
| `reports/` | レポート・ログ・監査結果 | （詳細は §2） |
| `docs/` | 設計文書・運用文書 | *.md（本文書を含む） |
| `references/` | 参照資料（タグ・ルール定義等） | rules/*.md |
| `templates/` | 業務テンプレート | （未作成、必要時に作成） |
| `.claude/skills/` | Skill定義 | 機能カテゴリ × 番号体系 |

### 1.1 禁止事項

- `tmp/` ディレクトリの新規作成は禁止（2026-05-01 整理時に廃止）
- ルート直下への作業ファイル散乱は禁止（必ずいずれかのディレクトリに配置）

## 2. レポート保存規約

### 2.1 事業所別レポート

`reports/{事業所ID}_{事業所名}/` 配下に保存。

例:
- `reports/10794380_株式会社デイリーユニフォーム/`
- `reports/3525430_アントレッド株式会社/`

### 2.2 事業所横断レポート

`reports/` 直下に保存。命名規則: `{用途}_{YYYYMMDD}.md`

例:
- `reports/workspace_cleanup_20260501.md`
- `reports/skill_directory_audit_20260501.md`

## 3. Skill配置規約

### 3.1 配置先

`.claude/skills/{機能カテゴリ}/{Skill名}/SKILL.md`

機能カテゴリ（7分類）:
- `verify/`（帳簿チェック・検証系）
- `intake/`（INPUT 工程）
- `classify/`（CLASSIFY 工程）
- `review/`（REVIEW 工程）
- `register/`（REGISTER 工程）
- `learn/`（LEARN 工程）
- `meta/`（横断的補助）

### 3.2 frontmatter 必須フィールド

```yaml
---
name: skill-name
description: トリガー条件を含む説明
---
```

### 3.3 反映タイミング

- 新規 Skill は配置のみで自動認識（settings.json 追記不要）
- 反映は新セッションでのみ

## 4. ファイル作成時の判断フロー

新規ファイルを作成する際、以下の順で配置先を決定：

1. **Skill定義** → `.claude/skills/{カテゴリ}/{名前}/SKILL.md`
2. **テスト** → `tests/e2e/` または `tests/unit/`
3. **レポート・監査結果・ログ** → `reports/`（事業所別 or 横断）
4. **設計・運用文書** → `docs/`
5. **参照資料（不変的なルール定義）** → `references/`
6. **業務テンプレート** → `templates/`
7. **解析素材・入力データ** → `data/`
8. **汎用スクリプト** → `scripts/`
9. **上記いずれにも該当しない** → 戦略Claudeに配置先を確認

## 5. Claude Code への渡し物

- すべて Markdown ファイル形式（会話内テキスト埋め込み禁止）
- present_files で提示
- ファイル名は内容を識別できる具体的な名前を付ける

## 6. 改定履歴

| 日付 | 内容 |
| --- | --- |
| 2026-05-01 | 制定（tmp/ 整理を機に運用ルール明文化） |
