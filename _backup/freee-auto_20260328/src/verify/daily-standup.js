#!/usr/bin/env node
/**
 * daily-standup.js
 * 毎朝の業務開始時に使うデイリースタンドアップアシスタント。
 *
 * 起動時に以下を自動実行:
 *   1. Google カレンダー（SY_白根 / _共通）から今日の予定を取得
 *   2. Gmail から未読・要返信メールを取得
 *   3. Claude が返信ドラフトを生成して Gmail 下書きに保存
 *   4. 上記を踏まえてスタンドアップ会話を開始
 *
 * 使い方: node scripts/daily-standup.js
 * 終了:   "quit" または "exit" と入力
 */

"use strict";

const readline = require("readline");
const Anthropic = require("@anthropic-ai/sdk");
const { getEventsForDate, formatEventsAsText } = require("../shared/google-calendar");
const { fetchUnreadEmails, createDraft, formatEmailsForClaude } = require("../shared/gmail");

const client = new Anthropic.default();

const SYSTEM_PROMPT = `あなたは毎朝の業務開始を支援する「デイリースタンドアップアシスタント」です。
ユーザーが1日の仕事を気持ちよくスタートできるよう、以下の役割を担います。

【役割】
1. スタンドアップ進行: 昨日の振り返り・今日のタスク・ブロッカーをヒアリングして整理する
2. カレンダー活用: 今日のスケジュールをもとに、会議の準備や時間の使い方をアドバイスする
3. メール対応: 下書き保存したメールの内容をユーザーに伝え、修正の相談に乗る
4. タスク優先度の整理: 今日やるべきことを重要度・緊急度で整理してアドバイスする
5. ディスカッションパートナー: 迷っていることや悩みを一緒に考える

【進め方】
- セッション開始時は挨拶、カレンダー情報、メール下書きの概要をまとめて伝える
- スタンドアップの3つの質問（昨日・今日・ブロッカー）を案内する
- ユーザーの回答に応じて自然に深掘りしたり、別の視点を提供する
- タスクが出揃ったら「本日のサマリー」として整理して見せる
- ユーザーが「サマリー」「まとめて」「今日の予定」などと言ったらいつでもサマリーを出す

【スタイル】
- 親しみやすく、でもプロフェッショナルなトーン
- 長い説明より、箇条書きや短い質問を使って会話を進める
- ネガティブな状況でも前向きな視点を提供する
`;

/** Claude にテキスト生成させる（非ストリーミング、内部処理用） */
async function generateText(prompt, systemPrompt) {
  const res = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt || "あなたは親切なビジネスメールの返信アシスタントです。日本語で返信してください。",
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.find((b) => b.type === "text")?.text || "";
}

/** ストリーミングで Claude の返答を表示する */
async function streamResponse(messages) {
  process.stdout.write("\nアシスタント: ");

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  let fullText = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
      fullText += event.delta.text;
    }
  }
  process.stdout.write("\n\n");
  return fullText;
}

/** Google カレンダーから今日の予定を取得 */
async function fetchTodayCalendar(date) {
  try {
    const { events, calendarNames } = await getEventsForDate(date);
    return formatEventsAsText(date, events, calendarNames);
  } catch (err) {
    const msg = err.message.includes("credentials.json")
      ? "Google Calendar 未設定（credentials.json が必要）"
      : `カレンダー取得エラー: ${err.message}`;
    console.warn(`  ⚠️  ${msg}`);
    return null;
  }
}

/**
 * Gmail から未読メールを取得し、返信が必要なものに Claude でドラフトを作成して下書き保存する。
 * @returns {Array<{subject, from, draftId, draftBody}>} 作成したドラフト一覧
 */
