// 서버 API를 브라우저 안에서 대신한다. 조회·재발견·내보내기 로직은 원래 서버(apps/server/routes)의 것을 그대로 옮겼다.
import { ERROR_MESSAGES, formatErrorMessage } from "@spacelog/shared/errors";
import { addDays, customPeriod, localDate, periodUtcBounds, toLocalDateString } from "@spacelog/shared/period";
import type {
  CreateStarsResponse,
  ExportRequest,
  ExportResponse,
  RediscoveryEventRequest,
  RediscoveryTodayResponse,
  Star,
  UniverseResponse,
} from "@spacelog/shared/types";
import { RequestError } from "../api/errors.ts";
import type { Archive, PlanetRow } from "./archive.ts";
import { assignPlanet, type AssignInput } from "./assignPlanet.ts";
import { buildExport } from "./export/buildExport.ts";
import { isTextFile } from "./export/collect.ts";
import { pickToday } from "./pick.ts";
import { UNCATEGORIZED_ID, ulid } from "./planets.ts";

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 브라우저 저장소라 서버(200MB)보다 작게
export const MAX_FILES = 20;
export const MAX_TEXT_CHARS = 100_000; // 넘으면 .txt 파일 기록으로
/** "최근 30일 안에 픽된 별은 뺀다" (SPEC 3-6) */
export const RECENT_PICK_DAYS = 30;

/** 기록 넣기 입력. 폴더는 화면에서 걸러 folders 개수로 넘긴다 */
export interface CreateInput {
  files?: File[];
  text?: string;
  folders?: number;
}

export type LocalApi = ReturnType<typeof createLocalApi>;

