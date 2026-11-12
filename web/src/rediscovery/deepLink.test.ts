import { test } from "node:test";
import assert from "node:assert/strict";
import type { Period } from "@spacelog/shared/types";
import { cardShownKey, periodToShowStar, starLocalDate } from "./deepLink.ts";

process.env.TZ = "Asia/Seoul";
const NOW = new Date("2026-11-11T03:00:00Z"); // KST 11-11 12:00
const TODAY: Period = { preset: "today", from: "2026-11-11", to: "2026-11-11" };
const WEEK: Period = { preset: "week", from: "2026-11-09", to: "2026-11-11" };

test("기간 안의 별이면 기간을 바꾸지 않는다", () => {
  assert.equal(periodToShowStar("2026-11-10", WEEK, NOW), null);
  assert.equal(periodToShowStar("2026-11-11", TODAY, NOW), null);
});

test("기간 밖의 별이면 직접 지정 [별 날짜 ~ 오늘]", () => {
  assert.deepEqual(periodToShowStar("2026-11-04", TODAY, NOW), { preset: "custom", from: "2026-11-04", to: "2026-11-11" });
  assert.deepEqual(periodToShowStar("2026-10-12", WEEK, NOW), { preset: "custom", from: "2026-10-12", to: "2026-11-11" });
});

test("별 날짜: 서버 localDate 우선, 없으면 지금 PC 시간대로 계산", () => {
  assert.equal(starLocalDate({ createdAtUtc: "2026-11-03T20:00:00Z", localDate: "2026-11-01" }, NOW), "2026-11-01");
  assert.equal(starLocalDate({ createdAtUtc: "2026-11-03T20:00:00Z" }, NOW), "2026-11-04");
});

test("카드 shown 키는 날짜·별마다 다르다", () => {
  assert.notEqual(cardShownKey("2026-11-11", "a"), cardShownKey("2026-11-12", "a"));
  assert.notEqual(cardShownKey("2026-11-11", "a"), cardShownKey("2026-11-11", "b"));
});
