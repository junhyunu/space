// 보관함: 서버의 SQLite 대신 브라우저 IndexedDB에 저장한다.
// 같은 인터페이스를 메모리로 구현한 memoryArchive()는 테스트용이다.
import type { Planet, RediscoveryEvent, RediscoveryPick, Star } from "@spacelog/shared/types";
import { DEFAULT_PLANETS, UNCATEGORIZED_ID, ulid, type PlanetKeywords } from "./planets.ts";

/** 저장되는 행성: 화면용 Planet + 자동 배정 키워드 + 만든 순서 */
export type PlanetRow = Planet & { keywords: PlanetKeywords; order: number };

export interface Archive {
  listPlanets(): Promise<PlanetRow[]>; // 만든 순서
  listStars(): Promise<Star[]>; // 넣은 시각 순
  getStar(id: string): Promise<Star | null>;
  findStarBySha256(sha256: string): Promise<Star | null>;
  /** 별과 원본(이미지·파일)을 함께 저장한다 */
  addStar(star: Star, original?: Blob): Promise<void>;
  getOriginal(starId: string): Promise<Blob | null>;
  getPick(localDate: string): Promise<RediscoveryPick | null>;
  savePick(pick: RediscoveryPick): Promise<void>;
  listPicks(): Promise<RediscoveryPick[]>;
  addEvent(event: RediscoveryEvent): Promise<void>;
}

/** 처음 열 때 만드는 기본 행성 + 미분류 */
export function defaultPlanetRows(now: Date = new Date()): PlanetRow[] {
  const at = now.toISOString();
  const rows = [
    ...DEFAULT_PLANETS.map((p) => ({ ...p, id: ulid(now.getTime()), system: null })),
    { name: "미분류", keywords: { words: [], domains: [], exts: [] }, id: UNCATEGORIZED_ID, system: "uncategorized" as const },
  ];
  return rows.map((p, i) => ({ ...p, defaultFor: null, colorToken: `planet-${i + 1}`, createdAtUtc: at, order: i }));
}

const byCreated = (a: Star, b: Star) => a.createdAtUtc.localeCompare(b.createdAtUtc) || a.id.localeCompare(b.id);

// ── IndexedDB ──────────────────────────────────────────────────────

const DB_NAME = "spacelog";
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore("planets", { keyPath: "id" });
    db.createObjectStore("stars", { keyPath: "id" }).createIndex("sha256", "sha256");
    db.createObjectStore("originals"); // key = starId, value = Blob
    db.createObjectStore("picks", { keyPath: "localDate" });
    db.createObjectStore("events", { keyPath: "id" });
  };
  const db = await req(open);
  const tx = db.transaction("planets", "readwrite");
  const planets = tx.objectStore("planets");
  if ((await req(planets.count())) === 0) for (const p of defaultPlanetRows()) planets.put(p);
  await done(tx);
  return db;
}

export function idbArchive(): Archive {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb().catch((e) => ((dbPromise = null), Promise.reject(e))));
  const read = async <T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    req(fn((await db()).transaction(store).objectStore(store)));
  const write = async (store: string, fn: (s: IDBObjectStore) => void) => {
    const tx = (await db()).transaction(store, "readwrite");
    fn(tx.objectStore(store));
    await done(tx);
  };

  return {
    async listPlanets() {
      const rows = (await read("planets", (s) => s.getAll())) as PlanetRow[];
      return rows.sort((a, b) => a.order - b.order);
    },
    async listStars() {
      return ((await read("stars", (s) => s.getAll())) as Star[]).sort(byCreated);
    },
    async getStar(id) {
      return ((await read("stars", (s) => s.get(id))) as Star | undefined) ?? null;
    },
    async findStarBySha256(sha256) {
      return ((await read("stars", (s) => s.index("sha256").get(sha256))) as Star | undefined) ?? null;
    },
    async addStar(star, original) {
      const tx = (await db()).transaction(["stars", "originals"], "readwrite");
      tx.objectStore("stars").put(star);
      if (original) tx.objectStore("originals").put(original, star.id);
      await done(tx);
    },
    async getOriginal(starId) {
      return ((await read("originals", (s) => s.get(starId))) as Blob | undefined) ?? null;
    },
    async getPick(localDate) {
      return ((await read("picks", (s) => s.get(localDate))) as RediscoveryPick | undefined) ?? null;
    },
    savePick: (pick) => write("picks", (s) => s.put(pick)),
    async listPicks() {
      return (await read("picks", (s) => s.getAll())) as RediscoveryPick[];
    },
    addEvent: (event) => write("events", (s) => s.put(event)),
  };
}

// ── 메모리 (테스트용) ───────────────────────────────────────────────

export function memoryArchive(planets: PlanetRow[] = defaultPlanetRows()): Archive & { events: RediscoveryEvent[] } {
  const stars = new Map<string, Star>();
  const originals = new Map<string, Blob>();
  const picks = new Map<string, RediscoveryPick>();
  const events: RediscoveryEvent[] = [];
  return {
    events,
    listPlanets: async () => [...planets].sort((a, b) => a.order - b.order),
    listStars: async () => [...stars.values()].sort(byCreated),
    getStar: async (id) => stars.get(id) ?? null,
    findStarBySha256: async (sha) => [...stars.values()].find((s) => s.sha256 === sha) ?? null,
    async addStar(star, original) {
      stars.set(star.id, star);
      if (original) originals.set(star.id, original);
    },
    getOriginal: async (id) => originals.get(id) ?? null,
    getPick: async (d) => picks.get(d) ?? null,
    savePick: async (p) => void picks.set(p.localDate, p),
    listPicks: async () => [...picks.values()],
    addEvent: async (e) => void events.push(e),
  };
}
