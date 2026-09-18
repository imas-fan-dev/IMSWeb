import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  getCurrent: vi.fn(async (): Promise<string[] | null> => null),
  onOpenUrl: vi.fn(),
  emit: null as ((urls: string[] | null) => void) | null,
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mocks.getCurrent,
  onOpenUrl: mocks.onOpenUrl,
}))

import {
  parsePlatformOAuthCallbackUrl,
  subscribePlatformOAuthCallback,
} from "~/lib/platform-oauth-deep-link"

describe("parsePlatformOAuthCallbackUrl", () => {
  it("reads the one-time code from the shared callback URL", () => {
    expect(
      parsePlatformOAuthCallbackUrl("imsweb://oauth/callback?code=abc123")
    ).toEqual({ code: "abc123" })
  })

  it("reads a provider error instead of a code", () => {
    expect(
      parsePlatformOAuthCallbackUrl("imsweb://oauth/callback?error=denied")
    ).toEqual({ error: "denied" })
  })

  it("ignores any URL that is not the exact callback", () => {
    for (const url of [
      "https://oauth/callback?code=abc",
      "imsweb://other/callback?code=abc",
      "imsweb://oauth/other?code=abc",
      "imsweb://oauth/callback",
      "not a url",
    ]) {
      expect(parsePlatformOAuthCallbackUrl(url)).toBeNull()
    }
    // The scheme is case-insensitive in `URL`, so casing alone still matches.
    expect(
      parsePlatformOAuthCallbackUrl("IMSWEB://oauth/callback?code=abc")
    ).toEqual({ code: "abc" })
  })
})

describe("subscribePlatformOAuthCallback", () => {
  it("is a no-op outside a real Tauri runtime", async () => {
    const handler = () => undefined
    const unsubscribe = await subscribePlatformOAuthCallback(handler)
    expect(typeof unsubscribe).toBe("function")
    expect(() => unsubscribe()).not.toThrow()
  })
})

/**
 * The defect these guard: delivery used to be owned by the sign-in screen, so a
 * callback that arrived before that screen existed — the OS having reclaimed the
 * app while the user was authorizing in the system browser — was dropped in
 * silence.
 */
describe("app-wide callback delivery", () => {
  const CALLBACK = "imsweb://oauth/callback?code=cold-start"

  beforeEach(() => {
    // A fresh module per case: delivery state is process-wide on purpose, so a
    // shared instance would leak a held payload from one test into the next.
    vi.resetModules()
    mocks.emit = null
    mocks.isTauri.mockReturnValue(true)
    mocks.getCurrent.mockResolvedValue(null)
    mocks.onOpenUrl.mockImplementation((handler) => {
      mocks.emit = handler
      return Promise.resolve(() => undefined)
    })
  })

  /** Starts delivery and waits until the plugin has handed over its emitter. */
  async function startedDelivery() {
    const deepLink = await import("~/lib/platform-oauth-deep-link")
    const unclaimed = vi.fn()
    deepLink.startPlatformOAuthDeepLink(unclaimed)
    await vi.waitFor(() => expect(mocks.emit).not.toBeNull())
    return { deepLink, unclaimed }
  }

  it("holds a callback that arrived before any listener existed", async () => {
    const { deepLink, unclaimed } = await startedDelivery()

    mocks.emit?.([CALLBACK])
    expect(unclaimed).toHaveBeenCalledTimes(1)

    const handler = vi.fn()
    deepLink.subscribePlatformOAuthPayload(handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ code: "cold-start" })
  })

  it("holds the launch URL of a cold start", async () => {
    mocks.getCurrent.mockResolvedValue([CALLBACK])
    const { deepLink, unclaimed } = await startedDelivery()

    await vi.waitFor(() => expect(unclaimed).toHaveBeenCalledTimes(1))

    const handler = vi.fn()
    deepLink.subscribePlatformOAuthPayload(handler)
    expect(handler).toHaveBeenCalledWith({ code: "cold-start" })
  })

  it("hands a held callback to exactly one listener", async () => {
    const { deepLink } = await startedDelivery()
    mocks.emit?.([CALLBACK])

    const first = vi.fn()
    const second = vi.fn()
    deepLink.subscribePlatformOAuthPayload(first)
    deepLink.subscribePlatformOAuthPayload(second)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it("delivers straight to a live listener without also holding it", async () => {
    const { deepLink, unclaimed } = await startedDelivery()
    const handler = vi.fn()
    deepLink.subscribePlatformOAuthPayload(handler)

    mocks.emit?.([CALLBACK])

    expect(handler).toHaveBeenCalledWith({ code: "cold-start" })
    expect(unclaimed).not.toHaveBeenCalled()

    const late = vi.fn()
    deepLink.subscribePlatformOAuthPayload(late)
    expect(late).not.toHaveBeenCalled()
  })

  it("starts the underlying subscription only once", async () => {
    const { deepLink } = await startedDelivery()

    deepLink.startPlatformOAuthDeepLink()
    deepLink.startPlatformOAuthDeepLink()

    expect(mocks.onOpenUrl).toHaveBeenCalledTimes(1)
  })

  it("stops delivering to an unsubscribed listener", async () => {
    const { deepLink } = await startedDelivery()
    const handler = vi.fn()
    const unsubscribe = deepLink.subscribePlatformOAuthPayload(handler)
    unsubscribe()

    mocks.emit?.([CALLBACK])

    expect(handler).not.toHaveBeenCalled()
  })

  it("ignores a URL that is not the callback", async () => {
    const { deepLink, unclaimed } = await startedDelivery()

    mocks.emit?.(["imsweb://oauth/other?code=nope", "https://example.test/"])

    expect(unclaimed).not.toHaveBeenCalled()
    const handler = vi.fn()
    deepLink.subscribePlatformOAuthPayload(handler)
    expect(handler).not.toHaveBeenCalled()
  })
})
