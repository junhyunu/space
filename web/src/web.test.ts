import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Period, Planet, Star } from "@spacelog/shared/types";
import { api, RequestError, setApiListeners, setBackend, type Backend } from "./api/client.ts";
import { formatHash, parseHash } from "./router.ts";
import { createWebStore } from "./state/store.ts";

/** actual 이 expected 의 키를 모두 같은 값으로 갖는지 (중첩 객체도 부분 비교) */
function has(actual: unknown, expected: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(expected)) {
    const a = (actual as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) has(a, v as Record<string, unknown>);
    else assert.deepEqual(a, v, k);
  }
}

describe("router", () => {
  it("해시 경로를 읽고 다시 만든다", () => {
    assert.deepEqual(parseHash("#/star/s-1?from=rediscovery").route, { name: "star", id: "s-1" });
    assert.deepEqual(parseHash("#/planet/p%2F1").route, { name: "planet", id: "p/1" });
    assert.deepEqual(parseHash("").route, { name: "home" });
    assert.deepEqual(parseHash("#/probe").route, { name: "probe" });
    assert.equal(formatHash({ name: "planet", id: "p/1" }), "#/planet/p%2F1");
  });

});

const planet = (id: string): Planet => ({ id, name: id, system: null, defaultFor: null, colorToken: "planet-1", createdAtUtc: "" });
const star = (id: string, planetId: string) => ({ id, planetId, kind: "text" }) as Star;
/** 테스트에서 부르지 않을 메서드는 실패하게 둔다 */
function fakeBackend(over: Partial<Backend>): Backend {
  const no = async () => {
    throw new Error("테스트에서 쓰지 않는 메서드");
  };
  return { universe: no, star: no, createStars: no, thumbnailUrl: no, exportCargo: no, rediscoveryToday: no, rediscoveryEvent: no, seedDemo: no, ...over } as Backend;
}
const P: Period = { preset: "today", from: "2026-11-11", to: "2026-11-11" };

