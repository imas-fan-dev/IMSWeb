import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api"
import {
  PlatformSessionProvider,
  usePlatformSession,
} from "~/components/platform/platform-session-provider"

const apiMocks = vi.hoisted(() => ({
  getSessionSend: vi.fn(),
  hasSessionHint: vi.fn(),
  logoutSend: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getPlatformSession: () => ({ send: apiMocks.getSessionSend }),
    hasPlatformSessionHint: apiMocks.hasSessionHint,
    logoutPlatform: () => ({ send: apiMocks.logoutSend }),
  }
})

function SessionProbe() {
  const session = usePlatformSession()
  return (
    <div>
      <output aria-label="session-status">{session.status}</output>
      <output aria-label="display-name">
        {session.session?.profile.displayName ?? "none"}
      </output>
      <output aria-label="session-json">
        {session.session ? JSON.stringify(session.session) : "none"}
      </output>
      <button type="button" onClick={() => void session.reload()}>
        reload
      </button>
      <button
        type="button"
        onClick={() => session.acceptSession(activeSession)}
      >
        accept
      </button>
      <button type="button" onClick={() => session.acceptSession(otherSession)}>
        switch-account
      </button>
      <button
        type="button"
        onClick={() => session.acceptProfile("platform-1", updatedProfile)}
      >
        accept-profile
      </button>
      <button type="button" onClick={() => void session.logout()}>
        logout
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <PlatformSessionProvider>
      <SessionProbe />
    </PlatformSessionProvider>
  )
}

const activeSession = {
  success: true as const,
  account: { id: "platform-1", status: "active" as const },
  profile: {
    displayName: "Platform Producer",
    avatarUrl: null,
    homeCity: null,
    bio: "",
  },
  accessToken: "access-1",
  refreshToken: "refresh-1",
}

const otherSession = {
  ...activeSession,
  account: { id: "platform-2", status: "active" as const },
  profile: {
    ...activeSession.profile,
    displayName: "Other Producer",
  },
  accessToken: "access-2",
  refreshToken: "refresh-2",
}

const updatedProfile = {
  displayName: "Updated Producer",
  avatarUrl: "/api/platform/me/avatar?v=2",
  homeCity: "上海",
  bio: "Updated bio",
  updatedAt: 2,
}

