// 재발견 별 열기 계산 (DESIGN v0.5 W-01 "재발견으로 들어온 별이 기간 밖일 때"). 화면·스토어와 분리해 테스트한다.
import { localDate, parseLocalDate, toLocalDateString } from "@spacelog/shared/period";
import type { Period, Star } from "@spacelog/shared/types";

/** 별의 현지 날짜. 미리 계산된 값이 있으면 그것을 쓴다 */
export function starLocalDate(star: Pick<Star, "createdAtUtc" | "localDate">, now: Date = new Date()): string {
  return star.localDate ?? localDate(star.createdAtUtc, now);
}

/** 별 날짜가 기간 안인지 (양 끝 포함) */
export function isInPeriod(starDate: string, period: Period): boolean {
  return period.from <= starDate && starDate <= period.to;
}

/** 별을 넣은 지 며칠인지 (오늘 = 0) */
export function daysSince(starDate: string, now: Date = new Date()): number {
  const ms = parseLocalDate(toLocalDateString(now)).getTime() - parseLocalDate(starDate).getTime();
  return Math.round(ms / 86_400_000);
}

/** 이름 뒤 조사 "(으)로": 받침이 있으면 "으로", 없거나 ㄹ 받침이면 "로" */
export function withRo(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${name}(으)로`; // 한글이 아니면 둘 다 적는다
  const jong = code % 28;
  return `${name}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

/**
 * 재발견 별을 열 때 띄울 토스트 (DESIGN v0.5).
 * 기간 밖: "7일 전 별이라 이 별만 잠시 보여드려요", 기간 안: "'업무'로 비행 중…"
 */
export function rediscoveryToast(starDate: string, period: Period, planetName: string, now: Date = new Date()): string {
  if (isInPeriod(starDate, period)) return `'${planetName}'${withRo(planetName).slice(planetName.length)} 비행 중…`;
  return `${daysSince(starDate, now)}일 전 별이라 이 별만 잠시 보여드려요`;
}

/** 카드 shown 이벤트는 그날 처음 1회만 보낸다 (이슈 #7). 저장 키 */
export function cardShownKey(localDate: string, starId: string): string {
  return `spacelog.rediscovery.cardShown.${localDate}.${starId}`;
}
