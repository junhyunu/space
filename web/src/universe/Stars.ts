// 행성 주위를 도는 별들. 2,000개까지 그려야 해서 별 모양 메시 하나를 InstancedMesh 로 반복한다 (ADR 0002).
import * as THREE from "three";
import type { Star } from "@spacelog/shared/types";
import { starOrbit, type Orbit } from "./layout.ts";
import { cssColor, type Toon } from "./toon.ts";

interface Item {
  id: string;
  planetId: string;
  orbit: Orbit;
  tilt: THREE.Quaternion;
  angle: number;
  spin: number;
  color: THREE.Color;
}

export class StarsView {
  readonly mesh: THREE.InstancedMesh;
  private readonly outline: THREE.InstancedMesh;
  private readonly items: Item[] = [];
  private readonly selectedColor = cssColor("star-selected", "#ff5d8f");
  private selectedId: string | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly so = new THREE.Vector3(1.16, 1.16, 1.16);
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** pinkIds: 늘 핑크로 그릴 별 (재발견 손님 별, DESIGN v0.5 W-01) */
  constructor(stars: Star[], toon: Toon, pinkIds: ReadonlySet<string> = new Set()) {
    const yellow = cssColor("yellow", "#ffd23f"); // 별은 모두 노랑, 고른 별만 핑크 (DESIGN 8장)
    const geo = starGeometry();
    const count = Math.max(stars.length, 1);
    this.mesh = new THREE.InstancedMesh(geo, toon.mat(0xffffff, { emissive: 0x222222 }), count);
    this.outline = new THREE.InstancedMesh(geo, toon.outline, count);
    this.outline.raycast = () => {};
    this.mesh.count = this.outline.count = stars.length;
    stars.forEach((star, i) => {
      const orbit = starOrbit(star.id);
      const item: Item = {
        id: star.id,
        planetId: star.planetId,
        orbit,
        tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(orbit.tiltX, 0, orbit.tiltZ)),
        angle: orbit.phase,
        spin: 1 + (orbit.phase % 1.4),
        color: pinkIds.has(star.id) ? this.selectedColor : yellow,
      };
      this.items.push(item);
      this.mesh.setColorAt(i, item.color);
    });
    this.mesh.frustumCulled = this.outline.frustumCulled = false; // 별이 행성을 따라 움직여 경계 상자가 맞지 않는다
  }

  /** 클릭한 인스턴스 → 별 id와 그 별의 행성 */
  starAt(instanceId: number): { id: string; planetId: string } | undefined {
    const it = this.items[instanceId];
    return it && { id: it.id, planetId: it.planetId };
  }

  select(starId: string | null): void {
    if (starId === this.selectedId) return;
    this.items.forEach((it, i) => {
      if (it.id === this.selectedId || it.id === starId) this.mesh.setColorAt(i, it.id === starId ? this.selectedColor : it.color);
    });
    this.selectedId = starId;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 매 프레임: 각 별을 자기 행성 궤도 위에 놓는다. 행성이 안 보이면 별도 숨긴다 */
  tick(dt: number, t: number, planets: Map<string, { position: THREE.Vector3; radius: number }>, reducedMotion: boolean): void {
    this.items.forEach((it, i) => {
      const planet = planets.get(it.planetId);
      if (!reducedMotion) it.angle += it.orbit.speed * dt;
      if (!planet || planet.radius <= 0.01) {
        this.m.makeScale(0, 0, 0);
      } else {
        const R = planet.radius + it.orbit.radiusOffset;
        this.p.set(Math.cos(it.angle) * R, 0, Math.sin(it.angle) * R).applyQuaternion(it.tilt).add(planet.position);
        this.q.setFromAxisAngle(this.up, reducedMotion ? 0 : t * it.spin);
        this.m.compose(this.p, this.q, this.s);
      }
      this.mesh.setMatrixAt(i, this.m);
      if (planet && planet.radius > 0.01) this.m.compose(this.p, this.q, this.so);
      this.outline.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.outline.instanceMatrix.needsUpdate = true;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh, this.outline);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.outline.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.outline.dispose();
  }
}

function starGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.23 : 0.55;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1 });
  g.center();
  return g;
}
