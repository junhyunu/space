// 탐사선 cargo → 내보내기 기록 목록 (SPEC 3-8, POLICY 2-8).
// 절대 경로·storagePath는 절대 결과에 넣지 않는다.
import type { CargoItem, Planet, Star, StarKind } from "@spacelog/shared/types";
import { inPeriod, localDate } from "@spacelog/shared/period";

export const FILE_TEXT_LIMIT = 20_000;
export const TRUNCATION_MARK = "…(이하 생략)";
export const UNNAMED = "이름 없는 기록";
const TEXT_FILE_EXTENSIONS = [".txt", ".md"];

export interface ExportRecord {
  id: string;
  kind: StarKind;
  planetName: string;
  localDate: string; // "YYYY-MM-DD"
  dateTime: string; // "YYYY.MM.DD HH:mm"
  createdAtUtc: string;
  memo: string | null;
  textBody: string | null;
  url: string | null;
  linkTitle: string | null;
  fileName: string | null;
  mimeType: string | null;
}

export interface CollectContext {
  stars: readonly Star[];
  planets: readonly Planet[];
  now?: Date; // 현지 날짜 기준 시각 (기본: 지금)
  /** .txt·.md 원본 본문을 읽어 준다. 없거나 실패하면 null. */
  readFileText?: (star: Star) => string | null;
}

export function isTextFile(name: string | null): boolean {
  const lower = name?.toLowerCase() ?? "";
  return TEXT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function truncate(text: string, limit = FILE_TEXT_LIMIT): string {
  return text.length > limit ? text.slice(0, limit) + TRUNCATION_MARK : text;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 현지 "YYYY.MM.DD HH:mm" */
export function localDateTime(utcIso: string): string {
  const d = new Date(utcIso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveStarIds(items: readonly CargoItem[], ctx: CollectContext): Set<string> {
  const ids = new Set<string>();
  const known = new Set(ctx.stars.map((s) => s.id));
  for (const item of items) {
    if (item.type === "star") {
      if (known.has(item.starId)) ids.add(item.starId);
      continue;
    }
    for (const star of ctx.stars) {
      if (item.type === "planet" && star.planetId !== item.planetId) continue;
      if (inPeriod(star.createdAtUtc, item.period, ctx.now)) ids.add(star.id);
    }
  }
  return ids;
}

function toRecord(star: Star, planetName: string, ctx: CollectContext): ExportRecord {
  const isFile = star.kind === "file" || star.kind === "image";
  const fileText = isFile && isTextFile(star.originalName) ? (ctx.readFileText?.(star) ?? null) : null;
  const body = star.kind === "text" ? star.textBody : fileText;
  return {
    id: star.id,
    kind: star.kind,
    planetName,
    localDate: localDate(star.createdAtUtc, ctx.now),
    dateTime: localDateTime(star.createdAtUtc),
    createdAtUtc: star.createdAtUtc,
    memo: star.memo?.trim() ? star.memo : null,
    textBody: body == null ? null : fileText != null ? truncate(body) : body,
    url: star.kind === "link" ? star.url : null,
    linkTitle: star.kind === "link" ? (star.linkTitle ?? star.linkDomain) : null,
    fileName: isFile ? (star.originalName ?? UNNAMED) : null,
    mimeType: isFile ? star.mimeType : null,
  };
}

/** cargo를 펼쳐 중복을 빼고, 행성(첫 등장 순) → 넣은 시각순으로 정렬한다. */
export function collect(items: readonly CargoItem[], ctx: CollectContext): ExportRecord[] {
  const ids = resolveStarIds(items, ctx);
  const planetNames = new Map(ctx.planets.map((p) => [p.id, p.name]));
  const planetOrder = new Map(ctx.planets.map((p, i) => [p.id, i]));
  return ctx.stars
    .filter((s) => ids.has(s.id))
    .sort(
      (a, b) =>
        (planetOrder.get(a.planetId) ?? Infinity) - (planetOrder.get(b.planetId) ?? Infinity) ||
        a.createdAtUtc.localeCompare(b.createdAtUtc) ||
        a.id.localeCompare(b.id),
    )
    .map((s) => toRecord(s, planetNames.get(s.planetId) ?? "미분류", ctx));
}
