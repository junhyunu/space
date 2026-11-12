// 재발견 웹 쪽 (이슈 #7, SPEC 3-6). 카드 껍데기 UI는 개발 C(#3)가 만들고, 데이터·이벤트·별 열기는 여기서 맡는다.
// 스토어는 공개 계약(setGuestStar·flyToPlanet·openStar)만 쓴다.
import { useEffect, useState } from "react";
import { toLocalDateString } from "@spacelog/shared/period";
import type { RediscoveryEventRequest, RediscoveryTodayResponse, Star } from "@spacelog/shared/types";
import { api } from "../api/client.ts";
import { store, useStore } from "../state/store.ts";
import { cardShownKey, isInPeriod, rediscoveryToast, starLocalDate } from "./deepLink.ts";

/** 이벤트 기록은 측정용이라 실패해도 화면을 막지 않는다 */
function record(event: RediscoveryEventRequest): void {
  api.rediscoveryEvent(event).catch(() => {});
}

/**
 * 재발견 별 열기 (DESIGN v0.5 W-01). 기간은 바꾸지 않는다.
 * 기간 밖이면 그 별 하나만 핑크로 보이게(손님 별) 하고 → 그 행성으로 자동 비행 → 별 상세(W-03).
 * 손님 별은 W-03을 벗어나면 스토어가 숨기고, 자동 비행을 이동 키로 멈춰도 숨긴다.
 */
export async function openRediscoveredStar(star: Star): Promise<void> {
  const s = store.getState();
  const date = starLocalDate(star);
  const planetName = s.planets.find((p) => p.id === star.planetId)?.name ?? "행성";
  if (!isInPeriod(date, s.period)) s.setGuestStar(star);
  s.showToast(rediscoveryToast(date, s.period, planetName));
  // 비행 연출은 화면 갱신(requestAnimationFrame)에 묶여 있어, 탭이 가려져 있으면 끝나지 않는다.
  // 연출이 늦어도 별 상세는 반드시 열리도록 기다리는 시간을 제한한다.
  const arrived = await Promise.race([store.getState().flyToPlanet(star.planetId), wait(FLY_WAIT_LIMIT_MS).then(() => true)]);
  if (!arrived) {
    // 사용자가 이동 키로 자동 비행을 멈췄다 → 손님 별을 숨기고 상세는 열지 않는다
    if (store.getState().guestStar?.id === star.id) store.getState().setGuestStar(null);
    return;
  }
  store.getState().openStar(star.id);
}

/** 자동 비행(1.2초)보다 넉넉하게 */
export const FLY_WAIT_LIMIT_MS = 2500;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RediscoveryCardState {
  today: RediscoveryTodayResponse;
  /** 카드 [보러 가기] */
  open(): void;
  /** 카드 닫기 (오늘은 다시 보이지 않음) */
  dismiss(): void;
}

function markShownOnce(localDate: string, starId: string): boolean {
  const key = cardShownKey(localDate, starId);
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {
    // 저장소를 못 쓰면 매번 보낸다 (측정이 조금 부풀 뿐)
  }
  return true;
}

/**
 * 우주 홈 재발견 카드용 데이터 훅. 개발 C의 카드 UI가 쓴다.
 * today가 null이면(후보 없음·닫음) 카드를 띄우지 않는다.
 */
export function useRediscoveryCard(): RediscoveryCardState {
  const [today, setToday] = useState<RediscoveryTodayResponse>(null);
  // 전체 별 개수가 바뀌면(기록 넣기·예시 별) 카드가 아직 없을 때 다시 고른다. 닫은 별은 isDismissedToday 가 거른다
  const total = useStore((s) => s.planets.reduce((n, p) => n + (p.starCountTotal ?? 0), 0));

  useEffect(() => {
    if (today) return;
    let alive = true;
    api
      .rediscoveryToday()
      .then((res) => {
        if (!alive || !res) return;
        if (isDismissedToday(res.star.id)) return;
        setToday(res);
        if (markShownOnce(toLocalDateString(new Date()), res.star.id)) record({ starId: res.star.id, channel: "card", type: "shown" });
      })
      .catch(() => {}); // 카드는 보조 입구라 실패하면 띄우지 않는다
    return () => {
      alive = false;
    };
  }, [total, today]);

  return {
    today,
    open() {
      if (!today) return;
      record({ starId: today.star.id, channel: "card", type: "opened" });
      void openRediscoveredStar(today.star);
    },
    dismiss() {
      if (!today) return;
      record({ starId: today.star.id, channel: "card", type: "dismissed" });
      rememberDismissed(today.star.id);
      setToday(null);
    },
  };
}

const dismissedKey = (starId: string) => `${cardShownKey(toLocalDateString(new Date()), starId)}.dismissed`;
function isDismissedToday(starId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(starId)) === "1";
  } catch {
    return false;
  }
}
function rememberDismissed(starId: string): void {
  try {
    localStorage.setItem(dismissedKey(starId), "1");
  } catch {
    // 저장 못 하면 새로고침 때 다시 보인다
  }
}
