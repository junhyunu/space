// 기록 넣기 (수집 앱 대신 웹에서): [별 띄우기] 창, 화면 어디에나 끌어다 놓기, 붙여넣기(Ctrl+V).
import { useEffect, useRef, useState } from "react";
import { formatErrorMessage } from "@spacelog/shared/errors";
import { todayPeriod, toLocalDateString } from "@spacelog/shared/period";
import type { CreateStarsResponse } from "@spacelog/shared/types";
import { api, RequestError } from "../api/client.ts";
import type { CreateInput } from "../local/localApi.ts";
import { store, useStore } from "../state/store.ts";
import { Button } from "../ui/Button.tsx";
import { Modal } from "../ui/Modal.tsx";

/** 결과를 토스트로 알리고, 새 별이 보이도록 우주를 다시 받는다 */
export async function addRecords(input: CreateInput): Promise<boolean> {
  const s = store.getState();
  let r: CreateStarsResponse;
  try {
    r = await api.createStars(input);
  } catch (e) {
    s.showToast(e instanceof RequestError ? e.message : "기록을 넣지 못했어요", "error");
    return false;
  }
  for (const d of r.duplicates) s.showToast(formatErrorMessage("DUPLICATE", { planet: d.planetName }), "error");
  for (const message of new Set(r.rejected.map((x) => x.message))) s.showToast(message, "error");
  if (r.created.length === 0) return false;

  // 새 별은 오늘 날짜다. 지금 기간이 오늘을 포함하지 않으면 오늘로 바꾼다
  const { period } = store.getState();
  if (period.to < toLocalDateString(new Date())) await store.getState().setPeriod(todayPeriod());
  else await store.getState().refresh();

  const planets = store.getState().planets;
  const names = [...new Set(r.created.map((c) => planets.find((p) => p.id === c.planetId)?.name ?? "미분류"))];
  const where = names.length === 1 ? `'${names[0]}'에` : `행성 ${names.length}곳에`;
  s.showToast(`${where} 별 ${r.created.length}개를 띄웠어요 ✦`, "success");
  return true;
}

/** 끌어다 놓은 항목에서 파일과 폴더 개수를 가른다 */
function fromDataTransfer(dt: DataTransfer): CreateInput {
  const files: File[] = [];
  let folders = 0;
  for (const item of dt.items) {
    if (item.kind !== "file") continue;
    if (item.webkitGetAsEntry?.()?.isDirectory) folders++;
    else {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length || folders) return { files, folders };
  const text = dt.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#")) || dt.getData("text/plain");
  return { text };
}

const isTyping = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable='true']");

export function AddRecord() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const probeOpen = useStore((s) => s.route.name === "probe");

  // 화면 어디에나 끌어다 놓기 · 붙여넣기 (창·탐사선이 열려 있으면 받지 않는다)
  useEffect(() => {
    let depth = 0;
    const blocked = () => !!document.querySelector("dialog[open]");
    const onEnter = (e: DragEvent) => {
      if (blocked() || !e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (!blocked()) e.preventDefault(); // 브라우저가 파일을 열지 않게
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (blocked() || !e.dataTransfer) return;
      e.preventDefault();
      void addRecords(fromDataTransfer(e.dataTransfer));
    };
    const onPaste = (e: ClipboardEvent) => {
      if (blocked() || isTyping(e.target) || !e.clipboardData) return;
      const files = [...e.clipboardData.files];
      const text = e.clipboardData.getData("text/plain");
      if (!files.length && !text) return;
      e.preventDefault();
      void addRecords(files.length ? { files } : { text });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  return (
    <>
      <Button variant="primary" className="add-record__open" onClick={() => setOpen(true)} disabled={probeOpen}>
        ✦ 별 띄우기
      </Button>
      <AddRecordModal open={open} onClose={() => setOpen(false)} />
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__card card">여기에 놓으면 별이 돼요 ✦</div>
        </div>
      )}
    </>
  );
}

function AddRecordModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    const ok = await addRecords({ files, ...(text.trim() ? { text } : {}) });
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal
      open={open}
      title="별 띄우기"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>취소</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || (!text.trim() && files.length === 0)}>
            {busy ? "넣는 중…" : "띄우기"}
          </Button>
        </>
      }
    >
      <div className="add-record">
        <label className="add-record__label" htmlFor="add-record-text">글 또는 링크</label>
        <textarea
          id="add-record-text"
          className="add-record__text"
          rows={5}
          placeholder="메모를 쓰거나 주소(https://…)를 붙여 넣으세요"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
        <label className="add-record__label" htmlFor="add-record-files">파일·이미지 (최대 20개, 개당 50MB)</label>
        <input id="add-record-files" ref={fileRef} type="file" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        <p className="add-record__tip">창을 닫고 화면에 바로 끌어다 놓거나 <kbd>Ctrl+V</kbd>로 붙여 넣어도 돼요.</p>
      </div>
    </Modal>
  );
}
