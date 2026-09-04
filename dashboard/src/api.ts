// Single fetch wrapper so the dashboard can target either:
//   - same-origin /api/* (when served behind a reverse proxy that routes
//     /api/* to the Node server — e.g. a single Render web service), OR
//   - an absolute API_BASE URL (when the dashboard is a static site and the
//     server lives on a different Render service — current setup).
//
// Priority: VITE_API_BASE env var > same-origin /api prefix.
//
// To use the static-site split:
//
//   VITE_API_BASE=https://nove333.onrender.com
//
// at build time. Leave it empty to keep same-origin behaviour.

const ABSOLUTE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
const PREFIX = ABSOLUTE ? `${ABSOLUTE}/api` : "/api";

export function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${PREFIX}${p}`;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(apiPath(path), init);
}
