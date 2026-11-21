import { routeDescriptorsForTarget } from "../route-metadata.ts"

const defaultSiteOrigin = "https://idol-master.top"

export function siteSeoOrigin(value?: string): string {
  const url = new URL(value?.trim() || defaultSiteOrigin)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("VITE_IMS_PUBLIC_SITE_ORIGIN must be an HTTP(S) origin")
  }
  return url.origin
}

// Only real public Web documents belong in the sitemap. SPA routes need a
// content-aware HTML response before they can share this policy.
const canonicalPaths = new Map<string, string>()
for (const route of routeDescriptorsForTarget("web")) {
  if (route.path?.startsWith("account/") || route.layout === "admin") continue
  for (const path of route.prerender ?? []) {
    canonicalPaths.set(path, route.appNavigation?.canonical ?? path)
  }
}

export function canonicalSiteUrl(pathname: string, origin: string) {
  const normalized =
    (pathname === "/index.html" ? "/" : pathname.replace(/\/+$/, "")) || "/"
  const canonicalPath = canonicalPaths.get(normalized)
  return canonicalPath ? new URL(canonicalPath, origin).href : undefined
}

export function siteDiscoveryFiles(origin: string) {
  const paths = [...new Set(canonicalPaths.values())]
  const entries = paths.map((path) => {
    const url = new URL(path, origin).href.replaceAll("&", "&amp;")
    return `  <url><loc>${url}</loc></url>`
  })
  return {
    "robots.txt": `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", origin).href}\n`,
    "sitemap.xml": [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      "</urlset>",
      "",
    ].join("\n"),
  }
}
