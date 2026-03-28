/**
 * Kintone接続テスト
 *
 * 使い方:
 *   node src/review/kintone-connection-test.js
 *
 * テスト内容:
 *   1. 環境変数の確認
 *   2. Kintone APIへの接続テスト
 *   3. 各アプリへのアクセス確認
 *   4. テストレコードの登録・取得・削除（--write オプション時のみ）
 */

const {
  createKintoneClient,
  testConnection,
  APP_IDS,
} = require("../shared/kintone-client");

async function main() {
  const doWrite = process.argv.includes("--write");

  console.log("=== Kintone 接続テスト ===\n");

  // 1. 環境変数チェック
  console.log("1. 環境変数の確認");
  const baseUrl = process.env.KINTONE_BASE_URL;
  const apiToken = process.env.KINTONE_API_TOKEN;

  console.log(`  KINTONE_BASE_URL: ${baseUrl ? "✅ " + baseUrl : "❌ 未設定"}`);
  console.log(
    `  KINTONE_API_TOKEN: ${apiToken ? "✅ 設定済み（" + apiToken.length + "文字）" : "❌ 未設定"}`
  );
  console.log(
    `  KINTONE_APP_VERIFY_CHECK: ${APP_IDS.VERIFY_CHECK || "❌ 未設定（0）"}`
  );
  console.log(
    `  KINTONE_APP_TRANSACTION_REVIEW: ${APP_IDS.TRANSACTION_REVIEW || "❌ 未設定（0）"}`
  );
  console.log(
    `  KINTONE_APP_LEARNING_FEEDBACK: ${APP_IDS.LEARNING_FEEDBACK || "❌ 未設定（0）"}`
  );

  if (!baseUrl || !apiToken) {
    console.error("\n⛔ 接続情報が不足しています。.env ファイルを確認してください。");
    console.error("  参考: .env.example をコピーして .env を作成");
    process.exit(1);
  }

  // 2. クライアント作成
  console.log("\n2. Kintone APIクライアント作成");
  let client;
  try {
    client = createKintoneClient();
    console.log("  ✅ クライアント作成成功");
  } catch (err) {
    console.error("  ❌ クライアント作成失敗:", err.message);
    process.exit(1);
  }

  // 3. 各アプリへの接続テスト
  console.log("\n3. アプリ接続テスト");

  const apps = [
    { name: "帳簿チェック", id: APP_IDS.VERIFY_CHECK },
    { name: "仕訳レビュー", id: APP_IDS.TRANSACTION_REVIEW },
    { name: "学習フィードバック", id: APP_IDS.LEARNING_FEEDBACK },
  ];

  for (const app of apps) {
    if (!app.id || app.id === 0) {
      console.log(`  ⏭️  ${app.name}: スキップ（アプリID未設定）`);
      continue;
    }
    const ok = await testConnection(client, app.id);
    console.log(
      `  ${ok ? "✅" : "❌"} ${app.name} (ID: ${app.id}): ${ok ? "接続成功" : "接続失敗"}`
    );
  }

  // 4. テストレコードの書き込みテスト（オプション）
  if (doWrite && APP_IDS.VERIFY_CHECK) {
    console.log("\n4. テストレコード書き込みテスト");

    try {
      // テストレコード登録
      const testRecord = {
        client_name: { value: "【テスト】接続確認" },
        check_date: { value: new Date().toISOString().slice(0, 10) },
        check_type: { value: "スポット" },
        target_period: { value: "テスト期間" },
        severity: { value: "参考" },
        check_category: { value: "接続テスト" },
        finding_detail: { value: "Kintone接続テストのダミーレコードです。削除してOK。" },
        related_account: { value: "" },
        related_amount: { value: 0 },
        action_status: { value: "対応不要" },
      };

      const addResult = await client.record.addRecord({
        app: APP_IDS.VERIFY_CHECK,
        record: testRecord,
      });
      console.log(`  ✅ レコード登録成功 (ID: ${addResult.id})`);

      // 登録したレコード取得
      const getResult = await client.record.getRecord({
        app: APP_IDS.VERIFY_CHECK,
        id: addResult.id,
      });
      console.log(
        `  ✅ レコード取得成功: 「${getResult.record.client_name.value}」`
      );

      // テストレコード削除
      await client.record.deleteRecords({
        app: APP_IDS.VERIFY_CHECK,
        ids: [addResult.id],
      });
      console.log(`  ✅ レコード削除成功 (ID: ${addResult.id})`);

      console.log("\n  🎉 読み書き削除テスト 全て成功！");
    } catch (err) {
      console.error("  ❌ 書き込みテスト失敗:", err.message);
      if (err.bulkRequestIndex !== undefined) {
        console.error("  詳細:", JSON.stringify(err.errors, null, 2));
      }
    }
  } else if (doWrite) {
    console.log("\n4. テストレコード書き込みテスト: スキップ（KINTONE_APP_VERIFY_CHECK 未設定）");
  }

  console.log("\n=== テスト完了 ===");
}

main().catch((err) => {
  console.error("予期しないエラー:", err);
  process.exit(1);
});
