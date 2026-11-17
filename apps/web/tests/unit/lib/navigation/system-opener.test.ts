import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  openUrl: vi.fn(async () => undefined),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import {
  isAllowedSystemUrl,
  openSystemUrl,
  shouldUseSystemOpener,
} from "~/lib/navigation/system-opener"

afterEach(() => {
  mocks.isTauri.mockReturnValue(true)
  mocks.openUrl.mockClear()
})

describe("system opener", () => {
  it.each([
    "https://idol-master.top/sites/hiro2026",
    "http://localhost:1420/sites/hiro2026",
    "mailto:contact@example.test",
    "tel:+861234567890",
    "sms:+861234567890",
    "weixin://dl/business/?t=development-token",
    "alipays://platformapi/startapp?appId=2021000000000000",
    "intent://scan/#Intent;scheme=zxing;package=com.example.scanner;end",
  ])("allows a supported system URL: %s", (url) => {
    expect(isAllowedSystemUrl(url)).toBe(true)
  })

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/unsafe",
    "blob:https://example.test/7aa1e94e-1229-4c90-b76b-0f02d480500f",
    "content://com.example.provider/private",
    "tauri://localhost/internal",
    "https://user:password@example.test/",
  ])("rejects a blocked system URL: %s", (url) => {
    expect(isAllowedSystemUrl(url)).toBe(false)
  })

  it.each([
    "https://idol-master.top/sites/hiro2026",
    "weixin://dl/business/?t=development-token",
  ])("opens through the Tauri plugin: %s", async (url) => {
    await openSystemUrl(url)

    expect(mocks.openUrl).toHaveBeenCalledWith(url)
  })

  it("does not claim browser runtimes as Tauri", () => {
    mocks.isTauri.mockReturnValue(false)
    expect(shouldUseSystemOpener()).toBe(false)
  })
})
