// 웹 상태 스토어 = 화면 사이 계약 (SPEC 2-5). 개발 A·B·C 합의 대상.
// React 화면은 useStore(selector)로, 3D 코드는 store.getState()/store.subscribe()로 쓴다.
import { createStore, useStore as useZustand } from "zustand";
import { todayPeriod, weekPeriod } from "@spacelog/shared/period";
import type { CargoItem, Period, WebState } from "@spacelog/shared/types";
import { api, RequestError } from "../api/client.ts";
import { formatHash, type Route } from "../router.ts";

export interface ToastItem {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

/** 3D 쪽(이슈 #3)이 등록하는 자동 비행. 도착하면 true, 이동 키로 멈추면 false (DESIGN 9-4) */
export type FlyHandler = (planetId: string) => Promise<boolean>;

export interface Store extends WebState {
  route: Route;
  loading: boolean;
  toasts: ToastItem[];

  // ── SPEC 2-5 호출 계약 8종 ──
  /** 도착하면 true, 사용자가 이동 키로 멈추면 false */
  flyToPlanet(planetId: string, then?: "openPanel"): Promise<boolean>;
  openPanel(planetId: string): void;
  openStar(starId: string): void;
  closePanel(): void;
  returnToOverview(): void;
  /** 같은 항목이 이미 있으면 넣지 않고 false */
  addToCargo(item: CargoItem): boolean;
  removeFromCargo(index: number): void;
  setPeriod(period: Period): Promise<void>;

  // ── 계약 보조 (합의 필요) ──
  /** 3D가 자동 비행 구현을 등록한다. 등록이 없으면(WebGL 없음 등) 바로 openPanel */
  registerFlyToPlanet(handler: FlyHandler | null): void;
  /** 3D가 카메라 상태를 알린다 */
  setCamera(camera: WebState["camera"]): void;
  /** 개발 B 화면이 삭제·합치기 API 성공 뒤 부른다 → 목록·탐사선·선택 상태 정리 (SPEC 3-7) */
  starsDeleted(ids: string[]): void;
  planetDeleted(planetId: string): void;
  planetMerged(fromId: string, toId: string): void;
  /** Esc: 탐사선 → 상세 → 패널 → 조망 순서로 한 단계 뒤로 (SPEC 3-5) */
  goBack(): void;

  // ── 데이터 ──
  loadInitial(): Promise<void>;
  /** 현재 기간으로 다시 받기. 실패하면 마지막 데이터를 유지한다 (SPEC 3-4) */
  refresh(): Promise<void>;
  setExportFormat(format: WebState["exportFormat"]): void;
  openProbe(): void;

  // ── 라우팅·알림 ──
  applyRoute(route: Route): void;
  setConnection(c: WebState["connection"]): void;
  showToast(message: string, kind?: ToastItem["kind"]): void;
  dismissToast(id: number): void;
}

export function cargoKey(item: CargoItem): string {
  const p = (x: Period) => `${x.preset}:${x.from}:${x.to}`;
  if (item.type === "star") return `star:${item.starId}`;
  if (item.type === "planet") return `planet:${item.planetId}:${p(item.period)}`;
  return `universe:${p(item.period)}`;
}

function dedupe(items: CargoItem[]): CargoItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(cargoKey(i)) && !!seen.add(cargoKey(i)));
}

