/**
 * Which root paths the web bundle serves itself, as opposed to the API.
 *
 * The website and the API share one origin, so nothing has ever had to know
 * this. The packaged Tauri client splits them: the bundle is served from a
 * local scheme and the API lives at `VITE_IMS_API_ORIGIN`, and a path sent to
 * the wrong one 404s.
 *
 * The list is the complement of the Vite dev proxy table in `vite.config.ts`,
 * which is the repo's existing statement of what the API owns: `/api`,
 * `/assets`, `/css`, `/Data`, `/eventchronicle`, `/icon`, `/image`,
 * `/runninggame`, `/site-content`, `/sites` and `/uploads` are forwarded to
 * Hono. Everything else resolves against the frontend, and these are the roots
 * that actually appear in URLs we build or receive:
 *
 * - `/brand`  — checked-in brand art under `apps/web/public/brand/`, which
 *               `GET /api/about` returns alongside API-owned `/uploads/...`.
 * - `/maps`   — the ECharts GeoJSON and the MapLibre style under
 *               `apps/web/public/maps/`.
 * - `/favicon.ico`
 *
 * Keep this in one place: both the media-URL normalisation in `media-urls.ts`
 * and request routing need the same answer, and two copies would drift.
 */
const WEB_BUNDLE_ROOTS = new Set(["brand", "maps", "favicon.ico"])

/**
 * True when a root-relative path is served by the web bundle rather than the
 * API, and must therefore keep resolving against the document.
 *
 * Absolute and protocol-relative URLs are never bundle-owned: they already name
 * their own origin.
 */
export function ownedByWebBundle(url: string): boolean {
  if (!url.startsWith("/") || url.startsWith("//")) return false
  const [, firstSegment = ""] = url.split("/")
  return WEB_BUNDLE_ROOTS.has(firstSegment)
}
