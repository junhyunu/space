// MCP 리소스 형식 (SPEC 3-8 초안, 축소 순서 1번).
import type { ExportRecord } from "./collect.ts";
import { UNNAMED } from "./collect.ts";

const NAME_MAX = 40;

function resourceName(r: ExportRecord): string {
  const firstLine = r.textBody?.split("\n")[0]?.trim();
  return r.linkTitle ?? r.fileName ?? (firstLine ? firstLine.slice(0, NAME_MAX) : UNNAMED);
}

function resourceText(r: ExportRecord): string {
  const lines: string[] = [];
  if (r.fileName) lines.push(`파일: ${r.fileName}${r.mimeType ? ` (${r.mimeType})` : ""}`);
  if (r.url) lines.push(`URL: ${r.url}`);
  if (r.textBody) lines.push(`본문: ${r.textBody}`);
  if (r.memo) lines.push(`메모: ${r.memo}`);
  return lines.join("\n");
}

export function toMcpResources(records: readonly ExportRecord[]): string {
  const resources = records.map((r) => ({
    uri: `archive://star/${r.id}`,
    name: resourceName(r),
    mimeType: "text/plain",
    annotations: { planet: r.planetName, kind: r.kind, createdAt: r.createdAtUtc },
    text: resourceText(r),
  }));
  return JSON.stringify({ resources }, null, 2);
}
