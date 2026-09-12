import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api"
import AccountSecurityPage from "~/pages/account/security/account-security-page"

const sessionMocks = vi.hoisted(() => ({
  usePlatformSession: vi.fn(),
  reload: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  changePlatformPassword: vi.fn(),
  getPlatformSessionDevices: vi.fn(),
  revokePlatformSessionDevice: vi.fn(),
  revokeOtherPlatformSessions: vi.fn(),
  getPlatformOAuthLinks: vi.fn(),
  unlinkPlatformOAuthLink: vi.fn(),
  sendPasswordChange: vi.fn(),
  sendSessions: vi.fn(),
  sendRevoke: vi.fn(),
  sendRevokeOthers: vi.fn(),
  sendLinks: vi.fn(),
  sendUnlink: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    changePlatformPassword: apiMocks.changePlatformPassword,
    getPlatformSessionDevices: apiMocks.getPlatformSessionDevices,
    revokePlatformSessionDevice: apiMocks.revokePlatformSessionDevice,
    revokeOtherPlatformSessions: apiMocks.revokeOtherPlatformSessions,
    getPlatformOAuthLinks: apiMocks.getPlatformOAuthLinks,
    unlinkPlatformOAuthLink: apiMocks.unlinkPlatformOAuthLink,
  }
})

const currentDevice = {
  id: "session-current",
  current: true,
  userAgent: "Mozilla/5.0 (Macintosh)",
  ipAddress: "203.0.113.7",
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_500_000,
  expiresAt: 1_800_000_000_000,
}

const otherDevice = {
  id: "session-other",
  current: false,
  userAgent: "Mozilla/5.0 (iPhone)",
  ipAddress: "198.51.100.4",
  createdAt: 1_700_000_100_000,
  lastSeenAt: null,
  expiresAt: 1_800_000_000_000,
}

const removableLink = {
  provider: "github",
  providerName: "GitHub",
  enabled: true,
  accountName: "producer",
  avatarUrl: null,
  linkedAt: 1_700_000_000_000,
  removable: true,
}

// The server says this one cannot go: it is the account's only usable way in.
const lockedLink = {
  provider: "wechat",
  providerName: "微信",
  enabled: true,
  accountName: null,
  avatarUrl: null,
  linkedAt: 1_700_000_200_000,
  removable: false,
}

function authenticatedSession(
  status: "authenticated" | "restricted" = "authenticated"
) {
  return {
    status,
    session: {
      success: true,
      account: {
        id: "platform-1",
        status: status === "restricted" ? "restricted" : "active",
      },
      profile: {
        displayName: "春香P",
        avatarUrl: null,
        homeCity: "上海",
        bio: "",
      },
    },
    error: null,
    reload: sessionMocks.reload,
    logout: vi.fn(),
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/security"]}>
      <AccountSecurityPage />
    </MemoryRouter>
  )
}

async function submitPasswordChange(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText("当前密码"),
    "old-password-value"
  )
  await user.type(screen.getByLabelText("新密码"), "correct-horse-battery")
  await user.type(screen.getByLabelText("确认新密码"), "correct-horse-battery")
  await user.click(screen.getByRole("button", { name: "更新密码" }))
}

