import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api/api-error"
import type { PlatformOAuthCallbackPayload } from "~/lib/platform-oauth-deep-link"

const mocks = vi.hoisted(() => ({
  acceptSession: vi.fn(),
  navigate: vi.fn(),
  openSystemUrl: vi.fn(),
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

vi.mock("~/lib/navigation/use-navigation", () => ({
  useNavigation: () => mocks.navigate,
}))

vi.mock("~/lib/navigation/system-opener", () => ({
  openSystemUrl: mocks.openSystemUrl,
}))

vi.mock("~/lib/platform-oauth-deep-link", () => ({
  subscribePlatformOAuthPayload: mocks.subscribe,
}))

vi.mock("~/lib/api/endpoints/platform/oauth-exchange", () => ({
  exchangePlatformOAuthSession: mocks.exchange,
}))

import { usePlatformOAuthAppLogin } from "~/pages/account/components/use-platform-oauth-app-login"

const VERIFIER = "v".repeat(43)
const CODE = "c".repeat(43)
const VERIFIER_STORAGE_KEY = "ims.platform.oauth-app-verifier"

describe("usePlatformOAuthAppLogin", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.subscribe.mockImplementation(
      (handler: (payload: PlatformOAuthCallbackPayload) => void) => {
        mocks.handler = handler
        return () => undefined
      }
    )
    mocks.exchange.mockReturnValue({ send: mocks.exchangeSend })
    mocks.handler = null
  })

  /** Writes the stored verifier the way the hook does, with its own deadline. */
  function storeVerifier(verifier: string, expiresAt: number): void {
    window.localStorage.setItem(
      VERIFIER_STORAGE_KEY,
      JSON.stringify({ verifier, expiresAt })
    )
  }

  async function renderLogin() {
    const hook = renderHook(() => usePlatformOAuthAppLogin())
    await waitFor(() => expect(mocks.handler).not.toBeNull())
    return hook
  }

  it("opens the system browser and waits for the deep link", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLogin()

    await act(async () => {
      await result.current.start("github")
    })

    expect(mocks.openSystemUrl).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/platform/auth/oauth/github/start?client=app&codeChallenge="
      )
    )
    expect(result.current.status).toBe("waiting")
    expect(result.current.activeProvider).toBe("github")
    // The verifier is kept for the return leg, never placed in the URL.
    expect(mocks.openSystemUrl.mock.calls[0]?.[0]).not.toContain(VERIFIER)
  })

  it("redeems a deep-link code with the stored verifier", async () => {
    storeVerifier(VERIFIER, Date.now() + 60_000)
    mocks.exchangeSend.mockResolvedValue({
      success: true,
      account: { id: "platform-1", status: "active" },
      profile: {
        displayName: "App Producer",
        avatarUrl: null,
        homeCity: null,
        bio: "",
      },
    })
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ code: CODE })
    })

    await waitFor(() => expect(mocks.acceptSession).toHaveBeenCalled())
    expect(mocks.exchange).toHaveBeenCalledWith({
      code: CODE,
      codeVerifier: VERIFIER,
    })
    expect(mocks.navigate).toHaveBeenCalledWith("/account/me", {
      replace: true,
    })
    expect(result.current.status).toBe("idle")
  })

  it("maps a provider denial onto a visible reason", async () => {
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ error: "denied" })
    })

    expect(result.current.status).toBe("error")
    expect(result.current.errorKey).toBe("platformAuth.oauth.denied")
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it("reports an expired code when the exchange is refused", async () => {
    storeVerifier(VERIFIER, Date.now() + 60_000)
    mocks.exchangeSend.mockRejectedValue(
      new ApiError("expired", {
        kind: "http",
        status: 401,
        code: "PLATFORM_OAUTH_EXCHANGE_EXPIRED",
        payload: { success: false, code: "PLATFORM_OAUTH_EXCHANGE_EXPIRED" },
      })
    )
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ code: CODE })
    })

    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.errorKey).toBe("platformAuth.oauth.expired")
    expect(mocks.acceptSession).not.toHaveBeenCalled()
  })

  it("fails closed when a cold-start deep link arrives without a verifier", async () => {
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ code: CODE })
    })

    expect(result.current.status).toBe("error")
    expect(result.current.errorKey).toBe("platformAuth.oauth.expired")
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it("cancels a waiting round trip", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLogin()

    await act(async () => {
      await result.current.start("github")
    })
    act(() => result.current.cancel())

    expect(result.current.status).toBe("idle")
    expect(result.current.activeProvider).toBeNull()
  })

  // The defect this guards: the verifier used to live in `sessionStorage`, which
  // the OS wipes when it reclaims the app while the user is authorizing in the
  // system browser. The returned code then arrived with nothing to redeem it.
  it("keeps the verifier on disk, with a deadline, for the return leg", async () => {
    mocks.openSystemUrl.mockResolvedValue(undefined)
    const { result } = await renderLogin()

    await act(async () => {
      await result.current.start("github")
    })

    const raw = window.localStorage.getItem(VERIFIER_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({
      verifier: expect.stringMatching(/^[\w-]{43}$/),
      expiresAt: expect.any(Number),
    })
    expect(
      JSON.parse(raw as string).expiresAt
    ).toBeGreaterThan(Date.now())
    expect(window.sessionStorage.getItem(VERIFIER_STORAGE_KEY)).toBeNull()
  })

  it("refuses a verifier that outlived its window", async () => {
    storeVerifier(VERIFIER, Date.now() - 1)
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ code: CODE })
    })

    expect(result.current.status).toBe("error")
    expect(result.current.errorKey).toBe("platformAuth.oauth.expired")
    expect(mocks.exchange).not.toHaveBeenCalled()
    // A dead verifier cannot be mistaken for a live one on a later attempt.
    expect(window.localStorage.getItem(VERIFIER_STORAGE_KEY)).toBeNull()
  })

  it("refuses an unreadable stored verifier instead of guessing", async () => {
    window.localStorage.setItem(VERIFIER_STORAGE_KEY, "not-json")
    const { result } = await renderLogin()

    await act(async () => {
      mocks.handler?.({ code: CODE })
    })

    expect(result.current.errorKey).toBe("platformAuth.oauth.expired")
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
})
