import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api/api-error"
import type { PlatformOAuthCallbackPayload } from "~/lib/platform-oauth-deep-link"

const mocks = vi.hoisted(() => ({
  acceptSession: vi.fn(),
  openSystemUrl: vi.fn(),
  start: vi.fn(),
  startSend: vi.fn(),
  exchange: vi.fn(),
  exchangeSend: vi.fn(),
  subscribe: vi.fn(),
  handler: null as ((payload: PlatformOAuthCallbackPayload) => void) | null,
}))

// The hook reaches origin through the ~/lib/api facade, so this mock has to
// keep the module's other exports readable rather than stub the origin alone.
vi.mock("~/lib/api/origin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api/origin")>()
  return {
    ...actual,
    API_ORIGIN: "https://api.example.test",
    isCrossOriginApi: true,
  }
})

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: () => ({ acceptSession: mocks.acceptSession }),
}))

vi.mock("~/lib/navigation/system-opener", () => ({
  openSystemUrl: mocks.openSystemUrl,
}))

vi.mock("~/lib/platform-oauth-deep-link", () => ({
  subscribePlatformOAuthPayload: mocks.subscribe,
}))

vi.mock(
  "~/lib/api/endpoints/platform/account-security",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/lib/api/endpoints/platform/account-security")
      >()
    return { ...actual, startPlatformOAuthLinkApp: mocks.start }
  }
)

vi.mock("~/lib/api/endpoints/platform/oauth-exchange", () => ({
  exchangePlatformOAuthSession: mocks.exchange,
}))

import { usePlatformOAuthAppLink } from "~/pages/account/security/use-platform-oauth-app-link"

const VERIFIER = "v".repeat(43)
const CODE = "c".repeat(43)
const LINK_VERIFIER_KEY = "ims.platform.oauth-app-link-verifier"
const AUTHORIZATION_URL = "https://provider.example/authorize"

const SESSION = {
  success: true,
  account: { id: "platform-1", status: "active" },
  profile: {
    displayName: "App Producer",
    avatarUrl: null,
    homeCity: null,
    bio: "",
  },
}

function apiError(status: number, code: string): ApiError {
  return new ApiError("request failed", {
    kind: "http",
    status,
    code,
    payload: { success: false, code },
  })
}

