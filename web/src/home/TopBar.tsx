import { store, useStore } from "../state/store.ts";
import { Button } from "../ui/Button.tsx";
import { AddRecord } from "./AddRecord.tsx";
import { PeriodPicker } from "./PeriodPicker.tsx";

/** 왼쪽 위: 서비스 이름, 기간 안 별·행성 개수, 기간 선택, 별 띄우기, 탐사선 (SPEC 1-4) */
export function TopBar() {
  const stars = useStore((s) => s.stars.length);
  const planets = useStore((s) => s.planets.filter((p) => (p.starCountInPeriod ?? 0) > 0).length);
  const cargo = useStore((s) => s.cargo.length);
  return (
    <header className="topbar card">
      <h1 className="topbar__brand">
        SPACE<span>LOG</span>
      </h1>
      <p className="topbar__stats">
        <b>{stars}</b>개의 별 <b>{planets}</b>개의 행성
      </p>
      <PeriodPicker />
      <div className="topbar__actions">
        <AddRecord />
        <Button variant="accent" className="topbar__probe" onClick={() => store.getState().openProbe()}>
          🚀 탐사선{cargo > 0 && <span className="badge">{cargo}</span>}
        </Button>
      </div>
    </header>
  );
}
