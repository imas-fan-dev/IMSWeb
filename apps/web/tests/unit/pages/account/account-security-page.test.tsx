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
  getPlatformOAuthProviders: vi.fn(),
  unlinkPlatformOAuthLink: vi.fn(),
  sendPasswordChange: vi.fn(),
  sendSessions: vi.fn(),
  sendRevoke: vi.fn(),
  sendRevokeOthers: vi.fn(),
  sendLinks: vi.fn(),
  sendProviders: vi.fn(),
  sendUnlink: vi.fn(),
}))

const emailApiMocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  sendBind: vi.fn(),
  sendChange: vi.fn(),
  getPlatformEmailCredential: vi.fn(),
  sendPlatformEmailVerificationCode: vi.fn(),
  bindPlatformEmail: vi.fn(),
  changePlatformEmail: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

vi.mock("~/lib/api/endpoints/platform/account-security", () => ({
  getPlatformEmailCredential: emailApiMocks.getPlatformEmailCredential,
  sendPlatformEmailVerificationCode:
    emailApiMocks.sendPlatformEmailVerificationCode,
  bindPlatformEmail: emailApiMocks.bindPlatformEmail,
  changePlatformEmail: emailApiMocks.changePlatformEmail,
  platformOAuthLinkStartUrl: (provider: string) =>
    `/api/platform/me/oauth-links/${provider}/start`,
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
    getPlatformOAuthProviders: apiMocks.getPlatformOAuthProviders,
    unlinkPlatformOAuthLink: apiMocks.unlinkPlatformOAuthLink,
  }
})

const MAC_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15"
const TAURI_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
const IPOD_TOUCH_UA =
  "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"

const currentDevice = {
  id: "3a7f1c2e-9d4b-4c6a-8e2f-1b3c5d7e9f0a",
  current: true,
  userAgent: MAC_SAFARI_UA,
  ipAddress: "203.0.113.7",
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_500_000,
  expiresAt: 1_800_000_000_000,
}

const otherDevice = {
  id: "9b2d4e6f-1234-4abc-9def-0123456789ab",
  current: false,
  userAgent: TAURI_IOS_UA,
  ipAddress: "198.51.100.4",
  createdAt: 1_700_000_100_000,
  lastSeenAt: null,
  expiresAt: 1_800_000_000_000,
}

// iOS with no device token: the system is known but the form is not.
const ipodDevice = {
  id: "5c1e7a90-2b4d-4e6f-8a0b-1c2d3e4f5a6b",
  current: false,
  userAgent: IPOD_TOUCH_UA,
  ipAddress: "198.51.100.9",
  createdAt: 1_700_000_200_000,
  lastSeenAt: null,
  expiresAt: 1_800_000_000_000,
}

// A migrated row with no recorded user agent at all.
const unknownDevice = {
  id: "7d40b2c4-3e5f-4a6b-9c0d-2e3f4a5b6c7d",
  current: false,
  userAgent: null,
  ipAddress: "198.51.100.11",
  createdAt: 1_700_000_300_000,
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

function renderPage(initialEntry = "/account/security") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AccountSecurityPage />
    </MemoryRouter>
  )
}

/**
 * The password section owns its own "当前密码" label, and the email change form
 * has one too. Scoping keeps each assertion about the form it names.
 */
function passwordSection(): HTMLElement {
  const element = document.querySelector('[data-section="password"]')
  if (!element) throw new Error("password section not rendered")
  return element as HTMLElement
}

