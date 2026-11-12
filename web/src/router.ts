// 해시 라우팅 (SPEC 2-5): #/ · #/planet/:id · #/star/:id · #/probe
// 해시 뒤의 ?query 도 함께 읽는다.

export type Route =
  | { name: "home" }
  | { name: "planet"; id: string }
  | { name: "star"; id: string }
  | { name: "probe" };

export function parseHash(hash: string): { route: Route; params: URLSearchParams } {
  const raw = hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q === -1 ? raw : raw.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
  const [, a, b] = path.split("/");
  let route: Route = { name: "home" };
  if (a === "planet" && b) route = { name: "planet", id: decodeURIComponent(b) };
  else if (a === "star" && b) route = { name: "star", id: decodeURIComponent(b) };
  else if (a === "probe") route = { name: "probe" };
  return { route, params };
}

export function formatHash(route: Route, params?: URLSearchParams): string {
  const path =
    route.name === "planet" || route.name === "star" ? `#/${route.name}/${encodeURIComponent(route.id)}` : route.name === "probe" ? "#/probe" : "#/";
  const qs = params?.toString();
  return qs ? `${path}?${qs}` : path;
}