describe("store 계약", () => {
  let hashes: string[];
  let s: ReturnType<typeof createWebStore>;
  let universe: { stars: Star[]; planets: Planet[] } | Error;

  beforeEach(() => {
    hashes = [];
    universe = { stars: [star("s1", "a")], planets: [planet("a"), planet("b")] };
    setBackend(
      fakeBackend({
        universe: async () => {
          if (universe instanceof Error) throw universe;
          return universe;
        },
        star: async (id) => {
          if (id === "far") return star("far", "b");
          throw new RequestError("NOT_FOUND", "없음");
        },
      }),
    );
    s = createWebStore((h) => hashes.push(h));
    s.setState({ stars: [star("s1", "a")], planets: [planet("a"), planet("b")] });
  });

  it("openPanel·openStar·closePanel 이 URL과 선택 상태를 맞춘다", () => {
    s.getState().openStar("s1");
    has(s.getState(), { selectedStarId: "s1", selectedPlanetId: "a" });
    s.getState().goBack(); // 상세 → 패널
    has(s.getState(), { selectedStarId: null, selectedPlanetId: "a" });
    s.getState().goBack(); // 패널 → 닫기
    has(s.getState(), { selectedPlanetId: null, camera: "flight" });
    s.getState().goBack(); // 조망
    assert.equal(s.getState().camera, "overview");
    assert.deepEqual(hashes, ["#/star/s1", "#/planet/a", "#/"]);
  });

  it("기간 밖 별은 서버에서 행성을 찾는다", async () => {
    s.getState().openStar("far");
    await new Promise((r) => setTimeout(r));
    assert.equal(s.getState().selectedPlanetId, "b");
  });

  it("flyToPlanet: 3D 등록이 없으면 바로, 있으면 도착 후 패널을 연다", async () => {
    await s.getState().flyToPlanet("a", "openPanel");
    assert.equal(s.getState().selectedPlanetId, "a");

    const seen: string[] = [];
    s.getState().registerFlyToPlanet(async (id) => {
      seen.push(`${id}:${s.getState().camera}`);
      return true;
    });
    assert.equal(await s.getState().flyToPlanet("b", "openPanel"), true);
    assert.deepEqual(seen, ["b:flyingTo"]);
    has(s.getState(), { selectedPlanetId: "b", camera: "landed" });
  });

  it("flyToPlanet: 이동 키로 자동 비행을 멈추면 패널을 열지 않는다 (DESIGN 9-4)", async () => {
    s.getState().closePanel();
    s.getState().registerFlyToPlanet(async () => false);
    assert.equal(await s.getState().flyToPlanet("a", "openPanel"), false);
    has(s.getState(), { selectedPlanetId: null, camera: "flight" });
  });

  it("재발견 손님 별: 그 별 상세를 벗어날 때만 숨긴다 (DESIGN v0.5)", () => {
    const guest = star("old", "b");
    s.getState().setGuestStar(guest);
    s.getState().openPanel("a"); // 아직 상세를 연 적 없음(비행 중) → 그대로
    assert.equal(s.getState().guestStar?.id, "old");
    s.getState().openStar("old"); // 기간 밖이어도 손님 별로 행성을 안다
    has(s.getState(), { selectedStarId: "old", selectedPlanetId: "b" });
    assert.equal(s.getState().guestStar?.id, "old");
    s.getState().goBack(); // 상세 → 목록
    assert.equal(s.getState().guestStar, null);
  });

  it("addToCargo 는 같은 항목을 두 번 넣지 않는다", () => {
    const g = s.getState();
    assert.equal(g.addToCargo({ type: "star", starId: "s1" }), true);
    assert.equal(g.addToCargo({ type: "star", starId: "s1" }), false);
    assert.equal(g.addToCargo({ type: "planet", planetId: "a", period: P }), true);
    assert.equal(g.addToCargo({ type: "planet", planetId: "a", period: { ...P, preset: "week" } }), true);
    assert.equal(s.getState().cargo.length, 3);
    s.getState().removeFromCargo(0);
    has(s.getState().cargo[0], { type: "planet" });
  });

  it("삭제·합치기된 별·행성을 탐사선에서 빼거나 바꾼다 (SPEC 3-7)", () => {
    const g = s.getState();
    g.addToCargo({ type: "star", starId: "s1" });
    g.addToCargo({ type: "planet", planetId: "a", period: P });
    g.addToCargo({ type: "planet", planetId: "b", period: P });
    g.openPanel("a");
    g.planetMerged("a", "b");
    assert.deepEqual(s.getState().cargo, [
      { type: "star", starId: "s1" },
      { type: "planet", planetId: "b", period: P },
    ]);
    assert.equal(s.getState().selectedPlanetId, "b");
    assert.equal(s.getState().stars[0].planetId, "b");

    s.getState().starsDeleted(["s1"]);
    s.getState().planetDeleted("b");
    assert.deepEqual(s.getState().cargo, []);
    has(s.getState(), { selectedPlanetId: null, camera: "overview" });
  });

  it("다시 받기 실패 시 마지막 데이터를 유지한다 (SPEC 3-4)", async () => {
    universe = new Error("down");
    await s.getState().refresh();
    assert.equal(s.getState().stars.length, 1);
  });

  it("오늘 0건이면 이번 주로 넓힌다", async () => {
    let calls = 0;
    setBackend(fakeBackend({ universe: async () => (++calls === 1 ? { stars: [], planets: [planet("a")] } : { stars: [star("s9", "a")], planets: [planet("a")] }) }));
    await s.getState().loadInitial();
    has(s.getState(), { periodAutoExpanded: true, period: { preset: "week" } });
  });
});

describe("api client", () => {
  it("저장소 오류는 lost + STORAGE, 알려진 오류는 그대로 전한다", async () => {
    const events: string[] = [];
    setApiListeners({ onConnection: (c) => events.push(c) });
    setBackend(
      fakeBackend({
        universe: async () => {
          throw new DOMException("blocked", "SecurityError");
        },
        star: async () => {
          throw new RequestError("NOT_FOUND", "별을 찾을 수 없어요");
        },
        seedDemo: async () => 23,
      }),
    );
    await assert.rejects(api.universe("2026-11-11", "2026-11-11"), { code: "STORAGE" });
    await assert.rejects(api.star("x"), { code: "NOT_FOUND", message: "별을 찾을 수 없어요" });
    assert.equal(await api.seedDemo(), 23);
    assert.deepEqual(events, ["lost", "ok", "ok"]);
  });
});
