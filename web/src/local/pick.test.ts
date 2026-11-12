import { test } from "node:test";
import assert from "node:assert/strict";
import { hash32, pickToday, type PickCandidate } from "./pick.ts";

// 결과가 실행하는 PC 시간대에 따라 달라지지 않게 고정한다 (packages/shared와 같은 방식)
process.env.TZ = "Asia/Seoul";

const NOW = new Date("2026-11-11T03:00:00Z"); // KST 11-11 12:00
const TODAY = "2026-11-11";
const star = (id: string, localDate: string): PickCandidate => ({ id, createdAtUtc: `${localDate}T03:00:00Z` });

test("7일 전 별이 있으면 그중에서 고른다", () => {
  const result = pickToday({ now: NOW, stars: [star("a", "2026-11-04"), star("b", "2026-10-28")], recentPickedStarIds: [] });
  assert.deepEqual(result, { starId: "a", daysAgo: 7 });
});

test("7일 전이 없으면 14일 전, 그다음 30일 전으로 넘어간다", () => {
  assert.deepEqual(pickToday({ now: NOW, stars: [star("b", "2026-10-28")], recentPickedStarIds: [] }), { starId: "b", daysAgo: 14 });
  assert.deepEqual(pickToday({ now: NOW, stars: [star("c", "2026-10-12")], recentPickedStarIds: [] }), { starId: "c", daysAgo: 30 });
});

test("최근 30일 안에 보여준 별은 뺀다", () => {
  const result = pickToday({ now: NOW, stars: [star("a", "2026-11-04"), star("b", "2026-10-28")], recentPickedStarIds: ["a"] });
  assert.deepEqual(result, { starId: "b", daysAgo: 14 });
});

test("후보가 없으면 null", () => {
  assert.equal(pickToday({ now: NOW, stars: [star("x", "2026-11-10")], recentPickedStarIds: [] }), null);
});

test("같은 날짜면 입력 순서와 상관없이 같은 별을 고른다", () => {
  const stars = ["s1", "s2", "s3", "s4", "s5"].map((id) => star(id, "2026-11-04"));
  const a = pickToday({ now: NOW, stars, recentPickedStarIds: [] });
  const b = pickToday({ now: NOW, stars: [...stars].reverse(), recentPickedStarIds: [] });
  assert.deepEqual(a, b);
  assert.equal(a?.starId, stars.map((s) => s.id).sort()[hash32(TODAY) % stars.length]);
});

test("현지 날짜는 지금 PC 시간대로 계산한다", () => {
  // 지금 = 서울·뉴욕 모두 11-11. 별 = 서울 11-04(7일 전), 뉴욕 11-03(8일 전)
  const now = new Date("2026-11-11T12:00:00Z");
  const s: PickCandidate = { id: "edge", createdAtUtc: "2026-11-04T02:00:00Z" };
  assert.deepEqual(pickToday({ now, stars: [s], recentPickedStarIds: [] }), { starId: "edge", daysAgo: 7 });
  process.env.TZ = "America/New_York";
  try {
    assert.equal(pickToday({ now, stars: [s], recentPickedStarIds: [] }), null);
  } finally {
    process.env.TZ = "Asia/Seoul";
  }
});

test("hash32는 결정적이고 32비트 부호 없는 정수다", () => {
  const h = hash32(TODAY);
  assert.equal(h, hash32(TODAY));
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});
