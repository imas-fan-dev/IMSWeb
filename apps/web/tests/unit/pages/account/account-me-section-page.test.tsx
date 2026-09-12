import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Link, MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountMeSectionPage from "~/pages/account/me/account-me-section-page"

const businessMocks = vi.hoisted(() => ({
  mounted: vi.fn(),
}))

vi.mock(
  "~/pages/community/exchange/me/community-exchange-me-page",
  async () => {
    const { useState } = await import("react")
    function MockCommunityExchangeMePage({
      section,
      sectionBasePath,
    }: {
      section: string
      sectionBasePath: string
    }) {
      const [draft, setDraft] = useState(() => {
        businessMocks.mounted()
        return ""
      })
      return (
        <div>
          <p>当前分区：{section}</p>
          <p>路径前缀：{sectionBasePath}</p>
          <label>
            编辑草稿
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
        </div>
      )
    }

    return {
      meta: () => [],
      default: MockCommunityExchangeMePage,
    }
  }
)

function TestRoutes({ initialEntry }: { initialEntry: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Link to="/account/me/cards">切换到交换名片</Link>
      <Routes>
        <Route path="/account/me" element={<h1>帐号首页</h1>} />
        <Route path="/account/me/:section" element={<AccountMeSectionPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AccountMeSectionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(["profile", "cards", "favorites", "offices", "claims"])(
    "accepts the %s account section",
    (section) => {
      render(<TestRoutes initialEntry={`/account/me/${section}`} />)

      expect(screen.getByText(`当前分区：${section}`)).toBeVisible()
      expect(screen.getByText("路径前缀：/account/me")).toBeVisible()
    }
  )

  it("redirects an unknown section to the account home", async () => {
    render(<TestRoutes initialEntry="/account/me/security" />)

    expect(
      await screen.findByRole("heading", { name: "帐号首页" })
    ).toBeVisible()
    expect(screen.queryByText(/当前分区/)).not.toBeInTheDocument()
    expect(businessMocks.mounted).not.toHaveBeenCalled()
  })

  it("keeps the reused workspace mounted when the section changes", async () => {
    const user = userEvent.setup()
    render(<TestRoutes initialEntry="/account/me/profile" />)

    const draft = screen.getByRole("textbox", { name: "编辑草稿" })
    await user.type(draft, "尚未保存的内容")
    await user.click(screen.getByRole("link", { name: "切换到交换名片" }))

    expect(await screen.findByText("当前分区：cards")).toBeVisible()
    expect(screen.getByRole("textbox", { name: "编辑草稿" })).toHaveValue(
      "尚未保存的内容"
    )
    expect(businessMocks.mounted).toHaveBeenCalledOnce()
  })
})
