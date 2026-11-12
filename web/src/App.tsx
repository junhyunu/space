import { useEffect } from "react";
import { ControlsHint } from "./home/ControlsHint.tsx";
import { EmptyState } from "./home/EmptyState.tsx";
import { HomeBanner } from "./home/HomeBanner.tsx";
import { NearPrompt } from "./home/NearPrompt.tsx";
import { PlanetList } from "./home/PlanetList.tsx";
import { RediscoverySlot } from "./home/RediscoveryCard.tsx";
import { TopBar } from "./home/TopBar.tsx";
import "./home/home.css";
import { store, useStore } from "./state/store.ts";
import { Button } from "./ui/Button.tsx";
import { SidePanel } from "./ui/SidePanel.tsx";
import { ToastHost } from "./ui/Toast.tsx";
import { PerfMeter } from "./universe/PerfMeter.tsx";
import { UniverseCanvas } from "./universe/UniverseCanvas.tsx";
import { ProbeModal } from "./probe/ProbeModal.tsx";

/**
 * 웹 껍데기. 화면 자리만 잡는다.
 * - 우주 홈: 개발 C, 이슈 #3. 재발견 카드 데이터·이벤트는 개발 A(#7)의 useRediscoveryCard()
 * - 행성 패널·별 상세: 개발 B, 이슈 #5
 * - 탐사선: 개발 A, 이슈 #8
 * 각자 화면이 나오면 아래 "자리 표시" 컴포넌트를 바꿔 끼운다.
 */
export function App() {
  useEscape();

  return (
    <div className="app">
      <UniverseCanvas />
      <TopBar />
      <ControlsHint />
      <PlanetList />
      <EmptyState />
      <NearPrompt />
      <RediscoverySlot />
      <HomeBanner />
      <PerfMeter />
      <PanelPlaceholder />
      <ProbeModal />
      <ToastHost />
    </div>
  );
}

/** Esc: 탐사선 → 상세 → 패널 → 조망 (SPEC 3-5). 입력 중이거나 대화상자가 열려 있으면 무시 */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("dialog[open]")) return; // 대화상자는 스스로 닫힌다
      store.getState().goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// ───────── 자리 표시 (각 담당 이슈에서 교체) ─────────

function PanelPlaceholder() {
  const planetId = useStore((s) => s.selectedPlanetId);
  const starId = useStore((s) => s.selectedStarId);
  const planet = useStore((s) => s.planets.find((p) => p.id === planetId));
  const stars = useStore((s) => s.stars);
  if (!planetId && !starId) return null;
  const close = () => store.getState().closePanel();

  if (starId) {
    return (
      <SidePanel title="별 상세 자리 (이슈 #5)" onClose={close}>
        <Button variant="ghost" onClick={() => planetId && store.getState().openPanel(planetId)} disabled={!planetId}>← 행성으로</Button>
        <p className="placeholder">별 {starId}</p>
        <Button onClick={() => store.getState().addToCargo({ type: "star", starId }) || store.getState().showToast("이미 실은 별이에요")}>🚀 싣기</Button>
      </SidePanel>
    );
  }
  const own = stars.filter((s) => s.planetId === planetId);
  return (
    <SidePanel title={planet?.name ?? "행성"} onClose={close}>
      <p className="placeholder">행성 패널 자리 (이슈 #5)</p>
      <ul className="placeholder-list">
        {own.map((s) => (
          <li key={s.id}>
            <Button variant="ghost" onClick={() => store.getState().openStar(s.id)}>
              {s.linkTitle ?? s.originalName ?? s.textBody?.slice(0, 30) ?? s.id}
            </Button>
          </li>
        ))}
      </ul>
    </SidePanel>
  );
}
