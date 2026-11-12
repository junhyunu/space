// Claude 프롬프트 형식 (SPEC 3-8 초안). 구조·안내 문구는 개발 A가 확정한다.
import type { ExportRecord } from "./collect.ts";

const dotDate = (localDate: string) => localDate.replaceAll("-", ".");

/** 사용자 글 안의 닫는 태그가 구조를 깨지 않게 막는다. */
const guard = (text: string) => text.replace(/<\/(archive|planet|record)/gi, "<\\/$1");
const attr = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function recordLines(r: ExportRecord): string[] {
  const lines: string[] = [];
  if (r.fileName) lines.push(`파일: ${r.fileName}${r.mimeType ? ` (${r.mimeType})` : ""}`);
  if (r.linkTitle) lines.push(`제목: ${r.linkTitle}`);
  if (r.url) lines.push(`URL: ${r.url}`);
  if (r.textBody) lines.push(`본문: ${r.textBody}`);
  if (r.memo) lines.push(`메모: ${r.memo}`);
  return lines.map(guard);
}

export function periodLabel(records: readonly ExportRecord[]): string {
  if (records.length === 0) return "";
  const dates = records.map((r) => r.localDate).sort();
  const from = dotDate(dates[0]);
  const to = dotDate(dates[dates.length - 1]);
  return from === to ? from : `${from} ~ ${to}`;
}

export function toClaudePrompt(records: readonly ExportRecord[]): string {
  const period = periodLabel(records);
  const out = [
    `아래는 내가 ${period}에 모아 둔 자료 ${records.length}개야. 행성(카테고리)별로 정리돼 있어.`,
    `<archive period="${attr(period)}" count="${records.length}">`,
  ];
  let currentPlanet: string | null = null;
  for (const r of records) {
    if (r.planetName !== currentPlanet) {
      if (currentPlanet !== null) out.push("</planet>");
      out.push(`<planet name="${attr(r.planetName)}">`);
      currentPlanet = r.planetName;
    }
    out.push(`<record kind="${r.kind}" date="${r.dateTime}">`, ...recordLines(r), "</record>");
  }
  if (currentPlanet !== null) out.push("</planet>");
  out.push("</archive>");
  return out.join("\n");
}
