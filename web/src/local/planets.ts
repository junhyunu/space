// 기본 행성·자동 배정 키워드 (POLICY 2-3)와 ID 생성. 원래 서버(apps/server/vault/db.ts)에 있던 것을 웹으로 옮겼다.

export const UNCATEGORIZED_ID = "planet_uncategorized";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 앞 10자 = 밀리초 시각, 뒤 16자 = 무작위. 같은 시각 안의 순서는 보장하지 않는다 */
export function ulid(timeMs: number = Date.now()): string {
  let time = "";
  for (let t = timeMs, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  let rand = "";
  for (const b of crypto.getRandomValues(new Uint8Array(16))) rand += CROCKFORD[b % 32];
  return time + rand;
}

/** 행성 자동 배정 키워드 (POLICY 2-3 표). 화면에는 내보내지 않는다 */
export interface PlanetKeywords {
  words: string[];
  domains: string[];
  exts: string[];
}

/** 첫 실행 때 만드는 기본 행성. 순서 = 동점일 때 고르는 순서 */
export const DEFAULT_PLANETS: { name: string; keywords: PlanetKeywords }[] = [
  {
    name: "업무",
    keywords: {
      words: ["회의", "회의록", "보고서", "기획", "제안서", "견적", "계약", "일정", "업무", "주간보고", "결재", "발표", "meeting", "minutes", "report", "proposal", "plan", "invoice", "kpi", "okr"],
      domains: ["notion.so", "slack.com", "docs.google.com", "drive.google.com", "atlassian.net", "office.com"],
      exts: ["ppt", "pptx", "xls", "xlsx"],
    },
  },
  {
    name: "공부",
    keywords: {
      words: ["강의", "과제", "시험", "요약", "강의노트", "필기", "수업", "스터디", "논문", "레포트", "자격증", "기출", "lecture", "study", "exam", "assignment", "course", "paper", "notes"],
      domains: ["inflearn.com", "coursera.org", "udemy.com", "arxiv.org", "scholar.google.com", "riss.kr", "dbpia.co.kr", "wikipedia.org"],
      exts: ["hwp", "hwpx"],
    },
  },
  {
    name: "개발",
    keywords: {
      words: ["소스코드", "에러", "오류", "버그", "배포", "서버", "함수", "code", "error", "bug", "api", "deploy", "react", "python", "sql", "docker", "git"],
      domains: ["github.com", "stackoverflow.com", "velog.io", "developer.mozilla.org", "npmjs.com"],
      exts: ["py", "js", "ts", "json", "sql", "log"],
    },
  },
  {
    name: "디자인",
    keywords: {
      words: ["디자인", "레퍼런스", "시안", "무드보드", "로고", "폰트", "색상", "아이콘", "design", "reference", "moodboard", "ui", "ux", "logo", "font", "palette"],
      domains: ["figma.com", "behance.net", "dribbble.com", "pinterest.com", "mobbin.com"],
      exts: ["fig", "psd", "ai", "sketch"],
    },
  },
  {
    name: "읽을거리",
    keywords: {
      words: ["뉴스", "아티클", "칼럼", "블로그", "영상", "인터뷰", "나중에", "article", "news", "blog", "video"],
      domains: ["youtube.com", "youtu.be", "medium.com", "brunch.co.kr", "blog.naver.com"],
      exts: [],
    },
  },
  {
    name: "생활",
    keywords: {
      words: ["여행", "맛집", "예약", "쇼핑", "영수증", "레시피", "항공권", "숙소", "주문", "travel", "recipe", "receipt", "order"],
      domains: ["coupang.com", "musinsa.com", "map.naver.com", "airbnb.co.kr"],
      exts: [],
    },
  },
];