describe("AccountSecurityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMocks.usePlatformSession.mockReturnValue(authenticatedSession())
    apiMocks.changePlatformPassword.mockReturnValue({
      send: apiMocks.sendPasswordChange,
    })
    apiMocks.getPlatformSessionDevices.mockReturnValue({
      send: apiMocks.sendSessions,
    })
    apiMocks.revokePlatformSessionDevice.mockReturnValue({
      send: apiMocks.sendRevoke,
    })
    apiMocks.revokeOtherPlatformSessions.mockReturnValue({
      send: apiMocks.sendRevokeOthers,
    })
    apiMocks.getPlatformOAuthLinks.mockReturnValue({ send: apiMocks.sendLinks })
    apiMocks.unlinkPlatformOAuthLink.mockReturnValue({
      send: apiMocks.sendUnlink,
    })

    apiMocks.sendSessions.mockResolvedValue({
      success: true,
      sessions: [currentDevice, otherDevice],
    })
    apiMocks.sendLinks.mockResolvedValue({
      success: true,
      links: [removableLink, lockedLink],
      passwordEnabled: true,
    })
    apiMocks.sendPasswordChange.mockResolvedValue({
      success: true,
      revokedSessionCount: 2,
    })
    apiMocks.sendRevoke.mockResolvedValue({
      success: true,
      revokedSessionCount: 1,
    })
    apiMocks.sendRevokeOthers.mockResolvedValue({
      success: true,
      revokedSessionCount: 2,
    })
    apiMocks.sendUnlink.mockResolvedValue({ success: true, provider: "github" })
  })

  it("retires the password form for an account that has no password", async () => {
    // The login-method list is the only thing that knows this up front. Before
    // it carried the flag, an OAuth-only user got a full form whose every
    // submission was destined to come back 409.
    apiMocks.sendLinks.mockResolvedValue({
      success: true,
      links: [removableLink],
      passwordEnabled: false,
    })

    renderPage()

    await waitFor(() => {
      expect(
        document.querySelector('[data-password-available="false"]')
      ).not.toBeNull()
    })
    expect(
      screen.queryByLabelText("platformAccount.security.password.current")
    ).toBeNull()
    // The answer came from the list that was already being fetched, so the
    // password form must not have added a request of its own.
    expect(apiMocks.changePlatformPassword).not.toHaveBeenCalled()
  })

  it("shows a wrong current password as a field error, not a global banner", async () => {
    apiMocks.sendPasswordChange.mockRejectedValue(
      new ApiError("当前密码不正确", {
        kind: "http",
        status: 403,
        code: "PLATFORM_PASSWORD_CURRENT_INVALID",
      })
    )
    const user = userEvent.setup()
    renderPage()

    await submitPasswordChange(user)

    const currentPasswordInput = await screen.findByLabelText("当前密码")
    await waitFor(() => {
      expect(currentPasswordInput).toHaveAttribute("aria-invalid", "true")
    })
    // The message has to hang off the offending input, otherwise the field
    // still looks accepted while a banner blames the page.
    expect(currentPasswordInput).toHaveAttribute(
      "aria-describedby",
      "account-security-current-password-error"
    )
    const fieldError = document.getElementById(
      "account-security-current-password-error"
    )
    expect(fieldError).toHaveTextContent("当前密码不正确。")
    expect(
      screen.queryByText("密码更新失败，请稍后重试。")
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText("新密码")).toHaveAttribute(
      "aria-invalid",
      "false"
    )
  })

  it("separates the other documented password failures by code", async () => {
    const user = userEvent.setup()
    apiMocks.sendPasswordChange.mockRejectedValue(
      new ApiError("新密码与当前密码相同", {
        kind: "http",
        status: 400,
        code: "PLATFORM_PASSWORD_UNCHANGED",
      })
    )
    const { unmount } = renderPage()
    await submitPasswordChange(user)
    expect(await screen.findByText("新密码不能与当前密码相同。")).toBeVisible()
    unmount()

    // An OAuth-only account has no credential to replace, so the form retires
    // itself rather than showing an error the user cannot act on.
    apiMocks.sendPasswordChange.mockRejectedValue(
      new ApiError("没有密码凭据", {
        kind: "http",
        status: 409,
        code: "PLATFORM_PASSWORD_UNAVAILABLE",
      })
    )
    renderPage()
    await submitPasswordChange(user)

    expect(await screen.findByText("该帐号没有密码凭据")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "更新密码" })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument()
  })

  it("re-reads the device list after a password change rebuilds the tokens", async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(apiMocks.getPlatformSessionDevices).toHaveBeenCalledTimes(1)
    })

    await submitPasswordChange(user)

    await waitFor(() => {
      expect(apiMocks.changePlatformPassword).toHaveBeenCalledWith({
        currentPassword: "old-password-value",
        newPassword: "correct-horse-battery",
      })
    })
    // The server signed every other device out inside the same transaction,
    // so the rendered list is stale the moment this resolves.
    await waitFor(() => {
      expect(apiMocks.getPlatformSessionDevices).toHaveBeenCalledTimes(2)
    })
    expect(
      await screen.findByText("密码已更新，已登出其他 2 台设备。")
    ).toBeVisible()
  })

  it("never offers to revoke the current device", async () => {
    renderPage()

    const currentRow = await screen.findByText("Mozilla/5.0 (Macintosh)")
    const currentItem = currentRow.closest("li")
    expect(currentItem).not.toBeNull()
    expect(currentItem).toHaveAttribute("data-session-current", "true")
    expect(
      within(currentItem as HTMLElement).queryByRole("button", { name: /吊销/ })
    ).not.toBeInTheDocument()
    expect(
      within(currentItem as HTMLElement).getByText("当前设备")
    ).toBeVisible()

    // The other device keeps its control, so the absence above is specific.
    const otherItem = screen.getByText("Mozilla/5.0 (iPhone)").closest("li")
    expect(
      within(otherItem as HTMLElement).getByRole("button", {
        name: "吊销 Mozilla/5.0 (iPhone) 的登录",
      })
    ).toBeEnabled()
  })

  it("revokes a single device and signs the rest out", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", {
        name: "吊销 Mozilla/5.0 (iPhone) 的登录",
      })
    )
    await waitFor(() => {
      expect(apiMocks.revokePlatformSessionDevice).toHaveBeenCalledWith(
        "session-other"
      )
    })
    expect(await screen.findByText("该设备的登录已吊销。")).toBeVisible()
    expect(screen.queryByText("Mozilla/5.0 (iPhone)")).not.toBeInTheDocument()
  })

  it("takes the unlink button's disabled state from the server flag", async () => {
    renderPage()

    const lockedRow = await screen.findByText("微信")
    const lockedItem = lockedRow.closest("li")
    expect(lockedItem).toHaveAttribute("data-removable", "false")
    // `removable` is false even though this provider is enabled, because the
    // guard also weighs the siblings; recomputing it client-side would enable
    // a button that strands the user.
    expect(
      within(lockedItem as HTMLElement).getByRole("button", {
        name: "解绑 微信",
      })
    ).toBeDisabled()
    expect(
      within(lockedItem as HTMLElement).getByText(
        "唯一可用的登录方式，无法解绑"
      )
    ).toBeVisible()

    const removableItem = screen.getByText("GitHub").closest("li")
    expect(removableItem).toHaveAttribute("data-removable", "true")
    expect(
      within(removableItem as HTMLElement).getByRole("button", {
        name: "解绑 GitHub",
      })
    ).toBeEnabled()
  })

  it("explains a refused unlink as the last login method", async () => {
    apiMocks.sendUnlink.mockRejectedValue(
      new ApiError("最后一个登录方式", {
        kind: "http",
        status: 409,
        code: "PLATFORM_OAUTH_LAST_LOGIN_METHOD",
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("button", { name: "解绑 GitHub" }))

    await waitFor(() => {
      expect(apiMocks.unlinkPlatformOAuthLink).toHaveBeenCalledWith("github")
    })
    expect(
      await screen.findByText(
        "这是当前帐号唯一可用的登录方式，解绑后将无法登录。"
      )
    ).toBeVisible()
    expect(screen.getByText("GitHub")).toBeVisible()
  })

  it("offers the sign-in route to an anonymous visitor", async () => {
    sessionMocks.usePlatformSession.mockReturnValue({
      status: "anonymous",
      session: null,
      error: null,
      reload: sessionMocks.reload,
      logout: vi.fn(),
    })
    renderPage()

    expect(await screen.findByText("请先登录")).toBeVisible()
    // The account shell renders these as anchors carrying role="button".
    expect(screen.getByRole("button", { name: "登录" })).toHaveAttribute(
      "href",
      "/account/login"
    )
    expect(screen.getByRole("button", { name: "注册" })).toHaveAttribute(
      "href",
      "/account/register"
    )
    // A signed-out visitor must not trigger the signed-in-only reads.
    expect(apiMocks.getPlatformSessionDevices).not.toHaveBeenCalled()
    expect(apiMocks.getPlatformOAuthLinks).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument()
  })

  it("keeps a restricted account read-only", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(
      authenticatedSession("restricted")
    )
    renderPage()

    expect(
      await screen.findByRole("button", { name: "更新密码" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "吊销 Mozilla/5.0 (iPhone) 的登录",
      })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "解绑 GitHub" })).toBeDisabled()
  })
})
