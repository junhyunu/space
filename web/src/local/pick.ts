// 오늘의 재발견 별 고르기 (SPEC 3-6, POLICY 2-2). 저장·조회는 호출하는 쪽(라우트)이 맡는다.
// 날짜는 공유 유틸과 같이 "지금 PC 시간대" 기준이다.
import type { DaysAgo } from "@spacelog/shared/types";
import { addDays, localDate, toLocalDateString } from "@spacelog/shared/period";

/** 7일 전 → 14일 전 → 30일 전 순서로 찾는다 (SQ1). */
export const REDISCOVERY_DAYS: readonly DaysAgo[] = [7, 14, 30];

export interface PickCandidate {
  id: string;
  createdAtUtc: string;
}

export interface PickInput {
  stars: readonly PickCandidate[];
  recentPickedStarIds: Iterable<string>; // 최근 30일 안에 픽된 별
  now?: Date;
}

export interface PickResult {
  starId: string;
  daysAgo: DaysAgo;
}

/** FNV-1a 32비트. 날짜 문자열을 시드로 쓴다. */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function pickToday({ stars, recentPickedStarIds, now = new Date() }: PickInput): PickResult | null {
  const today = toLocalDateString(now);
  const excluded = new Set(recentPickedStarIds);
  const byLocalDate = new Map<string, string[]>();
  for (const star of stars) {
    if (excluded.has(star.id)) continue;
    const date = localDate(star.createdAtUtc, now);
    byLocalDate.set(date, [...(byLocalDate.get(date) ?? []), star.id]);
  }

  for (const daysAgo of REDISCOVERY_DAYS) {
    const candidates = byLocalDate.get(addDays(today, -daysAgo));
    if (!candidates?.length) continue;
    const sorted = [...candidates].sort();
    return { starId: sorted[hash32(today) % sorted.length], daysAgo };
  }
  return null;
}
