// 오류 코드 18종 — docs/SPEC.md 2-6. 응답 형식: {"error":{"code","message"}}
// 문구 근거: SPEC 1-1·1-5·1-6·3-3, POLICY 3장. 근거 없는 문구는 (SPEC 제안) 표시.

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN_ORIGIN",
  "DUPLICATE",
  "FOLDER_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "TOO_MANY_FILES",
  "UNSUPPORTED_CLIPBOARD",
  "TEXT_EMPTY",
  "PLANET_NAME_INVALID",
  "PLANET_NAME_DUPLICATE",
  "PLANET_LIMIT",
  "PLANET_NOT_EMPTY",
  "PLANET_SYSTEM",
  "VAULT_UNAVAILABLE",
  "DISK_FULL",
  "ORIGINAL_MISSING",
  "NOT_FOUND",
  "INVALID_REQUEST", // 요청 본문이 JSON이 아니거나 너무 큼, 필수 값 없음 (개발 B, #4)
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: { code: ErrorCode; message: string };
}

/** 서버가 내려줄 HTTP 상태 (개발 B 제안, #4 서버가 그대로 사용) */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401, // 세션 토큰 없음·불일치
  FORBIDDEN_ORIGIN: 403, // Origin·Host 불일치 (P 1-3)
  DUPLICATE: 409,
  FOLDER_NOT_ALLOWED: 400,
  FILE_TOO_LARGE: 413,
  TOO_MANY_FILES: 413,
  UNSUPPORTED_CLIPBOARD: 415,
  TEXT_EMPTY: 400,
  PLANET_NAME_INVALID: 400,
  PLANET_NAME_DUPLICATE: 409,
  PLANET_LIMIT: 409,
  PLANET_NOT_EMPTY: 409,
  PLANET_SYSTEM: 403, // 미분류 이름 변경·삭제 시도
  VAULT_UNAVAILABLE: 503,
  DISK_FULL: 507,
  ORIGINAL_MISSING: 404, // 원본 열기·원본 바이트 요청 시
  NOT_FOUND: 404,
  INVALID_REQUEST: 400,
};

/**
 * 화면 기본 문구. 서버는 이 문구를 message에 담고, 웹·수집 앱은 code로 다시 찾아도 된다.
 * [행성], N 같은 자리는 쓰는 쪽이 채운다 (formatErrorMessage).
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "수집 앱의 [우주 보기]로 다시 열어 주세요", // SPEC 3-3
  FORBIDDEN_ORIGIN: "허용되지 않은 곳에서 온 요청이에요", // (SPEC 제안) 사용자에게는 거의 보이지 않음
  DUPLICATE: "이미 {planet}에 있는 별이에요", // SPEC 1-1, P 2-6
  FOLDER_NOT_ALLOWED: "폴더는 아직 넣을 수 없어요. 파일을 넣어 주세요", // P 3-3
  FILE_TOO_LARGE: "50MB가 넘는 파일은 넣을 수 없어요", // 브라우저 저장소 기준
  TOO_MANY_FILES: "한 번에 20개까지 넣을 수 있어요", // (SPEC 제안) P 2-6, 3-3
  UNSUPPORTED_CLIPBOARD: "지원하지 않는 형식이에요 ({format})", // (SPEC 제안) P 3-3 "형식 이름을 알려준다"
  TEXT_EMPTY: "넣을 내용이 비어 있어요", // P 3-3
  PLANET_NAME_INVALID: "행성 이름은 1~20자로 지어 주세요", // (SPEC 제안) P 2-4
  PLANET_NAME_DUPLICATE: "같은 이름의 행성이 이미 있어요", // (SPEC 제안) P 2-4
  PLANET_LIMIT: "행성은 50개까지 만들 수 있어요", // SPEC 1-5
  PLANET_NOT_EMPTY: "별이 남아 있는 행성은 지울 수 없어요", // (SPEC 제안) P 2-4
  PLANET_SYSTEM: "미분류 행성은 이름을 바꾸거나 지울 수 없어요", // (SPEC 제안) P 2-3
  VAULT_UNAVAILABLE: "보관함을 찾을 수 없어요", // P 3-1
  DISK_FULL: "디스크 공간이 부족해요", // (SPEC 제안) P 3-1
  ORIGINAL_MISSING: "원본을 찾을 수 없어요", // P 3-4
  NOT_FOUND: "찾는 기록이 없어요", // (SPEC 제안)
  INVALID_REQUEST: "요청 형식이 올바르지 않아요", // (SPEC 제안) 보통 코드 실수일 때만 보인다
};

export function formatErrorMessage(code: ErrorCode, vars: Record<string, string> = {}): string {
  return ERROR_MESSAGES[code].replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

export function apiError(code: ErrorCode, vars?: Record<string, string>): ApiError {
  return { error: { code, message: formatErrorMessage(code, vars) } };
}

export function isApiError(value: unknown): value is ApiError {
  const code = (value as ApiError | null)?.error?.code;
  return typeof code === "string" && (ERROR_CODES as readonly string[]).includes(code);
}
