import type { ErrorCode } from "@spacelog/shared/errors";

/** 데이터 요청 실패. code 는 shared 오류 코드 또는 웹 전용 "STORAGE" · "UNKNOWN" */
export class RequestError extends Error {
  code: ErrorCode | "STORAGE" | "UNKNOWN";
  constructor(code: RequestError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** 브라우저 저장소(IndexedDB)를 열지 못할 때 */
export const STORAGE_MESSAGE = "브라우저 저장소를 열 수 없어요. 시크릿 창이 아닌지 확인해 주세요";
