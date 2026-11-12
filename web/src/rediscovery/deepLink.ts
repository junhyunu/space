// 재발견 별 열기 계산 (SPEC 3-6 "딥링크로 별 열기", 6장 S3 제안). 화면·스토어와 분리해 테스트한다.
import { customPeriod, localDate, toLocalDateString } from "@spacelog/shared/period";
import type { Period, Star } from "@spacelog/shared/types";

/** 별의 현지 날짜. 서버가 계산해 준 값이 있으면 그것을 쓴다 */
export function starLocalDate(star: Pick<Star, "createdAtUtc" | "localDate">, now: Date = new Date()): string {
  return star.localDate ?? localDate(star.createdAtUtc, now);
}

/**
 * 별이 지금 기간 밖이면 `직접 지정 [별 날짜 ~ 오늘]` 기간을 돌려준다. 안이면 null (기간을 바꾸지 않음).
 * 7·14·30일 전 별이라 1년 제한에 걸리지 않는다.
 */
export function periodToShowStar(starDate: string, current: Period, now: Date = new Date()): Period | null {
  if (current.from <= starDate && starDate <= current.to) return null;
  return customPeriod(starDate, toLocalDateString(now));
}

/** 카드 shown 이벤트는 그날 처음 1회만 보낸다 (이슈 #7). 저장 키 */
export function cardShownKey(localDate: string, starId: string): string {
  return `spacelog.rediscovery.cardShown.${localDate}.${starId}`;
}
