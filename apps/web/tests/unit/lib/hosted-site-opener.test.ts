import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  openUrl: vi.fn(async () => undefined),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/api/origin", () => ({
  API_ORIGIN: "https://idol-master.top",
  PUBLIC_SITE_ORIGIN: "https://idol-master.top",
}))

import {
  isAllowedHostedSiteUrl,
  openHostedSiteUrl,
  shouldOpenHostedSiteExternally,
} from "~/lib/hosted-site-opener"

afterEach(() => {
  mocks.isTauri.mockReturnValue(true)
  mocks.openUrl.mockClear()
})

describe("hosted site opener", () => {
  it("opens a production hosted site through the Tauri plugin", async () => {
    await openHostedSiteUrl("https://idol-master.top/sites/hiro2026")

    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://idol-master.top/sites/hiro2026"
    )
  })

  it.each([
    "http://localhost:1420/sites/hiro2026",
    "http://127.0.0.1:1420/sites/hiro2026",
    "http://10.0.0.8:1420/sites/hiro2026",
    "http://172.16.0.8:1420/sites/hiro2026",
    "http://192.168.31.169:1420/sites/hiro2026",
  ])("allows a local development site: %s", (url) => {
    expect(isAllowedHostedSiteUrl(url)).toBe(true)
  })

  it.each([
    "https://evil.example/sites/hiro2026",
    "https://idol-master.top/api/site-packages/hiro2026",
    "https://idol-master.top/sites/hiro2026?redirect=1",
    "http://172.15.0.8:1420/sites/hiro2026",
  ])("rejects a site outside the production or local allowlist: %s", (url) => {
    expect(isAllowedHostedSiteUrl(url)).toBe(false)
  })

  it("does not claim browser runtimes as native Tauri", () => {
    mocks.isTauri.mockReturnValue(false)

    expect(shouldOpenHostedSiteExternally()).toBe(false)
  })
})
