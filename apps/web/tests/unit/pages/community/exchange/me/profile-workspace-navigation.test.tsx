import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"

const avatarMocks = vi.hoisted(() => ({
  usePlatformAvatarSource: vi.fn(),
}))

vi.mock("~/components/platform/use-platform-avatar-source", () => ({
  usePlatformAvatarSource: avatarMocks.usePlatformAvatarSource,
}))

import {
  ProfileWorkspaceNavigation,
  isProfileWorkspaceSection,
} from "~/pages/community/exchange/me/profile-workspace-navigation"

const profile = {
  displayName: "测试制作人",
  avatarUrl: null,
  homeCity: "上海",
  bio: "",
  updatedAt: 1,
}

function renderNavigation(sectionBasePath?: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ProfileWorkspaceNavigation
          profile={profile}
          accountId="platform-1"
          cardCount={2}
          activeSection="profile"
          sectionBasePath={sectionBasePath}
        />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe("ProfileWorkspaceNavigation", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    avatarMocks.usePlatformAvatarSource.mockImplementation(
      (avatarUrl: string | null | undefined) => avatarUrl
    )
    await i18n.changeLanguage("zh-CN")
  })

  it("keeps query-string links and an account-keyed avatar for the Web workspace", () => {
    renderNavigation()

    expect(avatarMocks.usePlatformAvatarSource).toHaveBeenCalledWith(
      profile.avatarUrl,
      "platform-1"
    )
    expect(screen.getByRole("link", { name: "个人资料" })).toHaveAttribute(
      "href",
      "/community/exchange/me"
    )
    expect(screen.getByRole("link", { name: "交换名片" })).toHaveAttribute(
      "href",
      "/community/exchange/me?section=cards"
    )
  })

  it("leaves App section navigation to the account root and back stack", () => {
    renderNavigation("/account/me")

    expect(
      screen.queryByRole("navigation", { name: "个人档案菜单" })
    ).not.toBeInTheDocument()
  })

  it("accepts only the five supported section identifiers", () => {
    expect(
      ["profile", "cards", "favorites", "offices", "claims"].every(
        isProfileWorkspaceSection
      )
    ).toBe(true)
    expect(isProfileWorkspaceSection("security")).toBe(false)
    expect(isProfileWorkspaceSection(null)).toBe(false)
  })
})
