#!/usr/bin/env node
/**
 * daily-standup.js
 * 毎朝の業務開始時に使うデイリースタンドアップアシスタント。
 * Claude と会話しながら今日の仕事を整理できます。
 *
 * 使い方: node scripts/daily-standup.js
 * 終了:   "quit" または "exit" と入力
 */

"use strict";

const readline = require("readline");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default();

const SYSTEM_PROMPT = `あなたは毎朝の業務開始を支援する「デイリースタンドアップアシスタント」です。
ユーザーが1日の仕事を気持ちよくスタートできるよう、以下の役割を担います。

【役割】
1. スタンドアップ進行: 昨日の振り返り・今日のタスク・ブロッカーをヒアリングして整理する
2. タスク優先度の整理: 今日やるべきことを重要度・緊急度で整理してアドバイスする
3. ディスカッションパートナー: 迷っていることや悩みを一緒に考える

【進め方】
- セッション開始時は挨拶と今日の日付・曜日を伝え、スタンドアップの3つの質問を案内する
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

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const conversationHistory = [];

  // 入力を1行ずつ取得するためのPromiseラッパー
  const askUser = (prompt) =>
    new Promise((resolve) => {
      if (process.stdin.isTTY) {
        rl.question(prompt, resolve);
      } else {
        // 非TTY（パイプ等）の場合
        rl.once("line", resolve);
        process.stdout.write(prompt);
      }
    });

  console.log("=".repeat(60));
  console.log("  デイリースタンドアップアシスタント");
  console.log("=".repeat(60));
  console.log('終了するには "quit" または "exit" と入力してください。\n');

  // 今日の日付を渡して最初の挨拶を生成
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const openingMessage = {
    role: "user",
    content: `今日は${today}です。デイリースタンドアップを始めてください。`,
  };
  conversationHistory.push(openingMessage);

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