describe("PlatformSessionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stays anonymous and avoids a session request without a cookie hint", () => {
    apiMocks.hasSessionHint.mockReturnValue(false)

    renderProvider()

    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "anonymous"
    )
    expect(apiMocks.getSessionSend).not.toHaveBeenCalled()
  })

  it("exposes loading before resolving an active session", async () => {
    apiMocks.hasSessionHint.mockReturnValue(true)
    let resolveSession!: (session: typeof activeSession) => void
    apiMocks.getSessionSend.mockReturnValue(
      new Promise<typeof activeSession>((resolve) => {
        resolveSession = resolve
      })
    )

    renderProvider()

    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent(
        "loading"
      )
    )
    await act(() => resolveSession(activeSession))
    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "authenticated"
    )
    expect(screen.getByLabelText("display-name")).toHaveTextContent(
      "Platform Producer"
    )
  })

  it("keeps restricted accounts authenticated with an explicit state", async () => {
    apiMocks.hasSessionHint.mockReturnValue(true)
    apiMocks.getSessionSend.mockResolvedValue({
      ...activeSession,
      account: { ...activeSession.account, status: "restricted" },
    })

    renderProvider()

    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent(
        "restricted"
      )
    )
  })

  it("accepts a returned login session without requesting it again", async () => {
    apiMocks.hasSessionHint.mockReturnValue(false)

    renderProvider()
    await userEvent.click(screen.getByRole("button", { name: "accept" }))

    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "authenticated"
    )
    expect(screen.getByLabelText("display-name")).toHaveTextContent(
      "Platform Producer"
    )
    expect(apiMocks.getSessionSend).not.toHaveBeenCalled()
  })

  it("accepts a matching profile without replacing session fields", async () => {
    apiMocks.hasSessionHint.mockReturnValue(false)

    renderProvider()
    await userEvent.click(screen.getByRole("button", { name: "accept" }))
    await userEvent.click(
      screen.getByRole("button", { name: "accept-profile" })
    )

    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "authenticated"
    )
    expect(
      JSON.parse(screen.getByLabelText("session-json").textContent ?? "")
    ).toEqual({
      ...activeSession,
      profile: {
        displayName: updatedProfile.displayName,
        avatarUrl: updatedProfile.avatarUrl,
        homeCity: updatedProfile.homeCity,
        bio: updatedProfile.bio,
      },
    })
  })

  it("ignores an old account profile after the live account changes", async () => {
    apiMocks.hasSessionHint.mockReturnValue(false)

    renderProvider()
    await userEvent.click(screen.getByRole("button", { name: "accept" }))
    await userEvent.click(
      screen.getByRole("button", { name: "switch-account" })
    )
    await userEvent.click(
      screen.getByRole("button", { name: "accept-profile" })
    )

    expect(
      JSON.parse(screen.getByLabelText("session-json").textContent ?? "")
    ).toEqual(otherSession)
  })

  it("does not let a profile update restore state during a deferred reload", async () => {
    apiMocks.hasSessionHint.mockReturnValue(false)
    const freshSession = {
      ...activeSession,
      profile: { ...activeSession.profile, displayName: "Reloaded Producer" },
    }
    let resolveReload!: (session: typeof freshSession) => void

    renderProvider()
    await userEvent.click(screen.getByRole("button", { name: "accept" }))
    apiMocks.hasSessionHint.mockReturnValue(true)
    apiMocks.getSessionSend.mockReturnValue(
      new Promise<typeof freshSession>((resolve) => {
        resolveReload = resolve
      })
    )
    await userEvent.click(screen.getByRole("button", { name: "reload" }))
    await userEvent.click(
      screen.getByRole("button", { name: "accept-profile" })
    )

    expect(screen.getByLabelText("session-status")).toHaveTextContent("loading")
    expect(screen.getByLabelText("session-json")).toHaveTextContent("none")
    await act(() => resolveReload(freshSession))
    expect(screen.getByLabelText("display-name")).toHaveTextContent(
      "Reloaded Producer"
    )
  })

  it("does not let a profile update restore state during a deferred logout", async () => {
    apiMocks.hasSessionHint.mockReturnValue(false)
    let resolveLogout!: (result: { success: true }) => void

    renderProvider()
    await userEvent.click(screen.getByRole("button", { name: "accept" }))
    apiMocks.hasSessionHint.mockReturnValue(true)
    apiMocks.logoutSend.mockReturnValue(
      new Promise<{ success: true }>((resolve) => {
        resolveLogout = resolve
      })
    )
    await userEvent.click(screen.getByRole("button", { name: "logout" }))
    await userEvent.click(
      screen.getByRole("button", { name: "accept-profile" })
    )

    expect(screen.getByLabelText("session-status")).toHaveTextContent("loading")
    await act(() => resolveLogout({ success: true }))
    expect(screen.getByLabelText("session-status")).toHaveTextContent(
      "anonymous"
    )
    expect(screen.getByLabelText("session-json")).toHaveTextContent("none")
  })

  it("drops rejected sessions but surfaces unexpected failures", async () => {
    apiMocks.hasSessionHint.mockReturnValue(true)
    apiMocks.getSessionSend.mockRejectedValueOnce(
      new ApiError("expired", { kind: "http", status: 401 })
    )

    const view = renderProvider()
    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent(
        "anonymous"
      )
    )

    apiMocks.getSessionSend.mockRejectedValueOnce(
      new ApiError("offline", { kind: "network" })
    )
    await userEvent.click(screen.getByRole("button", { name: "reload" }))
    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent("error")
    )
    view.unmount()
  })

  it("logs out only the Platform session and returns to anonymous", async () => {
    apiMocks.hasSessionHint.mockReturnValue(true)
    apiMocks.getSessionSend.mockResolvedValue(activeSession)
    apiMocks.logoutSend.mockResolvedValue({ success: true })

    renderProvider()
    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent(
        "authenticated"
      )
    )
    await userEvent.click(screen.getByRole("button", { name: "logout" }))

    await waitFor(() =>
      expect(screen.getByLabelText("session-status")).toHaveTextContent(
        "anonymous"
      )
    )
    expect(apiMocks.logoutSend).toHaveBeenCalledOnce()
  })
})
