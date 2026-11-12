// 3D 우주 장면 (SPEC 3-5). React 바깥에서 돌고, 웹 스토어와는 계약 함수로만 주고받는다.
// - 스토어 → 장면: planets·stars·selectedStarId·camera 를 구독해 다시 그린다
// - 장면 → 스토어: openPanel · openStar · flyToPlanet · setCamera, 자동 비행은 registerFlyToPlanet 로 등록
import * as THREE from "three";
import { store, type Store } from "../state/store.ts";
import { CameraController } from "./CameraController.ts";
import { planetBaseRadius, planetPositions, planetRadius, PLANET_MAX_R, PLANET_MIN_R, STAR_LIMIT } from "./layout.ts";
import { PlanetView } from "./Planet.ts";
import { landOn } from "./land.ts";
import { Player } from "./Player.ts";
import { sceneState } from "./sceneState.ts";
import { StarsView } from "./Stars.ts";
import { cssColor, disposeTree, Toon } from "./toon.ts";

const MAX_SPEED = 15;
const FLY_SECONDS = 1.2;
const LAND_DISTANCE = 8; // 행성 표면에서 이 안이면 착륙 안내 (DESIGN W-01)
const ARRIVE_GAP = 4.5; // 자동 비행이 멈추는 곳: 행성 표면 + 4.5 (DESIGN 시안 flyTo)
const PANEL_CLOSE_DISTANCE = 14; // 패널 행성 표면에서 이만큼 멀어지면 패널을 닫는다 (DESIGN.md 9-4) // 자동 비행 (SPEC 3-5)
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"]);

