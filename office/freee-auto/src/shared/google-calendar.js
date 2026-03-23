/**
 * google-calendar.js
 * Google Calendar API ヘルパー
 *
 * 認証は google-auth.js の共通モジュールを使用。
 * 対象カレンダー: SY_白根 / _共通
 */

"use strict";

const { google } = require("googleapis");
const { getAuthClient } = require("./google-auth");

// 取得する予定の対象カレンダー名（部分一致）
const TARGET_CALENDAR_NAMES = ["SY_白根", "_共通"];

/**
 * カレンダー一覧からターゲット名に一致するものを返す
 */
async function getTargetCalendars(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list();
  const items = res.data.items || [];
  return items.filter((cal) =>
    TARGET_CALENDAR_NAMES.some((name) => (cal.summary || "").includes(name))
  );
}

/**
 * 指定日の予定一覧を取得する
 * @param {Date} date - 対象日
 * @returns {{events: Array, calendarNames: string[]}}
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
