// 진입점: 라우터 → 초기 로드
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { setApiListeners } from "./api/client.ts";
import { App } from "./App.tsx";
import { parseHash } from "./router.ts";
import { store } from "./state/store.ts";
import "./styles/tokens.css";
import "./styles/app.css";
import "./ui/ui.css";

const s = store.getState();

setApiListeners({ onConnection: (c) => store.getState().setConnection(c) });

// 해시 라우팅. 새로고침해도 같은 화면으로 돌아온다
s.applyRoute(parseHash(location.hash).route);
window.addEventListener("hashchange", () => store.getState().applyRoute(parseHash(location.hash).route));

createRoot(document.getElementById("root")!).render(createElement(App));

// 초기 로드, 끝나면 다른 탭에서 넣은 기록도 보이도록 창 포커스마다 다시 받기
void s.loadInitial().then(() => {
  window.addEventListener("focus", () => void store.getState().refresh());
});