const notFound = () => new RequestError("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
const withDate = (s: Star, now: Date): Star => ({ ...s, localDate: localDate(s.createdAtUtc, now), originalMissing: false });

/** 한 줄짜리 http(s) 주소면 URL, 아니면 null */
export function asLink(text: string): URL | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** "보고서.final.PPTX" → { base: "보고서.final", ext: "pptx" } */
function splitName(name: string | null): { base: string | null; ext: string | null } {
  if (!name) return { base: null, ext: null };
  const m = /^(.*)\.([A-Za-z0-9]{1,10})$/.exec(name);
  return m && m[1] ? { base: m[1], ext: m[2].toLowerCase() } : { base: name, ext: null };
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createLocalApi(archive: Archive, clock: () => Date = () => new Date()) {
  function newStar(planets: PlanetRow[], now: Date, fields: Partial<Star> & Pick<Star, "kind">, assign: AssignInput): Star {
    const at = now.toISOString();
    return {
      id: ulid(now.getTime()),
      planetId: assignPlanet(planets, assign, UNCATEGORIZED_ID),
      createdAtUtc: at,
      tzOffsetMin: -now.getTimezoneOffset(),
      updatedAtUtc: at,
      storagePath: null, originalName: null, mimeType: null, sizeBytes: null, sha256: null,
      url: null, linkTitle: null, linkDomain: null, textBody: null,
      thumbnailPath: null, thumbnailStatus: "fallback", linkFetchStatus: "none", memo: null,
      ...fields,
    };
  }

  async function saveFile(r: CreateStarsResponse, planets: PlanetRow[], file: Blob, name: string | null, now: Date, force: { kind?: Star["kind"]; ext?: string } = {}) {
    if (file.size > MAX_FILE_BYTES) {
      r.rejected.push({ name, code: "FILE_TOO_LARGE", message: formatErrorMessage("FILE_TOO_LARGE") });
      return;
    }
    const sha256 = await sha256Hex(file);
    const existing = await archive.findStarBySha256(sha256);
    if (existing) {
      const planetName = planets.find((p) => p.id === existing.planetId)?.name ?? "미분류";
      r.duplicates.push({ name, existingStarId: existing.id, planetId: existing.planetId, planetName });
      return;
    }
    const { base, ext: nameExt } = splitName(name);
    const ext = force.ext ?? nameExt;
    const mimeType = file.type || null;
    const kind = force.kind ?? (mimeType?.startsWith("image/") ? "image" : "file");
    const star = newStar(planets, now, {
      kind, originalName: name, mimeType, sizeBytes: file.size, sha256,
      storagePath: `idb:${ext ?? "bin"}`, // 원본은 IndexedDB originals 에 별 id로 저장
      thumbnailStatus: kind === "image" ? "ready" : "fallback", // 이미지는 원본을 썸네일로 쓴다
    }, { name: base, ext });
    await archive.addStar(star, file);
    r.created.push(withDate(star, now));
  }

  return {
    /** 기간 안의 별 + 모든 행성(기간 안·전체 별 개수) */
    async universe(from: string, to: string): Promise<UniverseResponse> {
      const now = clock();
      let period;
      try {
        period = customPeriod(from, to);
      } catch {
        throw new RequestError("INVALID_REQUEST", "날짜 형식이 올바르지 않아요");
      }
      const { startUtc, endUtc } = periodUtcBounds(period, now);
      const all = await archive.listStars();
      const stars = all.filter((s) => s.createdAtUtc >= startUtc && (endUtc === null || s.createdAtUtc < endUtc)).map((s) => withDate(s, now));
      const inPeriod: Record<string, number> = {};
      const total: Record<string, number> = {};
      for (const s of stars) inPeriod[s.planetId] = (inPeriod[s.planetId] ?? 0) + 1;
      for (const s of all) total[s.planetId] = (total[s.planetId] ?? 0) + 1;
      const planets = (await archive.listPlanets()).map(({ keywords: _k, order: _o, ...p }) => ({
        ...p,
        starCountInPeriod: inPeriod[p.id] ?? 0,
        starCountTotal: total[p.id] ?? 0,
      }));
      return { stars, planets };
    },

    async star(id: string): Promise<Star> {
      const s = await archive.getStar(id);
      if (!s) throw notFound();
      return withDate(s, clock());
    },

    /** 기록 넣기: 파일 여러 개 또는 글 하나(한 줄 주소면 링크). 일부만 실패해도 나머지는 저장 (P 3-3) */
    async createStars(input: CreateInput): Promise<CreateStarsResponse> {
      const now = clock();
      const planets = await archive.listPlanets();
      const r: CreateStarsResponse = { created: [], duplicates: [], rejected: [] };
      for (let i = 0; i < (input.folders ?? 0); i++) {
        r.rejected.push({ name: null, code: "FOLDER_NOT_ALLOWED", message: formatErrorMessage("FOLDER_NOT_ALLOWED") });
      }
      for (const [i, f] of (input.files ?? []).entries()) {
        if (i >= MAX_FILES) r.rejected.push({ name: f.name, code: "TOO_MANY_FILES", message: formatErrorMessage("TOO_MANY_FILES") });
        else await saveFile(r, planets, f, f.name || null, now);
      }
      if (input.text !== undefined) {
        const text = input.text;
        const link = asLink(text);
        if (!text.trim()) {
          r.rejected.push({ name: null, code: "TEXT_EMPTY", message: formatErrorMessage("TEXT_EMPTY") });
        } else if (link) {
          const linkDomain = link.hostname.replace(/^www\./, "");
          const star = newStar(planets, now, { kind: "link", url: link.href, linkDomain }, { domain: linkDomain });
          await archive.addStar(star);
          r.created.push(withDate(star, now));
        } else if (text.length > MAX_TEXT_CHARS) {
          await saveFile(r, planets, new Blob([text], { type: "text/plain" }), null, now, { kind: "file", ext: "txt" });
        } else {
          const star = newStar(planets, now, { kind: "text", textBody: text }, { text });
          await archive.addStar(star);
          r.created.push(withDate(star, now));
        }
      }
      return r;
    },

    /** 이미지 원본 → blob URL. 다 쓰면 URL.revokeObjectURL 로 해제한다 */
    async thumbnailUrl(starId: string): Promise<string> {
      const blob = await archive.getOriginal(starId);
      if (!blob) throw new RequestError("ORIGINAL_MISSING", ERROR_MESSAGES.ORIGINAL_MISSING);
      return URL.createObjectURL(blob);
    },

    /** 탐사선 내보내기 (SPEC 3-8). .txt·.md 원본 본문은 미리 읽어 둔다 */
    async exportCargo({ items, format }: ExportRequest): Promise<ExportResponse> {
      const [stars, planets] = await Promise.all([archive.listStars(), archive.listPlanets()]);
      const texts = new Map<string, string>();
      for (const s of stars) {
        if ((s.kind === "file" || s.kind === "image") && (isTextFile(s.originalName) || s.storagePath === "idb:txt")) {
          const blob = await archive.getOriginal(s.id);
          if (blob) texts.set(s.id, await blob.text());
        }
      }
      return buildExport(items, format, { stars, planets, now: clock(), readFileText: (s) => texts.get(s.id) ?? null });
    },

    /** 오늘의 재발견 별. 그날 처음 조회할 때 정해 저장하고, 같은 날에는 같은 별 (SPEC 3-6) */
    async rediscoveryToday(): Promise<RediscoveryTodayResponse> {
      const now = clock();
      const today = toLocalDateString(now);
      let pick = await archive.getPick(today);
      if (!pick) {
        const from = addDays(today, -RECENT_PICK_DAYS);
        const recent = (await archive.listPicks()).filter((p) => p.localDate >= from && p.localDate < today && p.starId).map((p) => p.starId!);
        const chosen = pickToday({ stars: await archive.listStars(), recentPickedStarIds: recent, now });
        // 후보가 없으면 저장하지 않는다: 그날 나중에 기록을 넣으면(예시 별 등) 다시 고를 수 있게
        if (!chosen) return null;
        pick = { localDate: today, starId: chosen.starId, daysAgo: chosen.daysAgo, pickedAtUtc: now.toISOString() };
        await archive.savePick(pick);
      }
      if (!pick.starId || !pick.daysAgo) return null;
      const star = await archive.getStar(pick.starId);
      return star ? { star: withDate(star, now), daysAgo: pick.daysAgo } : null;
    },

    /** 재발견 이벤트 기록 (측정용) */
    async rediscoveryEvent(body: RediscoveryEventRequest): Promise<null> {
      if (!(await archive.getStar(body.starId))) throw notFound();
      const at = clock();
      await archive.addEvent({ id: crypto.randomUUID(), localDate: toLocalDateString(at), atUtc: at.toISOString(), ...body });
      return null;
    },
  };
}
