// 데이터 창구. 원래는 로컬 서버 fetch 래퍼였고, 지금은 브라우저 저장소(local/)를 부른다.
// - 화면은 이 api 객체만 쓴다 (예전 서버 API와 같은 모양)
// - 저장소를 못 열면 connection = "lost", 성공하면 "ok"
import { idbArchive } from "../local/archive.ts";
import { createLocalApi, type CreateInput, type LocalApi } from "../local/localApi.ts";
import { seedDemo } from "../local/seed.ts";
import { RequestError, STORAGE_MESSAGE } from "./errors.ts";

export { RequestError, STORAGE_MESSAGE } from "./errors.ts";

type Listeners = { onConnection(s: "ok" | "lost"): void };
let listeners: Listeners = { onConnection() {} };
export function setApiListeners(l: Listeners): void {
  listeners = l;
}

export type Backend = Pick<LocalApi, "universe" | "star" | "createStars" | "thumbnailUrl" | "exportCargo" | "rediscoveryToday" | "rediscoveryEvent"> & {
  seedDemo(): Promise<number>;
};

function defaultBackend(): Backend {
  const archive = idbArchive();
  return { ...createLocalApi(archive), seedDemo: () => seedDemo(archive) };
}

let backend: Backend | null = null;
/** 테스트가 가짜 저장소를 끼운다. null 이면 다음 호출 때 IndexedDB 로 돌아간다 */
export function setBackend(b: Backend | null): void {
  backend = b;
}

async function call<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  try {
    const result = await fn((backend ??= defaultBackend()));
    listeners.onConnection("ok");
    return result;
  } catch (e) {
    if (e instanceof RequestError) {
      listeners.onConnection("ok");
      throw e;
    }
    listeners.onConnection("lost");
    throw new RequestError("STORAGE", STORAGE_MESSAGE);
  }
}

export const api = {
  universe: (from: string, to: string) => call((b) => b.universe(from, to)),
  star: (id: string) => call((b) => b.star(id)),
  /** 기록 넣기 (웹 입력창·끌어다 놓기·붙여넣기) */
  createStars: (input: CreateInput) => call((b) => b.createStars(input)),
  /** 이미지 별의 원본 → blob URL. 다 쓰면 URL.revokeObjectURL 로 해제한다 */
  thumbnailUrl: (starId: string) => call((b) => b.thumbnailUrl(starId)),
  /** 탐사선 내보내기 생성 (SPEC 3-8). 복사는 웹이 한다 */
  exportCargo: (body: Parameters<Backend["exportCargo"]>[0]) => call((b) => b.exportCargo(body)),
  /** 오늘의 재발견 별 (SPEC 3-6). 후보가 없으면 null */
  rediscoveryToday: () => call((b) => b.rediscoveryToday()),
  /** 재발견 이벤트 기록 */
  rediscoveryEvent: (body: Parameters<Backend["rediscoveryEvent"]>[0]) => call((b) => b.rediscoveryEvent(body)),
  /** 빈 우주에 예시 별 넣기. 넣은 개수 (이미 별이 있으면 0) */
  seedDemo: () => call((b) => b.seedDemo()),
};
