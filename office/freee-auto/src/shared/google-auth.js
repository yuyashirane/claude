/**
 * google-auth.js
 * Google API 共通 OAuth2 認証モジュール（Calendar + Gmail）
 *
 * token.json が既にある場合、スコープが拡張されていれば再認証が必要です。
 * その際は token.json を削除してから再実行してください。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const readline = require("readline");

const ROOT = path.join(__dirname, "..", "..");
const CREDENTIALS_PATH = path.join(ROOT, "credentials.json");
const TOKEN_PATH = path.join(ROOT, "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

let _cachedClient = null;

async function getAuthClient() {
  if (_cachedClient) return _cachedClient;

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json が見つかりません: ${CREDENTIALS_PATH}\n` +
        "Google Cloud Console で OAuth2 認証情報（デスクトップアプリ）を作成し、\n" +
        "credentials.json をリポジトリルートに置いてください。\n" +
        "詳細: https://developers.google.com/workspace/guides/create-credentials"
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    // トークンの自動更新
    oAuth2Client.on("tokens", (newTokens) => {
      const merged = { ...token, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
    });
    _cachedClient = oAuth2Client;
    return oAuth2Client;
  }

  return await authorizeNewToken(oAuth2Client);
}

async function authorizeNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n[Google 認証]\nブラウザで以下のURLを開いてください:\n");
  console.log(authUrl);
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const code = await new Promise((resolve) => {
    rl.question("認証後に表示されたコードを入力してください: ", (c) => {
      rl.close();
      resolve(c.trim());
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log("認証完了。token.json を保存しました。\n");
  _cachedClient = oAuth2Client;
  return oAuth2Client;
}

module.exports = { getAuthClient };
