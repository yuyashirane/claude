/**
 * gmail.js
 * Gmail API ヘルパー
 *
 * - 未読メールのうち返信が必要なものを取得
 * - 下書きを作成・保存
 */

"use strict";

const { google } = require("googleapis");
const { getAuthClient } = require("./google-auth");

/** 取得対象期間（日数） */
const FETCH_DAYS_BACK = 3;

/**
 * メールのヘッダーから特定フィールドを取り出す
 */
function getHeader(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

/**
 * base64url → 通常文字列
 */
function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/**
 * メッセージパーツからテキスト本文を再帰的に取得する
 */
function extractBody(payload) {
  if (!payload) return "";

  // text/plain を優先
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  // text/html フォールバック（タグ除去）
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64(payload.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

/**
 * 直近 FETCH_DAYS_BACK 日間の未読メールを取得する。
 * 自動送信・ニュースレター等はフィルタリングして除外。
 * @returns {Array<{id, threadId, from, to, subject, date, snippet, body}>}
 */
async function fetchUnreadEmails() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const after = Math.floor((Date.now() - FETCH_DAYS_BACK * 86400 * 1000) / 1000);

  // INBOX の未読、自動返信・ニュースレター・プロモーションを除外
  const query = [
    "is:unread",
    "in:inbox",
    `-category:promotions`,
    `-category:social`,
    `-from:noreply`,
    `-from:no-reply`,
    `-from:newsletter`,
    `-from:notifications`,
    `after:${after}`,
  ].join(" ");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 30,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  // 詳細取得（並列）
  const details = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full",
      }).then((r) => r.data)
    )
  );

  return details.map((msg) => {
    const headers = msg.payload?.headers || [];
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      snippet: msg.snippet || "",
      body: extractBody(msg.payload).slice(0, 2000), // 長すぎる場合は切り詰め
    };
  });
}

/**
 * Gmail の下書きとして返信メールを保存する
 * @param {object} opts
 * @param {string} opts.to         - 宛先
 * @param {string} opts.subject    - 件名（Re: ... の形式）
 * @param {string} opts.body       - 本文（プレーンテキスト）
 * @param {string} opts.threadId   - スレッドID
 * @param {string} opts.inReplyTo  - 元メールのMessage-ID
 * @returns {string} 作成されたドラフトのID
 */
async function createDraft({ to, subject, body, threadId, inReplyTo }) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  // 自分のメールアドレスを取得
  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress;

  const lines = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ];
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }
  lines.push("", body);

  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const draft = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw, threadId },
    },
  });

  return draft.data.id;
}

/**
 * メール一覧を Claude に渡せるテキスト形式に変換する
 */
function formatEmailsForClaude(emails) {
  if (emails.length === 0) return "未読メールはありません。";

  return emails
    .map(
      (e, i) => `=== メール ${i + 1} ===
ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
本文（抜粋）:
${e.body || e.snippet}
`
    )
    .join("\n");
}

module.exports = { fetchUnreadEmails, createDraft, formatEmailsForClaude };
