import { describe, expect, it } from "vitest"

import { publicSite, webOnly } from "~/lib/navigation/navigation-target"
import {
  resolveNavigation,
  type NavigationRuntime,
} from "~/lib/navigation/resolve-navigation"

const webRuntime: NavigationRuntime = {
  appTarget: false,
  apiOrigin: "",
  publicSiteOrigin: "",
  documentOrigin: "https://idol-master.top",
}

const appRuntime: NavigationRuntime = {
  appTarget: true,
  apiOrigin: "https://api.example.test",
  publicSiteOrigin: "https://www.example.test",
  documentOrigin: "tauri://localhost",
}

describe("resolveNavigation", () => {
  it("keeps application routes inside React Router for both targets", () => {
    expect(resolveNavigation("/works", webRuntime)).toEqual({
      kind: "router",
      to: "/works",
    })
    expect(resolveNavigation("/works", appRuntime)).toEqual({
      kind: "router",
      to: "/works",
    })
  })

  it("opens public site packages as documents on Web and system URLs in App", () => {
    expect(resolveNavigation(publicSite("hiro2026"), webRuntime)).toEqual({
      kind: "document",
      href: "/sites/hiro2026",
    })
    expect(resolveNavigation(publicSite("hiro2026"), appRuntime)).toEqual({
      kind: "system",
      href: "https://www.example.test/sites/hiro2026",
    })
  })

  it("recognizes raw public site paths during migration", () => {
    expect(resolveNavigation("/sites/hiro2026", appRuntime)).toEqual({
      kind: "system",
      href: "https://www.example.test/sites/hiro2026",
    })
  })

  it("routes API-owned documents to the configured API origin in App", () => {
    const path = "/api/platform/auth/oauth/github/start?returnPath=%2F"

    expect(resolveNavigation(path, webRuntime)).toEqual({
      kind: "document",
      href: path,
    })
    expect(resolveNavigation(path, appRuntime)).toEqual({
      kind: "document",
      href: "https://api.example.test/api/platform/auth/oauth/github/start?returnPath=%2F",
    })
  })

  it("opens external HTTP links as documents on Web and system URLs in App", () => {
    const url = "https://example.test/path?q=1#section"

    expect(resolveNavigation(url, webRuntime)).toEqual({
      kind: "document",
      href: url,
    })
    expect(resolveNavigation(url, appRuntime)).toEqual({
      kind: "system",
      href: url,
    })
  })

  it("opens custom app schemes as documents on Web and system URLs in App", () => {
    const url = "weixin://dl/business/?t=development-token"

    expect(resolveNavigation(url, webRuntime)).toEqual({
      kind: "document",
      href: url,
    })
    expect(resolveNavigation(url, appRuntime)).toEqual({
      kind: "system",
      href: url,
    })
  })

  it("resolves protocol-relative external links against a public HTTP origin", () => {
    expect(resolveNavigation("//cdn.example.test/page", appRuntime)).toEqual({
      kind: "system",
      href: "https://cdn.example.test/page",
    })
  })

  it("hides Web-only routes from the App target", () => {
    expect(resolveNavigation(webOnly("/wiki/classic"), webRuntime)).toEqual({
      kind: "router",
      to: "/wiki/classic",
    })
    expect(resolveNavigation(webOnly("/wiki/classic"), appRuntime)).toEqual({
      kind: "unavailable",
    })
  })

  it("keeps fragments native and rejects dangerous schemes", () => {
    expect(resolveNavigation("#main-content", appRuntime)).toEqual({
      kind: "document",
      href: "#main-content",
    })
    expect(resolveNavigation("javascript:alert(1)", appRuntime)).toEqual({
      kind: "unavailable",
    })
    expect(resolveNavigation("content://provider/private", appRuntime)).toEqual(
      { kind: "unavailable" }
    )
  })
})
