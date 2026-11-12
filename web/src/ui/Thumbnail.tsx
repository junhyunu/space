import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { Star } from "@spacelog/shared/types";
import { KindIcon } from "./KindIcon.tsx";

/**
 * 썸네일 또는 유형 아이콘 (POLICY 2-7). 처리 중이면 스켈레톤 (SPEC 2-1).
 * 이미지 원본은 브라우저 저장소에 Blob 으로 있어 blob URL 로 보여준다.
 */
export function Thumbnail({ star, size = 48 }: { star: Pick<Star, "id" | "kind" | "thumbnailStatus">; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = star.thumbnailStatus === "ready";

  useEffect(() => {
    if (!ready) return;
    let url: string | null = null;
    let alive = true;
    setFailed(false);
    api.thumbnailUrl(star.id).then(
      (u) => (alive ? setSrc((url = u)) : URL.revokeObjectURL(u)),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [star.id, ready]);

  const style = { width: size, height: size };
  if (star.thumbnailStatus === "pending") return <div className="thumb thumb--pending" style={style} aria-label="썸네일 만드는 중" />;
  return (
    <div className="thumb" style={style}>
      {ready && src && !failed ? <img src={src} alt="" /> : <KindIcon kind={star.kind} size={size * 0.5} />}
    </div>
  );
}
