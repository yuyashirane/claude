/**
 * noise-patterns.js
 * ノイズ除去パターン
 *
 * 銀行明細に付与される摘要プレフィックス・代行会社コード・
 * 管理番号サフィックス等のノイズパターンを定義する。
 *
 * ※ 正規化パイプラインの Step 3（半角→全角カナ）・Step 4（記号統一）
 *   の後に適用されるため、全角カタカナ・全角括弧で定義する。
 *
 * 追加時の注意:
 *   - 新しい銀行の摘要形式が出てきたらここに追加
 *   - パターンの順序は先にマッチしたものが優先
 */

// 銀行摘要プレフィックス（全角カタカナ変換後の形）
const NOISE_PREFIXES = [
  { pattern: /^IBフリコミ\s*/, label: 'IBフリコミ' },       // IBフリコミ
  { pattern: /^コウザフリカエ\s*/, label: 'コウザフリカエ' },   // コウザフリカエ
  { pattern: /^ソウキン\s*/, label: 'ソウキン' },             // ソウキン
  { pattern: /^ジフリ\s*/, label: 'ジフリ' },             // ジフリ
  { pattern: /^クレジット\s*/, label: 'クレジット' },           // クレジット
  { pattern: /^JCB\s*/, label: 'JCB' },
  { pattern: /^VISA\s*/, label: 'VISA' },
  { pattern: /^MASTER\s*/, label: 'MASTER' },
  { pattern: /^ホケンリヨウ\s*/, label: 'ホケンリヨウ' },     // ホケンリヨウ
  { pattern: /^テスウリヨウ\s*/, label: 'テスウリヨウ' },       // テスウリヨウ
  { pattern: /^電話料\s*/, label: '電話料' },
];

// 引落代行プレフィックス（全角括弧変換後の形）
const AGENCY_PREFIXES = [
  { pattern: /^DF\./, label: 'DF' },                  // DF.（ダイレクト）
  { pattern: /^MHF）/, label: 'MHF' },          // MHF）（みずほファクター）
  { pattern: /^SMBC（/, label: 'SMBC' },        // SMBC（（三井住友）
  { pattern: /^SMCC（/, label: 'SMCC' },        // SMCC（（三井住友カード）
  { pattern: /^RL）/, label: 'RL' },             // RL）（りそな）
  { pattern: /^AP（/, label: 'AP' },             // AP（（アプラス）
  { pattern: /^CSS（/, label: 'CSS' },           // CSS（
  { pattern: /^NSS\./, label: 'NSS' },                 // NSS.
  { pattern: /^NS\s+/, label: 'NS' },                  // NS（スペース区切り）
  { pattern: /^RKS（/, label: 'RKS' },           // RKS（
];

// サフィックスノイズ（管理番号等）
const NOISE_SUFFIXES = [
  /\s*（\d+）$/,             // （数字）— 管理番号
  /\s*（HFC）$/,              // （HFC）
  /\s*（SMCC$/,                      // （SMCC（閉じ括弧なし）
  /\s*（SMBC$/,                      // （SMBC（閉じ括弧なし）
];

module.exports = { NOISE_PREFIXES, AGENCY_PREFIXES, NOISE_SUFFIXES };
