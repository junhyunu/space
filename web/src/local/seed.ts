// 예시 별 (원래 apps/server/vault/seed.ts): 7일 전 별 3개(재발견용) + 이번 주 별 20개.
// 빈 우주의 [예시 별 넣기] 버튼이 부른다. 이미 별이 있으면 넣지 않는다.
import { addDays, parseLocalDate, toLocalDateString, weekPeriod } from "@spacelog/shared/period";
import type { Star } from "@spacelog/shared/types";
import type { Archive } from "./archive.ts";
import { ulid } from "./planets.ts";

type Seed = { planet: string; text?: string; url?: string };

const WEEK_AGO: Seed[] = [
  { planet: "디자인", url: "https://www.figma.com/community/file/onboarding-moodboard" },
  { planet: "공부", text: "강의노트: 3D 좌표계 — 카메라는 lookAt으로, 행성 궤도는 반지름·각속도로 정한다." },
  { planet: "업무", text: "회의록: 데모 동선은 기록 넣기 → 우주 → 재발견 → 탐사선 순서로 간다." },
];

const THIS_WEEK: Seed[] = [
  { planet: "업무", text: "주간보고 초안: 웹 기록 넣기 완성, 브라우저 저장소 연결." },
  { planet: "업무", url: "https://www.notion.so/spacelog/sprint-plan" },
  { planet: "업무", text: "발표 준비: 3분 데모 + 질의응답 2분. 시연 PC 해상도 확인." },
  { planet: "업무", url: "https://docs.google.com/presentation/d/demo-deck" },
  { planet: "업무", text: "회의: 행성 자동 배정은 키워드 규칙으로 확정." },
  { planet: "공부", url: "https://www.inflearn.com/course/threejs-basics" },
  { planet: "공부", text: "스터디 요약: IndexedDB는 브라우저 안의 키-값 저장소라 파일도 Blob으로 넣을 수 있다." },
  { planet: "공부", url: "https://arxiv.org/abs/2106.09685" },
  { planet: "공부", text: "과제: 망각 곡선 정리 — 7일·14일·30일 간격 복습이 기억 유지에 효과적." },
  { planet: "공부", text: "시험 범위: 운영체제 4~7장, 기출 2회분 풀기." },
  { planet: "개발", url: "https://developer.mozilla.org/docs/Web/API/IndexedDB_API" },
  { planet: "개발", text: "에러 메모: 시크릿 창에서는 저장소가 창을 닫으면 사라진다." },
  { planet: "개발", url: "https://stackoverflow.com/questions/three-js-orbit-controls" },
  { planet: "개발", text: "배포 체크: 정적 사이트라 빌드 폴더만 올리면 된다." },
  { planet: "개발", url: "https://developer.mozilla.org/docs/Web/API/WebGL_API" },
  { planet: "디자인", url: "https://dribbble.com/shots/space-dashboard" },
  { planet: "디자인", text: "색상 토큰: planet-1~7, 배경은 깊은 남색, 별은 따뜻한 흰색." },
  { planet: "디자인", url: "https://www.behance.net/gallery/space-ui" },
  { planet: "디자인", text: "폰트 후보: Pretendard 본문, 제목은 자간 -2%." },
  { planet: "디자인", url: "https://mobbin.com/browse/web/flows/onboarding" },
];

const TODAY_COUNT = 6;
const HOUR = 3_600_000;

function toStar(seed: Seed, at: Date, planetId: string): Star {
  const createdAtUtc = at.toISOString();
  const link = seed.url ? new URL(seed.url) : null;
  return {
    id: ulid(at.getTime()),
    kind: link ? "link" : "text",
    planetId,
    createdAtUtc,
    tzOffsetMin: -at.getTimezoneOffset(),
    updatedAtUtc: createdAtUtc,
    storagePath: null, originalName: null, mimeType: null, sizeBytes: null, sha256: null,
    url: seed.url ?? null,
    linkTitle: null,
    linkDomain: link ? link.hostname.replace(/^www\./, "") : null,
    textBody: seed.text ?? null,
    thumbnailPath: null, thumbnailStatus: "fallback", linkFetchStatus: "none", memo: null,
  };
}

/** 시각을 정해 넣는다. 미래 시각은 만들지 않는다. 넣은 개수를 돌려준다 */
export async function seedDemo(archive: Archive, now: Date = new Date()): Promise<number> {
  if ((await archive.listStars()).length > 0) return 0;
  const planetId = new Map((await archive.listPlanets()).map((p) => [p.name, p.id]));

  const today = toLocalDateString(now);
  const weekAgoStart = parseLocalDate(addDays(today, -7)).getTime();
  const weekStart = parseLocalDate(weekPeriod(now).from).getTime();
  const todayStart = parseLocalDate(today).getTime();

  const times: number[] = WEEK_AGO.map((_, i) => weekAgoStart + (10 + i * 3) * HOUR);
  const earlyCount = THIS_WEEK.length - TODAY_COUNT;
  const earlyEnd = todayStart > weekStart ? todayStart : Math.max(weekStart, now.getTime() - (TODAY_COUNT + 1) * 5 * 60_000);
  for (let i = 0; i < earlyCount; i++) times.push(weekStart + Math.floor(((earlyEnd - weekStart) * (i + 0.5)) / earlyCount));
  for (let i = TODAY_COUNT; i >= 1; i--) times.push(Math.max(todayStart, now.getTime() - i * 5 * 60_000));

  const seeds = [...WEEK_AGO, ...THIS_WEEK];
  for (const [i, s] of seeds.entries()) {
    const pid = planetId.get(s.planet);
    if (pid) await archive.addStar(toStar(s, new Date(times[i]), pid));
  }
  return seeds.length;
}
