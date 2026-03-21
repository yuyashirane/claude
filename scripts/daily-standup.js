#!/usr/bin/env node
/**
 * daily-standup.js
 * 毎朝の業務開始時に使うデイリースタンドアップアシスタント。
 * Google カレンダー（SY_白根 / _共通）の予定を取得して Claude と一緒に1日を整理します。
 *
 * 使い方: node scripts/daily-standup.js
 * 終了:   "quit" または "exit" と入力
 *
 * 初回セットアップ（Google Calendar 連携）:
 *   → scripts/lib/google-calendar.js のコメントを参照
 */

"use strict";

const readline = require("readline");
const Anthropic = require("@anthropic-ai/sdk");
const { getEventsForDate, formatEventsAsText } = require("./lib/google-calendar");

const client = new Anthropic.default();

const SYSTEM_PROMPT = `あなたは毎朝の業務開始を支援する「デイリースタンドアップアシスタント」です。
ユーザーが1日の仕事を気持ちよくスタートできるよう、以下の役割を担います。

【役割】
1. スタンドアップ進行: 昨日の振り返り・今日のタスク・ブロッカーをヒアリングして整理する
2. カレンダー活用: 提供された今日のスケジュールをもとに、会議の準備や時間の使い方をアドバイスする
3. タスク優先度の整理: 今日やるべきことを重要度・緊急度で整理してアドバイスする
4. ディスカッションパートナー: 迷っていることや悩みを一緒に考える

【進め方】
- セッション開始時は挨拶と今日の日付・曜日を伝え、カレンダー情報があれば自然に触れる
- スタンドアップの3つの質問（昨日・今日・ブロッカー）を案内する
- ユーザーの回答に応じて自然に深掘りしたり、別の視点を提供する
- タスクが出揃ったら「本日のサマリー」として整理して見せる
- ユーザーが「サマリー」「まとめて」「今日の予定」などと言ったらいつでもサマリーを出す

【スタイル】
- 親しみやすく、でもプロフェッショナルなトーン
- 長い説明より、箇条書きや短い質問を使って会話を進める
- ネガティブな状況でも前向きな視点を提供する
`;

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

/**
 * Google カレンダーから今日の予定を取得してテキストに変換する。
 * 認証情報がない場合や取得失敗時は null を返す（スタンドアップは続行する）。
 */
async function fetchTodayCalendar(date) {
  try {
    const { events, calendarNames } = await getEventsForDate(date);
    return formatEventsAsText(date, events, calendarNames);
  } catch (err) {
    if (err.message.includes("credentials.json")) {
      console.warn("\n⚠️  Google Calendar 未設定: " + err.message.split("\n")[0]);
      console.warn("カレンダー連携なしでスタンドアップを続行します。\n");
    } else {
      console.warn("\n⚠️  カレンダー取得エラー:", err.message);
      console.warn("カレンダー連携なしでスタンドアップを続行します。\n");
    }
    return null;
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const conversationHistory = [];

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

  // カレンダー取得（失敗してもスタンドアップは続行）
  process.stdout.write("📅 カレンダーを取得中...");
  const calendarText = await fetchTodayCalendar(today);
  if (calendarText) {
    process.stdout.write(" 完了\n\n");
  } else {
    process.stdout.write("\n");
  }

  // 最初のメッセージにカレンダー情報を含める
  const openingContent = calendarText
    ? `今日は${todayStr}です。\n\n以下が今日のカレンダー情報です:\n${calendarText}\nデイリースタンドアップを始めてください。`
    : `今日は${todayStr}です。デイリースタンドアップを始めてください。`;

  conversationHistory.push({ role: "user", content: openingContent });

  const opening = await streamResponse(conversationHistory);
  conversationHistory.push({ role: "assistant", content: opening });

  // メインの会話ループ
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
