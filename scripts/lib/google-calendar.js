/**
 * google-calendar.js
 * Google Calendar API ヘルパー
 *
 * 初回セットアップ:
 *   1. https://console.cloud.google.com/ でプロジェクトを作成
 *   2. Google Calendar API を有効化
 *   3. OAuth2 認証情報（デスクトップアプリ）を作成し credentials.json をこのリポジトリのルートに置く
 *   4. 初回実行時にブラウザで認証 → token.json が自動生成される
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const readline = require("readline");

const ROOT = path.join(__dirname, "..", "..");
const CREDENTIALS_PATH = path.join(ROOT, "credentials.json");
const TOKEN_PATH = path.join(ROOT, "token.json");

// 取得する予定の対象カレンダー名（部分一致）
const TARGET_CALENDAR_NAMES = ["SY_白根", "_共通"];

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * OAuth2 クライアントを初期化して返す
 */
async function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json が見つかりません: ${CREDENTIALS_PATH}\n` +
        "Google Cloud Console で OAuth2 認証情報を作成し、credentials.json をリポジトリルートに置いてください。\n" +
        "詳細: https://developers.google.com/calendar/api/quickstart/nodejs"
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
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
    return oAuth2Client;
  }

  return await authorizeNewToken(oAuth2Client);
}

/**
 * 初回認証フロー（ブラウザ → コード入力）
 */
async function authorizeNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\n[Google Calendar 認証]\nブラウザで以下のURLを開いてください:\n");
  console.log(authUrl);
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
  return oAuth2Client;
}

/**
 * カレンダー一覧を取得し、ターゲット名に一致するものを返す
 */
async function getTargetCalendars(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list();
  const items = res.data.items || [];
  return items.filter((cal) =>
    TARGET_CALENDAR_NAMES.some((name) =>
      (cal.summary || "").includes(name)
    )
  );
}

/**
 * 指定日の予定一覧を取得する
 * @param {Date} date - 対象日
 * @returns {Array<{calendar, title, start, end, allDay, location, description}>}
 */
async function getEventsForDate(date) {
  const auth = await getAuthClient();
  const calendars = await getTargetCalendars(auth);

  if (calendars.length === 0) {
    return { events: [], calendarNames: [] };
  }

  const calendarApi = google.calendar({ version: "v3", auth });
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const allEvents = [];

  for (const cal of calendars) {
    const res = await calendarApi.events.list({
      calendarId: cal.id,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    for (const ev of res.data.items || []) {
      const allDay = !!ev.start.date;
      allEvents.push({
        calendar: cal.summary,
        title: ev.summary || "(タイトルなし)",
        start: allDay ? null : new Date(ev.start.dateTime),
        end: allDay ? null : new Date(ev.end.dateTime),
        allDay,
        location: ev.location || null,
        description: ev.description || null,
      });
    }
  }

  // 時刻順ソート（終日イベントを先頭に）
  allEvents.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    if (a.start && b.start) return a.start - b.start;
    return 0;
  });

  return {
    events: allEvents,
    calendarNames: calendars.map((c) => c.summary),
  };
}

/**
 * イベント一覧を人間が読みやすいテキストに変換する
 */
function formatEventsAsText(date, events, calendarNames) {
  const dateStr = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  if (events.length === 0) {
    return `【${dateStr}の予定】\n予定はありません。\n`;
  }

  const lines = [`【${dateStr}の予定】（カレンダー: ${calendarNames.join(", ")}）`];
  for (const ev of events) {
    if (ev.allDay) {
      lines.push(`  • [終日] ${ev.title}`);
    } else {
      const fmt = (d) =>
        d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      lines.push(`  • ${fmt(ev.start)}〜${fmt(ev.end)} ${ev.title}`);
    }
    if (ev.location) lines.push(`      📍 ${ev.location}`);
  }
  return lines.join("\n") + "\n";
}

module.exports = { getEventsForDate, formatEventsAsText };