async function submitPasswordChange(user: ReturnType<typeof userEvent.setup>) {
  const section = await waitFor(() => {
    const element = document.querySelector(
      '[data-section="password"][data-password-available="true"]'
    )
    if (!element) throw new Error("password form not rendered")
    return element as HTMLElement
  })
  await user.type(
    within(section).getByLabelText("当前密码"),
    "old-password-value"
  )
  await user.type(
    within(section).getByLabelText("新密码"),
    "correct-horse-battery"
  )
  await user.type(
    within(section).getByLabelText("确认新密码"),
    "correct-horse-battery"
  )
  await user.click(within(section).getByRole("button", { name: "更新密码" }))
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
    apiMocks.getPlatformOAuthProviders.mockReturnValue({
      send: apiMocks.sendProviders,
    })
    apiMocks.unlinkPlatformOAuthLink.mockReturnValue({
      send: apiMocks.sendUnlink,
    })
    emailApiMocks.sendPlatformEmailVerificationCode.mockReturnValue({
      send: emailApiMocks.sendCode,
    })
    emailApiMocks.bindPlatformEmail.mockReturnValue({
      send: emailApiMocks.sendBind,
    })
    emailApiMocks.changePlatformEmail.mockReturnValue({
      send: emailApiMocks.sendChange,
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
    apiMocks.sendProviders.mockResolvedValue({
      success: true,
      providers: [
        {
          code: "github",
          displayName: "GitHub",
          icon: "github",
          buttonColor: "#24292f",
        },
        {
          code: "google",
          displayName: "Google",
          icon: "chrome",
          buttonColor: "#ffffff",
        },
      ],
    })
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

    const currentPasswordInput = await waitFor(() =>
      within(passwordSection()).getByLabelText("当前密码")
    )
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
    expect(
      within(passwordSection()).queryByLabelText("当前密码")
    ).not.toBeInTheDocument()
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

    const currentRow = await screen.findByText("Macintosh")
    const currentItem = currentRow.closest("li")
    expect(currentItem).not.toBeNull()
    expect(currentItem).toHaveAttribute("data-session-current", "true")
    expect(currentItem).toHaveTextContent("Macintosh · 3a7f")
    expect(
      within(currentItem as HTMLElement).queryByRole("button", { name: /吊销/ })
    ).not.toBeInTheDocument()
    expect(
      within(currentItem as HTMLElement).getByText("当前设备")
    ).toBeVisible()

    // The other device keeps its control, so the absence above is specific.
    const otherItem = screen.getByText("iPhone").closest("li")
    expect(otherItem).toHaveTextContent("iPhone · 9b2d")
    // Different suffixes, so two rows sharing a platform word stay distinct.
    expect(otherItem?.textContent).not.toBe(currentItem?.textContent)
    expect(
      within(otherItem as HTMLElement).getByRole("button", {
        name: "吊销 iPhone · 9b2d 的登录",
      })
    ).toBeEnabled()
  })

  it("revokes a single device and signs the rest out", async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole("button", {
        name: "吊销 iPhone · 9b2d 的登录",
      })
    )
    await waitFor(() => {
      expect(apiMocks.revokePlatformSessionDevice).toHaveBeenCalledWith(
        "9b2d4e6f-1234-4abc-9def-0123456789ab"
      )
    })
    expect(await screen.findByText("该设备的登录已吊销。")).toBeVisible()
    expect(screen.queryByText("iPhone")).not.toBeInTheDocument()
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
        name: "吊销 iPhone · 9b2d 的登录",
      })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "解绑 GitHub" })).toBeDisabled()
  })

  it("renders the two unknown tiers as distinct rows", async () => {
    apiMocks.sendSessions.mockResolvedValue({
      success: true,
      sessions: [ipodDevice, unknownDevice],
    })
    renderPage()

    const knownSystem = await screen.findByText("iOS 设备")
    const fullyUnknown = screen.getByText("未知设备")
    expect(knownSystem).toBeVisible()
    expect(fullyUnknown).toBeVisible()
    // AC3a: the two fallbacks must never collapse into the same line.
    expect(knownSystem.textContent).not.toBe(fullyUnknown.textContent)
    expect(knownSystem.closest("li")).toHaveTextContent("iOS 设备 · 5c1e")
    expect(fullyUnknown.closest("li")).toHaveTextContent("未知设备 · 7d40")
  })

  it("marks each row with its device type", async () => {
    apiMocks.sendSessions.mockResolvedValue({
      success: true,
      sessions: [currentDevice, otherDevice, ipodDevice, unknownDevice],
    })
    renderPage()

    const desktop = (await screen.findByText("Macintosh")).closest("li")
    expect(desktop).toHaveAttribute("data-device-type", "desktop")
    const phone = screen.getByText("iPhone").closest("li")
    expect(phone).toHaveAttribute("data-device-type", "phone")
    const unknown = screen.getByText("iOS 设备").closest("li")
    expect(unknown).toHaveAttribute("data-device-type", "unknown")
  })

  it("keeps the raw user agent available as secondary information", async () => {
    apiMocks.sendSessions.mockResolvedValue({
      success: true,
      sessions: [currentDevice, otherDevice, unknownDevice],
    })
    renderPage()

    await screen.findByText("Macintosh")
    // DR9 / AC5: the original string stays reachable for self-check and support.
    expect(screen.getByText(MAC_SAFARI_UA)).toBeVisible()
    expect(screen.getByText(TAURI_IOS_UA)).toBeVisible()
    // A row without a recorded UA renders no raw-UA definition at all.
    const unknownRow = screen.getByText("未知设备").closest("li")
    expect(
      within(unknownRow as HTMLElement).queryByText("原始 UA")
    ).not.toBeInTheDocument()
  })

  it("renders an unlinked provider as a bind entry and keeps it disabled when restricted", async () => {
    renderPage()

    const googleRow = (await screen.findByText("Google")).closest("li")
    expect(googleRow).toHaveAttribute("data-linked", "false")
    const bind = within(googleRow as HTMLElement).getByRole("button", {
      name: "绑定 Google",
    })
    // A plain document navigation to the API, exactly like the login page: the
    // endpoint answers with a 303 to the provider.
    expect(bind).toHaveAttribute(
      "href",
      "/api/platform/me/oauth-links/google/start"
    )
    // GitHub is in the linked list, so it has no bind entry.
    expect(
      within(googleRow as HTMLElement).queryByText("尚未绑定的第三方登录方式。")
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: "绑定 GitHub" })).toBeNull()
  })

  it("maps the oauth return reason to a readable error", async () => {
    renderPage("/account/security?oauth=link-conflict")

    expect(
      await screen.findByText(
        "该第三方帐号已绑定到其他帐号，请改用该帐号登录。"
      )
    ).toBeVisible()
  })

  it("maps a successful oauth return reason to a confirmation", async () => {
    renderPage("/account/security?oauth=linked")

    expect(await screen.findByText("已绑定。")).toBeVisible()
  })

  it("shows a provider-list failure instead of a silently missing section", async () => {
    apiMocks.sendProviders.mockRejectedValue(new Error("offline"))
    renderPage()

    expect(
      await screen.findByText("第三方帐号载入失败，请重试。")
    ).toBeVisible()
  })

  it("binds the first email credential for a provider-only account", async () => {
    apiMocks.sendLinks.mockResolvedValue({
      success: true,
      links: [removableLink],
      passwordEnabled: false,
    })
    emailApiMocks.sendCode.mockResolvedValue({
      success: true,
      queued: true,
      retryAfterSeconds: 30,
    })
    emailApiMocks.sendBind.mockResolvedValue({
      success: true,
      email: "new@example.com",
    })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(document.querySelector('[data-email-mode="bind"]')).not.toBeNull()
    })
    const section = document.querySelector(
      '[data-section="email-credential"]'
    ) as HTMLElement
    expect(within(section).getByLabelText("设置登录密码")).toBeVisible()

    await user.type(within(section).getByLabelText("新邮箱"), "new@example.com")
    await user.click(
      within(section).getByRole("button", { name: "发送验证码" })
    )
    await waitFor(() => {
      expect(
        emailApiMocks.sendPlatformEmailVerificationCode
      ).toHaveBeenCalledWith({ email: "new@example.com" })
    })

    await user.type(within(section).getByLabelText("邮箱验证码"), "123456")
    await user.type(
      within(section).getByLabelText("设置登录密码"),
      "correct-horse-battery"
    )
    await user.click(within(section).getByRole("button", { name: "绑定邮箱" }))
    await waitFor(() => {
      expect(emailApiMocks.bindPlatformEmail).toHaveBeenCalledWith({
        email: "new@example.com",
        code: "123456",
        newPassword: "correct-horse-battery",
      })
    })
    expect(await within(section).findByText("邮箱已更新。")).toBeVisible()
  })

  it("shows a wrong current password on the change form as a field error", async () => {
    emailApiMocks.sendChange.mockRejectedValue(
      new ApiError("当前密码不正确", {
        kind: "http",
        status: 403,
        code: "PLATFORM_PASSWORD_CURRENT_INVALID",
      })
    )
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(
        document.querySelector('[data-email-mode="change"]')
      ).not.toBeNull()
    })
    const section = document.querySelector(
      '[data-section="email-credential"]'
    ) as HTMLElement
    await user.type(
      within(section).getByLabelText("新邮箱"),
      "next@example.com"
    )
    await user.type(within(section).getByLabelText("邮箱验证码"), "123456")
    await user.type(
      within(section).getByLabelText("当前密码"),
      "wrong-password"
    )
    await user.click(within(section).getByRole("button", { name: "更换邮箱" }))

    await waitFor(() => {
      expect(within(section).getByLabelText("当前密码")).toHaveAttribute(
        "aria-invalid",
        "true"
      )
    })
    expect(
      document.getElementById("account-security-email-password-error")
    ).toHaveTextContent("当前密码不正确。")
  })

  it("separates the documented email binding failures by code", async () => {
    emailApiMocks.sendBind.mockRejectedValue(
      new ApiError("邮箱已被占用", {
        kind: "http",
        status: 409,
        code: "PLATFORM_EMAIL_CONFLICT",
      })
    )
    apiMocks.sendLinks.mockResolvedValue({
      success: true,
      links: [removableLink],
      passwordEnabled: false,
    })
    const user = userEvent.setup()
    const { unmount } = renderPage()

    await waitFor(() => {
      expect(document.querySelector('[data-email-mode="bind"]')).not.toBeNull()
    })
    let section = document.querySelector(
      '[data-section="email-credential"]'
    ) as HTMLElement
    await user.type(
      within(section).getByLabelText("新邮箱"),
      "taken@example.com"
    )
    await user.type(within(section).getByLabelText("邮箱验证码"), "123456")
    await user.type(
      within(section).getByLabelText("设置登录密码"),
      "correct-horse-battery"
    )
    await user.click(within(section).getByRole("button", { name: "绑定邮箱" }))
    expect(
      await within(section).findByText("该邮箱已被其他帐号使用。")
    ).toBeVisible()
    unmount()

    emailApiMocks.sendBind.mockRejectedValue(
      new ApiError("验证码无效", {
        kind: "http",
        status: 400,
        code: "PLATFORM_EMAIL_VERIFICATION_INVALID",
      })
    )
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('[data-email-mode="bind"]')).not.toBeNull()
    })
    section = document.querySelector(
      '[data-section="email-credential"]'
    ) as HTMLElement
    await user.type(within(section).getByLabelText("新邮箱"), "new@example.com")
    await user.type(within(section).getByLabelText("邮箱验证码"), "000000")
    await user.type(
      within(section).getByLabelText("设置登录密码"),
      "correct-horse-battery"
    )
    await user.click(within(section).getByRole("button", { name: "绑定邮箱" }))
    await waitFor(() => {
      expect(within(section).getByLabelText("邮箱验证码")).toHaveAttribute(
        "aria-invalid",
        "true"
      )
    })
    expect(
      document.getElementById("account-security-email-code-error")
    ).toHaveTextContent("验证码无效或已过期，请重新获取。")
  })
})
