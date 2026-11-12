import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryArchive } from "./archive.ts";
import { asLink, createLocalApi } from "./localApi.ts";
import { seedDemo } from "./seed.ts";
import { UNCATEGORIZED_ID } from "./planets.ts";

process.env.TZ = "Asia/Seoul";
const NOW = new Date("2026-11-11T03:00:00Z"); // KST 11-11 12:00
const TODAY = "2026-11-11";

function setup(now = NOW) {
  const archive = memoryArchive();
  return { archive, api: createLocalApi(archive, () => now) };
}

describe("기록 넣기", () => {
  it("글은 text, 한 줄 주소는 link 로 넣고 행성을 자동 배정한다", async () => {
    const { api } = setup();
    const a = await api.createStars({ text: "회의록: 다음 주 일정 정리" });
    const b = await api.createStars({ text: "https://www.youtube.com/watch?v=1" });
    assert.equal(a.created[0].kind, "text");
    assert.equal(b.created[0].kind, "link");
    assert.equal(b.created[0].linkDomain, "youtube.com");
    const u = await api.universe(TODAY, TODAY);
    const name = (id: string) => u.planets.find((p) => p.id === id)?.name;
    assert.equal(name(a.created[0].planetId), "업무");
    assert.equal(name(b.created[0].planetId), "읽을거리");
  });

  it("빈 글은 TEXT_EMPTY, 폴더는 FOLDER_NOT_ALLOWED", async () => {
    const { api } = setup();
    const r = await api.createStars({ text: "   ", folders: 1 });
    assert.deepEqual(r.rejected.map((x) => x.code).sort(), ["FOLDER_NOT_ALLOWED", "TEXT_EMPTY"]);
    assert.equal(r.created.length, 0);
  });

  it("같은 파일을 두 번 넣으면 중복으로 알려 준다", async () => {
    const { api } = setup();
    const file = () => new File(["a,b\n1,2"], "보고서.xlsx", { type: "application/vnd.ms-excel" });
    const first = await api.createStars({ files: [file()] });
    const second = await api.createStars({ files: [file()] });
    assert.equal(first.created.length, 1);
    assert.equal(second.duplicates[0]?.planetName, "업무");
  });

  it("이미지는 원본을 썸네일로 쓴다", async () => {
    const { api } = setup();
    const r = await api.createStars({ files: [new File([new Uint8Array([1, 2, 3])], "cat.png", { type: "image/png" })] });
    const s = r.created[0];
    assert.equal(s.kind, "image");
    assert.equal(s.thumbnailStatus, "ready");
    const url = await api.thumbnailUrl(s.id);
    assert.match(url, /^blob:/);
    URL.revokeObjectURL(url);
  });

  it("주소 판별: 공백이 있거나 http(s)가 아니면 링크가 아니다", () => {
    assert.ok(asLink(" https://a.com/x "));
    assert.equal(asLink("https://a.com 보기"), null);
    assert.equal(asLink("ftp://a.com"), null);
    assert.equal(asLink("그냥 글"), null);
  });
});

describe("조회·재발견·내보내기", () => {
  it("기간 안 별과 행성별 개수를 돌려준다", async () => {
    const { api } = setup();
    await api.createStars({ text: "메모 하나" });
    const u = await api.universe(TODAY, TODAY);
    assert.equal(u.stars.length, 1);
    assert.equal(u.stars[0].localDate, TODAY);
    const unc = u.planets.find((p) => p.id === UNCATEGORIZED_ID)!;
    assert.equal(unc.starCountInPeriod, 1);
    assert.equal(unc.starCountTotal, 1);
    assert.equal((await api.universe("2026-11-01", "2026-11-02")).stars.length, 0);
  });

  it("예시 별을 넣으면 오늘의 재발견 별이 7일 전 별이고, 같은 날엔 같은 별", async () => {
    const { archive, api } = setup();
    assert.equal(await api.rediscoveryToday(), null, "빈 우주로 처음 열면 후보 없음 (저장하지 않는다)");
    assert.equal(await seedDemo(archive, NOW), 23);
    assert.equal(await seedDemo(archive, NOW), 0, "이미 별이 있으면 넣지 않는다");
    const a = await api.rediscoveryToday();
    const b = await api.rediscoveryToday();
    assert.equal(a?.daysAgo, 7);
    assert.equal(a?.star.localDate, "2026-11-04");
    assert.equal(a?.star.id, b?.star.id);
  });

  it("재발견 이벤트: 없는 별이면 NOT_FOUND", async () => {
    const { archive, api } = setup();
    await assert.rejects(api.rediscoveryEvent({ starId: "x", channel: "card", type: "shown" }), { code: "NOT_FOUND" });
    const { created } = await api.createStars({ text: "메모" });
    await api.rediscoveryEvent({ starId: created[0].id, channel: "card", type: "opened" });
    assert.equal(archive.events.length, 1);
  });

  it("내보내기는 .txt 원본 본문도 담는다", async () => {
    const { api } = setup();
    await api.createStars({ files: [new File(["강의 요약 본문"], "노트.txt", { type: "text/plain" })] });
    const { content } = await api.exportCargo({ items: [{ type: "universe", period: { preset: "today", from: TODAY, to: TODAY } }], format: "claude" });
    assert.match(content, /본문: 강의 요약 본문/);
    assert.match(content, /파일: 노트\.txt/);
  });
});
