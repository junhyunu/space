import { useState } from "react";
import { api } from "../api/client.ts";
import { store, useStore } from "../state/store.ts";
import { Button } from "../ui/Button.tsx";

/** 빈 우주 안내 (POLICY 3-2). 전체 0건이면 첫 실행 안내 + 예시 별 넣기 */
export function EmptyState() {
  const show = useStore((s) => s.lastSyncedAt !== null && !s.loading && s.stars.length === 0);
  const total = useStore((s) => s.planets.reduce((n, p) => n + (p.starCountTotal ?? 0), 0));
  const custom = useStore((s) => s.period.preset === "custom");
  const [busy, setBusy] = useState(false);
  if (!show) return null;

  const seed = async () => {
    setBusy(true);
    try {
      const n = await api.seedDemo();
      await store.getState().loadInitial(); // 오늘 → 이번 주 넓히기 규칙을 다시 적용
      if (n > 0) store.getState().showToast(`예시 별 ${n}개를 넣었어요`, "success");
    } catch {
      store.getState().showToast("예시 별을 넣지 못했어요", "error");
    } finally {
      setBusy(false);
    }
  };

  if (total === 0)
    return (
      <div className="empty card" role="status">
        <h2>첫 별을 띄워 보세요 ✦</h2>
        <p>파일·링크·글을 화면에 끌어다 놓거나 <kbd>Ctrl+V</kbd>로 붙여 넣으면 별이 돼요.</p>
        <p>왼쪽 위 [별 띄우기]로도 넣을 수 있어요.</p>
        <Button variant="secondary" className="empty__action" onClick={() => void seed()} disabled={busy}>
          {busy ? "넣는 중…" : "예시 별 넣어 보기"}
        </Button>
      </div>
    );
  return (
    <div className="empty card" role="status">
      <p>{custom ? "이 기간에는 별이 없어요. 기간을 넓혀 보세요" : "화면에 첫 별을 끌어다 놓아 보세요"}</p>
    </div>
  );
}
