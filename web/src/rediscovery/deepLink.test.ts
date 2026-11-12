import { test } from "node:test";
import assert from "node:assert/strict";
import type { Period } from "@spacelog/shared/types";
import { cardShownKey, daysSince, isInPeriod, rediscoveryToast, starLocalDate, withRo } from "./deepLink.ts";

process.env.TZ = "Asia/Seoul";
const NOW = new Date("2026-11-11T03:00:00Z"); // KST 11-11 12:00
const TODAY: Period = { preset: "today", from: "2026-11-11", to: "2026-11-11" };
const WEEK: Period = { preset: "week", from: "2026-11-09", to: "2026-11-11" };

test("기간 안·밖 판별 (양 끝 포함)", () => {
  assert.equal(isInPeriod("2026-11-10", WEEK), true);
  assert.equal(isInPeriod("2026-11-09", WEEK), true);
  assert.equal(isInPeriod("2026-11-04", TODAY), false);
});

test("기간 밖이면 기간은 그대로 두고 'N일 전 별' 토스트 (DESIGN v0.5)", () => {
  assert.equal(daysSince("2026-11-04", NOW), 7);
  assert.equal(rediscoveryToast("2026-11-04", TODAY, "업무", NOW), "7일 전 별이라 이 별만 잠시 보여드려요");
  assert.equal(rediscoveryToast("2026-10-12", WEEK, "업무", NOW), "30일 전 별이라 이 별만 잠시 보여드려요");
});

test("기간 안이면 \"'행성'(으)로 비행 중…\" 토스트, 받침에 맞춰 조사를 고른다", () => {
  assert.equal(rediscoveryToast("2026-11-10", WEEK, "업무", NOW), "'업무'로 비행 중…");
  assert.equal(rediscoveryToast("2026-11-10", WEEK, "공부방", NOW), "'공부방'으로 비행 중…");
  assert.equal(withRo("서울"), "서울로", "ㄹ 받침은 '로'");
  assert.equal(withRo("Design"), "Design(으)로");
});

test("별 날짜: 서버 localDate 우선, 없으면 지금 PC 시간대로 계산", () => {
  assert.equal(starLocalDate({ createdAtUtc: "2026-11-03T20:00:00Z", localDate: "2026-11-01" }, NOW), "2026-11-01");
  assert.equal(starLocalDate({ createdAtUtc: "2026-11-03T20:00:00Z" }, NOW), "2026-11-04");
});

test("카드 shown 키는 날짜·별마다 다르다", () => {
  assert.notEqual(cardShownKey("2026-11-11", "a"), cardShownKey("2026-11-12", "a"));
  assert.notEqual(cardShownKey("2026-11-11", "a"), cardShownKey("2026-11-11", "b"));
});