async function processEmailDrafts() {
  let emails;
  try {
    emails = await fetchUnreadEmails();
  } catch (err) {
    const msg = err.message.includes("credentials.json")
      ? "Gmail 未設定（credentials.json が必要）"
      : `Gmail 取得エラー: ${err.message}`;
    console.warn(`  ⚠️  ${msg}`);
    return [];
  }

  if (emails.length === 0) {
    console.log("  📭 未読メールはありません。");
    return [];
  }

  console.log(`  📬 未読メール ${emails.length} 件を確認中...`);

  // Claude にどのメールが返信必要か判断させる
  const triage = await generateText(
    `以下のメール一覧から、返信が必要なものの番号をカンマ区切りで答えてください。
返信不要（自動通知・ニュースレター・請求書・宣伝など）はスキップしてください。
返信が必要なメールがない場合は「なし」と答えてください。
番号だけ答えてください（例: 1,3,5）。

${formatEmailsForClaude(emails)}`,
    "あなたはメールのトリアージアシスタントです。番号またはなし、とだけ答えてください。"
  );

  if (triage.trim() === "なし" || triage.trim() === "") {
    console.log("  ✅ 返信が必要なメールはありません。");
    return [];
  }

  const indices = triage
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < emails.length);

  const drafts = [];
  for (const idx of indices) {
    const email = emails[idx];
    process.stdout.write(`  ✍️  下書き作成中: "${email.subject}" ...`);

    try {
      const draftBody = await generateText(
        `以下のメールへの返信ドラフトを日本語で作成してください。
件名・From・本文を参考に、自然でプロフェッショナルな返信を書いてください。
署名は不要です。本文のみ返してください。

From: ${email.from}
Subject: ${email.subject}
本文:
${email.body || email.snippet}`
      );

      const reSubject = email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`;

      const draftId = await createDraft({
        to: email.from,
        subject: reSubject,
        body: draftBody,
        threadId: email.threadId,
      });

      process.stdout.write(` 完了\n`);
      drafts.push({ subject: email.subject, from: email.from, draftId, draftBody });
    } catch (err) {
      process.stdout.write(` ❌ 失敗: ${err.message}\n`);
    }
  }

  return drafts;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const askUser = (prompt) =>
    new Promise((resolve) => {
      if (process.stdin.isTTY) {
        rl.question(prompt, resolve);
      } else {
        rl.once("line", resolve);
        process.stdout.write(prompt);
      }
    });

  console.log("=".repeat(60));
  console.log("  デイリースタンドアップアシスタント");
  console.log("=".repeat(60));
  console.log('終了するには "quit" または "exit" と入力してください。\n');

  const today = new Date();
  const todayStr = today.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  // --- カレンダー取得 ---
  process.stdout.write("📅 カレンダーを取得中...\n");
  const calendarText = await fetchTodayCalendar(today);

  // --- Gmail ドラフト処理 ---
  process.stdout.write("\n📧 Gmail を確認中...\n");
  const drafts = await processEmailDrafts();

  console.log();

  // --- 初回メッセージ組み立て ---
  const parts = [`今日は${todayStr}です。`];

  if (calendarText) {
    parts.push(`\n以下が今日のカレンダー情報です:\n${calendarText}`);
  }

  if (drafts.length > 0) {
    const draftSummary = drafts
      .map((d, i) => `  ${i + 1}. 「${d.subject}」（from: ${d.from}）`)
      .join("\n");
    parts.push(
      `\nGmail の下書きに以下の返信を保存しました:\n${draftSummary}\n` +
        "ユーザーが確認・修正した後に送信できます。"
    );
  } else {
    parts.push("\nGmail の要返信メールはありませんでした。");
  }

  parts.push("\nデイリースタンドアップを始めてください。");

  const conversationHistory = [{ role: "user", content: parts.join("") }];

  const opening = await streamResponse(conversationHistory);
  conversationHistory.push({ role: "assistant", content: opening });

  // --- 会話ループ ---
  while (true) {
    let userInput;
    try {
      userInput = await askUser("あなた: ");
    } catch {
      break;
    }

    if (!userInput || userInput.trim() === "") continue;

    const trimmed = userInput.trim();
    if (trimmed === "quit" || trimmed === "exit") {
      console.log("\nお疲れさまでした！良い1日を！\n");
      break;
    }

    conversationHistory.push({ role: "user", content: trimmed });
    const response = await streamResponse(conversationHistory);
    conversationHistory.push({ role: "assistant", content: response });
  }

  rl.close();
}

main().catch((err) => {
  console.error("エラーが発生しました:", err.message);
  process.exit(1);
});