export function createWebStore(navigate: (hash: string) => void = defaultNavigate) {
  let fly: FlyHandler | null = null;
  let toastSeq = 0;
  let loadSeq = 0;

  const store = createStore<Store>()((set, get) => {
    const go = (route: Route) => {
      navigate(formatHash(route));
      get().applyRoute(route);
    };

    return {
      period: todayPeriod(),
      periodAutoExpanded: false,
      stars: [],
      planets: [],
      connection: "ok",
      lastSyncedAt: null,
      camera: "overview",
      selectedPlanetId: null,
      selectedStarId: null,
      cargo: [],
      exportFormat: "claude",
      route: { name: "home" },
      loading: false,
      toasts: [],

      async flyToPlanet(planetId, then) {
        let arrived = true;
        if (fly) {
          set({ camera: "flyingTo" });
          try {
            arrived = await fly(planetId);
          } catch {
            // 연출이 실패해도 패널은 연다
          } finally {
            set({ camera: then === "openPanel" && arrived ? "landed" : "flight" });
          }
        }
        // 사용자가 이동 키로 자동 비행을 멈췄으면 패널을 열지 않는다
        if ((then === "openPanel" && arrived) || !fly) get().openPanel(planetId);
        return arrived;
      },

      openPanel(planetId) {
        go({ name: "planet", id: planetId });
      },

      openStar(starId) {
        go({ name: "star", id: starId });
      },

      closePanel() {
        go({ name: "home" });
        set({ camera: "flight" });
      },

      returnToOverview() {
        set({ camera: "overview" });
      },

      addToCargo(item) {
        const key = cargoKey(item);
        if (get().cargo.some((c) => cargoKey(c) === key)) return false;
        set({ cargo: [...get().cargo, item] });
        return true;
      },

      removeFromCargo(index) {
        set({ cargo: get().cargo.filter((_, i) => i !== index) });
      },

      async setPeriod(period) {
        const cur = get().period;
        if (period.preset === cur.preset && period.from === cur.from && period.to === cur.to) return;
        set({ period, periodAutoExpanded: false });
        await get().refresh();
      },

      registerFlyToPlanet(handler) {
        fly = handler;
      },

      setCamera(camera) {
        set({ camera });
      },

      starsDeleted(ids) {
        const gone = new Set(ids);
        const { selectedStarId, selectedPlanetId } = get();
        set({
          stars: get().stars.filter((s) => !gone.has(s.id)),
          cargo: get().cargo.filter((c) => !(c.type === "star" && gone.has(c.starId))),
        });
        if (selectedStarId && gone.has(selectedStarId)) {
          if (selectedPlanetId) get().openPanel(selectedPlanetId);
          else go({ name: "home" });
        }
      },

      planetDeleted(planetId) {
        set({
          planets: get().planets.filter((p) => p.id !== planetId),
          cargo: get().cargo.filter((c) => !(c.type === "planet" && c.planetId === planetId)),
        });
        if (get().selectedPlanetId === planetId) {
          go({ name: "home" });
          set({ camera: "overview" });
        }
      },

      planetMerged(fromId, toId) {
        set({
          planets: get().planets.filter((p) => p.id !== fromId),
          stars: get().stars.map((s) => (s.planetId === fromId ? { ...s, planetId: toId } : s)),
          cargo: dedupe(get().cargo.map((c) => (c.type === "planet" && c.planetId === fromId ? { ...c, planetId: toId } : c))),
        });
        if (get().selectedPlanetId === fromId) get().openPanel(toId);
        void get().refresh(); // 별 개수 다시 받기
      },

      goBack() {
        const { route, selectedStarId, selectedPlanetId } = get();
        if (route.name === "probe") go({ name: "home" });
        else if (selectedStarId && selectedPlanetId) get().openPanel(selectedPlanetId);
        else if (selectedPlanetId) get().closePanel();
        else get().returnToOverview();
      },

      async loadInitial() {
        set({ loading: true });
        const today = todayPeriod();
        try {
          const u = await api.universe(today.from, today.to);
          if (u.stars.length > 0) {
            set({ period: today, stars: u.stars, planets: u.planets });
          } else {
            // 오늘 0건 → 이번 주로 넓힌다 (POLICY 3-2)
            const week = weekPeriod();
            const w = await api.universe(week.from, week.to);
            const expanded = w.stars.length > 0;
            set(expanded ? { period: week, periodAutoExpanded: true, stars: w.stars, planets: w.planets } : { period: today, stars: [], planets: w.planets });
          }
          set({ lastSyncedAt: new Date().toISOString() });
          get().applyRoute(get().route); // 딥링크 별의 행성 찾기
        } catch (e) {
          if (!(e instanceof RequestError)) throw e;
        } finally {
          set({ loading: false });
        }
      },

      async refresh() {
        const seq = ++loadSeq;
        const { period } = get();
        set({ loading: true });
        try {
          const u = await api.universe(period.from, period.to);
          if (seq !== loadSeq) return; // 더 최근 요청이 있다
          const ids = new Set(u.planets.map((p) => p.id));
          set({
            stars: u.stars,
            planets: u.planets,
            lastSyncedAt: new Date().toISOString(),
            cargo: get().cargo.filter((c) => c.type !== "planet" || ids.has(c.planetId)),
          });
        } catch (e) {
          if (!(e instanceof RequestError)) throw e;
          // 마지막 데이터 유지. connection 은 client 가 "lost"로 바꾼다
        } finally {
          if (seq === loadSeq) set({ loading: false });
        }
      },

      setExportFormat(exportFormat) {
        set({ exportFormat });
      },

      openProbe() {
        go({ name: "probe" });
      },

      applyRoute(route) {
        set({ route });
        if (route.name === "home") set({ selectedPlanetId: null, selectedStarId: null });
        else if (route.name === "planet") set({ selectedPlanetId: route.id, selectedStarId: null });
        else if (route.name === "star") {
          const star = get().stars.find((s) => s.id === route.id);
          set({ selectedStarId: route.id, selectedPlanetId: star?.planetId ?? get().selectedPlanetId });
          if (!star) {
            // 기간 밖 별(재발견·새로고침 등): 별을 받아 행성을 찾는다
            api.star(route.id).then(
              (s) => {
                if (get().selectedStarId === s.id) set({ selectedPlanetId: s.planetId });
              },
              (e) => {
                if (!(e instanceof RequestError) || get().selectedStarId !== route.id) return;
                if (e.code === "NOT_FOUND") {
                  get().showToast("별을 찾을 수 없어요", "error");
                  go({ name: "home" });
                }
              },
            );
          }
        }
      },

      setConnection(connection) {
        if (get().connection !== connection) set({ connection });
      },

      showToast(message, kind = "info") {
        set({ toasts: [...get().toasts, { id: ++toastSeq, kind, message }] });
      },

      dismissToast(id) {
        set({ toasts: get().toasts.filter((t) => t.id !== id) });
      },
    };
  });
  return store;
}

function defaultNavigate(hash: string) {
  if (typeof window !== "undefined" && window.location.hash !== hash) window.location.hash = hash;
}

export const store = createWebStore();

export function useStore<T>(selector: (s: Store) => T): T {
  return useZustand(store, selector);
}
