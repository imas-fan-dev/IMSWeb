import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "~/i18n/config"
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
    await i18n.changeLanguage("zh-CN")
  })

  it("keeps query-string links for the Web exchange workspace", () => {
    renderNavigation()

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