export class UniverseScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly toon = new Toon();
  private readonly cam: CameraController;
  private readonly player: Player;
  private readonly planets = new Map<string, PlanetView>();
  private stars: StarsView | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private readonly vel = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  private flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; done(arrived: boolean): void } | null = null;
  private drag: { x: number; y: number; sx: number; sy: number } | null = null;
  private raf = 0;
  private t = 0;
  private frames = 0;
  private fpsSince = 0;
  /** 패널 행성 가까이에 한 번이라도 있었는지. 멀리서 연 패널(목록·딥링크)은 바로 닫지 않으려고 둔다 */
  private panelNear = false;
  private readonly cleanups: (() => void)[] = [];

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.cam = new CameraController(container.clientWidth / Math.max(container.clientHeight, 1));

    this.scene.background = cssColor("scene-bg", "#15103a");
    this.scene.add(new THREE.HemisphereLight(0xcfd6ff, 0x3a2a6a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(40, 60, 30);
    this.scene.add(sun);
    this.buildBackdrop();

    this.player = new Player(this.toon, this.scene);
    this.player.root.position.set(0, 0, 10);
    this.scene.add(this.player.root);

    this.bindInput();
    this.sync(store.getState(), null);
    this.cleanups.push(store.subscribe((s, prev) => this.sync(s, prev)));
    store.getState().registerFlyToPlanet((id) => this.flyTo(id));
    document.fonts?.ready.then(() => this.planets.forEach((p) => p.redrawLabel()));

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.cleanups.push(() => ro.disconnect());
    this.raf = requestAnimationFrame(this.step);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    store.getState().registerFlyToPlanet(null);
    this.flight?.done(false);
    this.cleanups.forEach((c) => c());
    this.stars?.dispose();
    disposeTree(this.scene);
    this.toon.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    sceneState.setState({ nearPlanetId: null, starsHidden: false });
  }

  // ───────── 데이터 → 장면 ─────────

  private sync(s: Store, prev: Store | null): void {
    const dataChanged = !prev || s.planets !== prev.planets || s.stars.length !== prev.stars.length;
    const guestChanged = !!prev && s.guestStar !== prev.guestStar;
    // 손님 별만 바뀌면 카메라 조망은 다시 맞추지 않는다 (비행 중일 수 있다)
    if (dataChanged || guestChanged) this.syncPlanets(s, dataChanged);
    if (!prev || s.stars !== prev.stars || guestChanged) this.syncStars(s);
    if (!prev || s.selectedStarId !== prev.selectedStarId) this.stars?.select(s.selectedStarId);
  }

  /** 기간 밖 손님 별 (기간 안이면 평소대로 그려지므로 null) */
  private guestOf(s: Store) {
    const g = s.guestStar;
    return g && !s.stars.some((x) => x.id === g.id) ? g : null;
  }

  private syncPlanets(s: Store, reframe = true): void {
    const guest = this.guestOf(s);
    const positions = planetPositions(s.planets);
    const starsHidden = s.stars.length > STAR_LIMIT;
    const alive = new Set<string>();
    for (const p of s.planets) {
      alive.add(p.id);
      let view = this.planets.get(p.id);
      if (!view) {
        view = new PlanetView(p, positions.get(p.id)!, this.toon);
        this.planets.set(p.id, view);
        this.scene.add(view.group);
      } else {
        view.update(p);
        view.position.set(...positions.get(p.id)!);
      }
      // 손님 별의 행성은 기간 안 별이 0개여도 보이게 1개로 센다
      const n = (p.starCountInPeriod ?? 0) + (guest?.planetId === p.id ? 1 : 0);
      // 별 상한 초과면 별을 그리지 않고 행성은 최대 반지름(6)으로 둔다 (DESIGN W-01 "별 상한 초과 상태")
      view.setTargetRadius(n > 0 && starsHidden ? PLANET_MAX_R : planetRadius(n, planetBaseRadius(p.id)));
    }
    for (const [id, view] of this.planets) {
      if (alive.has(id)) continue;
      view.dispose();
      this.planets.delete(id);
    }
    if (reframe) this.cam.frame(
      s.planets
        .filter((p) => (p.starCountInPeriod ?? 0) > 0)
        .map((p) => ({ pos: positions.get(p.id)!, r: planetRadius(p.starCountInPeriod ?? 0, planetBaseRadius(p.id)) })),
    );
  }

  private syncStars(s: Store): void {
    this.stars?.dispose();
    this.stars = null;
    const hidden = s.stars.length > STAR_LIMIT;
    sceneState.setState({ starsHidden: hidden });
    // 별 상한 초과 상태에서도 손님 별 하나는 그린다 (DESIGN v0.5)
    const guest = this.guestOf(s);
    const draw = [...(hidden ? [] : s.stars), ...(guest ? [guest] : [])];
    if (draw.length === 0) return;
    this.stars = new StarsView(draw, this.toon, new Set(guest ? [guest.id] : []));
    this.stars.addTo(this.scene);
    this.stars.select(s.selectedStarId);
  }

  // ───────── 자동 비행 (flyToPlanet 구현) ─────────

  private flyTo(planetId: string): Promise<boolean> {
    const view = this.planets.get(planetId);
    if (!view) return Promise.resolve(true);
    this.flight?.done(false);
    const r = Math.max(view.radius, PLANET_MIN_R);
    const from = this.player.root.position.clone();
    const dir = from.clone().sub(view.position);
    dir.y = Math.max(dir.y, 0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
    dir.normalize();
    // 행성 표면에서 4.5 떨어진 곳에 선다 (DESIGN 시안). 착륙 안내 거리(8) 안이라 도착하면 바로 E로 열 수 있다
    const to = view.position.clone().addScaledVector(dir, r + ARRIVE_GAP).add(new THREE.Vector3(0, 1.2, 0));
    this.vel.set(0, 0, 0);
    if (this.reducedMotion.matches) {
      this.player.root.position.copy(to); // 축소: 연출 없이 즉시 이동
      this.cam.yaw = Math.atan2(dir.x, dir.z);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this.flight = {
        from,
        to,
        t: 0,
        done: (arrived) => {
          this.flight = null;
          resolve(arrived);
        },
      };
    });
  }

  // ───────── 입력 ─────────

  private bindInput(): void {
    const cv = this.renderer.domElement;
    cv.style.touchAction = "none";
    cv.style.cursor = "grab";
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, "keydown", (e) => {
      if (isTyping(e) || document.querySelector("dialog[open]")) return;
      // 버튼·링크에 포커스가 있으면 Space 는 그 버튼을 누르는 키다 (키보드 접근성)
      if (e.code === "Space" && e.target instanceof Element && e.target.closest("button, a[href], [role='button']")) return;
      if (MOVE_KEYS.has(e.code)) {
        if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
        if (this.flight) {
          // 자동 비행 중 이동 키 → 그 자리에서 멈추고 직접 조종 (DESIGN 9-4)
          this.vel.set(0, 0, 0);
          this.flight.done(false);
        }
        this.keys.add(e.code);
        const s = store.getState();
        if (s.camera === "overview" || s.camera === "landed") s.setCamera("flight");
      }
      if (e.code === "KeyE") this.land();
    });
    on(window, "keyup", (e) => this.keys.delete(e.code));
    on(window, "blur", () => this.keys.clear());

    on(cv, "pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = "grabbing";
    });
    on(cv, "pointermove", (e) => {
      if (!this.drag) return;
      this.cam.drag(e.clientX - this.drag.x, e.clientY - this.drag.y, store.getState().camera);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    on(cv, "pointerup", (e) => {
      if (this.drag && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) < 6) this.click(e);
      this.drag = null;
      cv.style.cursor = "grab";
    });
    on(
      cv,
      "wheel",
      (e) => {
        e.preventDefault();
        this.cam.wheel(e.deltaY, store.getState().camera);
      },
      { passive: false },
    );
  }

  /** 별 클릭 → 상세, 행성 클릭 → 자동 비행 후 패널, 빈 곳 클릭 → 비행 모드 (SPEC 3-5) */
  private click(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam.camera);
    const targets: THREE.Object3D[] = [...this.planets.values()].filter((p) => p.visible).map((p) => p.body);
    if (this.stars) targets.push(this.stars.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    const s = store.getState();
    if (!hit) {
      if (s.camera === "overview") s.setCamera("flight");
      return;
    }
    if (hit.object === this.stars?.mesh && hit.instanceId !== undefined) {
      // 별 클릭 → 그 별의 행성으로 날아간 뒤 별 상세 (DESIGN 9-4). 이동 키로 멈추면 열지 않는다
      const star = this.stars.starAt(hit.instanceId);
      if (star)
        void s.flyToPlanet(star.planetId).then((arrived) => arrived && store.getState().openStar(star.id));
    } else if (hit.object.userData.planetId) {
      void s.flyToPlanet(hit.object.userData.planetId, "openPanel");
    }
  }

  /** E: 가까운 행성에 착륙 → 패널 */
  private land(): void {
    const id = sceneState.getState().nearPlanetId;
    if (id) landOn(id);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h);
    this.cam.setAspect(w / h);
  }

  // ───────── 매 프레임 ─────────

  private step = () => {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.t += dt;
    const reduced = this.reducedMotion.matches;
    const s = store.getState();
    const pos = this.player.root.position;

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / FLY_SECONDS);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      const before = pos.clone();
      pos.lerpVectors(f.from, f.to, e);
      this.vel.copy(pos).sub(before).divideScalar(Math.max(dt, 1e-3));
      this.cam.turnToward(Math.atan2(this.vel.x, this.vel.z), dt);
      if (f.t >= 1) {
        this.vel.set(0, 0, 0);
        f.done(true);
      }
    } else {
      const { forward, right } = this.cam.axes();
      const input = new THREE.Vector3();
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) input.add(forward);
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) input.sub(forward);
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) input.add(right);
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) input.sub(right);
      if (this.keys.has("Space")) input.y += 1;
      if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) input.y -= 1;
      if (input.lengthSq()) input.normalize();
      this.vel.addScaledVector(input, 32 * dt).multiplyScalar(Math.exp(-2.4 * dt));
      if (this.vel.length() > MAX_SPEED) this.vel.setLength(MAX_SPEED);
      pos.addScaledVector(this.vel, dt);
    }

    // 행성: 크기 전환, 부딪히지 않게 밀어내기, 착륙 거리(표면에서 3r 안) 확인
    let near: string | null = null;
    let nearest = Infinity;
    const tmp = new THREE.Vector3();
    for (const view of this.planets.values()) {
      view.tick(dt, reduced);
      if (!view.visible) continue;
      tmp.copy(pos).sub(view.position);
      const d = tmp.length();
      const minD = view.radius + 1.6;
      if (d < minD && d > 0) {
        tmp.normalize();
        pos.copy(view.position).addScaledVector(tmp, minD);
        const vn = this.vel.dot(tmp);
        if (vn < 0) this.vel.addScaledVector(tmp, -vn * 1.4);
      }
      const surface = d - view.radius;
      if (surface < LAND_DISTANCE && surface < nearest) {
        nearest = surface;
        near = view.id;
      }
    }
    // SQ4 (#36, DESIGN.md 9-4): 패널이 열려 있어도 비행 키는 받고, 패널 행성에서 멀어지면 패널을 닫는다
    const panelPlanet = s.selectedPlanetId ? this.planets.get(s.selectedPlanetId) : undefined;
    if (panelPlanet?.visible && !this.flight) {
      const surface = pos.distanceTo(panelPlanet.position) - panelPlanet.radius;
      // 디자인 기준 표면 + 14. 큰 행성은 자동 비행 도착 지점(표면 1.5r)이 14를 넘을 수 있어 2r 과 비교한다
      if (surface <= Math.max(PANEL_CLOSE_DISTANCE, 2 * panelPlanet.radius)) this.panelNear = true;
      else if (this.panelNear && s.camera === "flight") {
        this.panelNear = false;
        s.closePanel();
      }
    } else if (!s.selectedPlanetId) {
      this.panelNear = false;
    }
    const showNear = s.camera !== "overview" && !this.flight && near !== s.selectedPlanetId ? near : null;
    if (sceneState.getState().nearPlanetId !== showNear) sceneState.setState({ nearPlanetId: showNear });

    this.stars?.tick(dt, this.t, this.planets, reduced);
    this.player.animate(dt, this.t, this.vel, this.vel.length() / MAX_SPEED, reduced);
    this.cam.update(dt, s.camera, pos);
    this.renderer.render(this.scene, this.cam.camera);
    this.frames++;
    if (this.t - this.fpsSince >= 1) {
      sceneState.setState({ fps: Math.round(this.frames / (this.t - this.fpsSince)) });
      this.frames = 0;
      this.fpsSince = this.t;
    }
    this.raf = requestAnimationFrame(this.step);
  };

  private buildBackdrop(): void {
    // 먼 배경 별 1,800개 + 성운 + 만화풍 태양 (3D 시안)
    const N = 1800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const pal = [
      [1, 1, 1],
      [1, 0.85, 0.5],
      [0.7, 0.85, 1],
      [1, 0.6, 0.8],
    ];
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar(400 + Math.random() * 500);
      pos.set([v.x, v.y, v.z], i * 3);
      col.set(pal[i % 4], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false })));

    const blob = (c: string) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d")!;
      const r = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      r.addColorStop(0, c);
      r.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(cv);
    };
    const glow = (c: string, p: [number, number, number], size: number, parent: THREE.Object3D = this.scene) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: blob(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.set(...p);
      sp.scale.set(size, size, 1);
      sp.raycast = () => {};
      parent.add(sp);
    };
    glow("rgba(122,108,255,.55)", [-300, 120, -500], 520);
    glow("rgba(255,93,143,.38)", [380, -80, -420], 460);
    glow("rgba(94,200,255,.3)", [60, -220, 480], 560);
    glow("rgba(255,210,63,.25)", [-420, -60, 260], 400);
    const sunG = new THREE.Group();
    sunG.position.set(160, 110, -260);
    this.scene.add(sunG);
    sunG.add(this.toon.outlined(new THREE.Mesh(new THREE.IcosahedronGeometry(22, 1), new THREE.MeshBasicMaterial({ color: cssColor("yellow", "#ffd23f") })), 1.06));
    glow("rgba(255,200,80,.7)", [0, 0, 0], 140, sunG);
  }
}

function isTyping(e: KeyboardEvent): boolean {
  return e.target instanceof Element && !!e.target.closest("input, textarea, select, [contenteditable='true']");
}