describe("usePlatformOAuthAppLink", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.subscribe.mockImplementation(
      (handler: (payload: PlatformOAuthCallbackPayload) => void) => {
        mocks.handler = handler
        return () => undefined
      }
    )
    mocks.start.mockReturnValue({ send: mocks.startSend })
    mocks.startSend.mockResolvedValue({
      success: true,
      authorizationUrl: AUTHORIZATION_URL,
    })
    mocks.exchange.mockReturnValue({ send: mocks.exchangeSend })
    mocks.handler = null
  })

  /** Writes the stored link verifier the way the hook does, with a deadline. */
  function storeVerifier(verifier: string, expiresAt: number): void {
    window.localStorage.setItem(
      LINK_VERIFIER_KEY,
      JSON.stringify({ verifier, expiresAt })
    )
  }

  async function renderLink(onLinked?: () => void) {
    const hook = renderHook(() => usePlatformOAuthAppLink(onLinked))
    await waitFor(() => expect(mocks.handler).not.toBeNull())
    return hook
  }

  it("posts the challenge, opens the returned URL, and waits", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("github")
    })

    expect(mocks.start).toHaveBeenCalledWith({
      provider: "github",
      codeChallenge: expect.stringMatching(/^[\w-]{43}$/),
    })
    expect(mocks.openSystemUrl).toHaveBeenCalledWith(AUTHORIZATION_URL)
    expect(result.current.waiting).toBe(true)
    expect(result.current.activeProvider).toBe("github")
    const raw = window.localStorage.getItem(LINK_VERIFIER_KEY)
    expect(raw).not.toBeNull()
    const storedVerifier = JSON.parse(raw as string).verifier as string
    expect(storedVerifier).toMatch(/^[\w-]{43}$/)
    // The verifier is kept for the return leg, never placed in the URL.
    expect(mocks.openSystemUrl.mock.calls[0]?.[0]).not.toContain(storedVerifier)
  })

  it("redeems a deep-link code, reloads the list, and reports the link", async () => {
    storeVerifier(VERIFIER, Date.now() + 60_000)
    mocks.exchangeSend.mockResolvedValue(SESSION)
    const onLinked = vi.fn()
    const { result } = await renderLink(onLinked)

    await act(async () => {
      mocks.handler?.({ code: CODE, flow: "link" })
    })

    await waitFor(() =>
      expect(mocks.acceptSession).toHaveBeenCalledWith(SESSION)
    )
    expect(mocks.exchange).toHaveBeenCalledWith({
      code: CODE,
      codeVerifier: VERIFIER,
    })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linked",
      success: true,
    })
    expect(result.current.waiting).toBe(false)
    expect(window.localStorage.getItem(LINK_VERIFIER_KEY)).toBeNull()
  })

  it("maps a deep-link error through the account-security reason keys", async () => {
    const { result } = await renderLink()

    await act(async () => {
      mocks.handler?.({ error: "link-conflict", flow: "link" })
    })

    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkConflict",
      success: false,
    })
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it("degrades an unknown deep-link reason to the generic failure", async () => {
    const { result } = await renderLink()

    await act(async () => {
      mocks.handler?.({ error: "mystery", flow: "link" })
    })

    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkFailed",
      success: false,
    })
  })

  it("fails closed when a cold-start code arrives without a verifier", async () => {
    const { result } = await renderLink()

    await act(async () => {
      mocks.handler?.({ code: CODE, flow: "link" })
    })

    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkExpired",
      success: false,
    })
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it("reports an expired exchange and clears the verifier", async () => {
    storeVerifier(VERIFIER, Date.now() + 60_000)
    mocks.exchangeSend.mockRejectedValue(
      apiError(401, "PLATFORM_OAUTH_EXCHANGE_EXPIRED")
    )
    const { result } = await renderLink()

    await act(async () => {
      mocks.handler?.({ code: CODE, flow: "link" })
    })

    await waitFor(() =>
      expect(result.current.result?.key).toBe(
        "platformAccount.security.oauth.linkExpired"
      )
    )
    expect(window.localStorage.getItem(LINK_VERIFIER_KEY)).toBeNull()
  })

  it("reports a refused exchange that is not an expiry as a generic failure", async () => {
    storeVerifier(VERIFIER, Date.now() + 60_000)
    mocks.exchangeSend.mockRejectedValue(
      apiError(401, "PLATFORM_OAUTH_EXCHANGE_INVALID")
    )
    const { result } = await renderLink()

    await act(async () => {
      mocks.handler?.({ code: CODE, flow: "link" })
    })

    await waitFor(() =>
      expect(result.current.result?.key).toBe(
        "platformAccount.security.oauth.linkFailed"
      )
    )
  })

  it("maps an unavailable provider start to its own reason", async () => {
    mocks.startSend.mockRejectedValue(
      apiError(404, "PLATFORM_OAUTH_LINK_UNAVAILABLE")
    )
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("google")
    })

    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkUnavailable",
      success: false,
    })
    expect(result.current.waiting).toBe(false)
    expect(mocks.openSystemUrl).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(LINK_VERIFIER_KEY)).toBeNull()
  })

  it("maps any other start failure to the generic reason", async () => {
    mocks.startSend.mockRejectedValue(new Error("offline"))
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("github")
    })

    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkFailed",
      success: false,
    })
  })

  it("cancels the wait and drops the verifier", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("github")
    })
    act(() => result.current.cancel())

    expect(result.current.waiting).toBe(false)
    expect(result.current.activeProvider).toBeNull()
    expect(result.current.result).toBeNull()
    expect(window.localStorage.getItem(LINK_VERIFIER_KEY)).toBeNull()
  })

  it("ignores a second start while the first round trip is in flight", async () => {
    let releaseStart: (value: unknown) => void = () => undefined
    mocks.startSend.mockReturnValue(
      new Promise((resolve) => {
        releaseStart = resolve
      })
    )
    const { result } = await renderLink()

    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    await act(async () => {
      first = result.current.start("github")
      second = result.current.start("github")
      releaseStart({ success: true, authorizationUrl: AUTHORIZATION_URL })
      await Promise.all([first, second])
    })

    // Exactly one state row, one verifier on disk, one browser hand-off.
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.openSystemUrl).toHaveBeenCalledTimes(1)
    expect(result.current.waiting).toBe(true)
  })

  it("allows a fresh start after the wait is cancelled", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("github")
    })
    act(() => result.current.cancel())
    await act(async () => {
      await result.current.start("google")
    })

    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(result.current.activeProvider).toBe("google")
    expect(result.current.waiting).toBe(true)
  })

  it("ends the wait when the round trip times out", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const timeout = vi.spyOn(window, "setTimeout")
    const { result } = await renderLink()

    await act(async () => {
      await result.current.start("github")
    })
    const scheduled = timeout.mock.calls.find(([, delay]) => delay === 300_000)
    expect(scheduled).toBeDefined()

    act(() => (scheduled?.[0] as () => void)())

    expect(result.current.waiting).toBe(false)
    expect(result.current.result).toEqual({
      key: "platformAccount.security.oauth.linkExpired",
      success: false,
    })
    expect(window.localStorage.getItem(LINK_VERIFIER_KEY)).toBeNull()
  })
})
