import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { ExchangeMobileNavigation } from "~/pages/community/exchange/components/exchange-mobile-navigation"

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

function renderNavigation(
  props: Partial<React.ComponentProps<typeof ExchangeMobileNavigation>> = {}
) {
  const callbacks = {
    onShowMap: vi.fn(),
    onOpenFilter: vi.fn(),
    onOpenOffices: vi.fn(),
    onOpenCards: vi.fn(),
  }

  render(
    <MemoryRouter>
      <ExchangeMobileNavigation
        filterActive={false}
        filterApplied={false}
        officesActive={false}
        cardsActive={false}
        {...callbacks}
        {...props}
      />
    </MemoryRouter>
  )

  return callbacks
}

describe("ExchangeMobileNavigation app target", () => {
  it("uses a collapsed side navigation instead of the bottom map bar", async () => {
    const user = userEvent.setup()
    const callbacks = renderNavigation()

    const toggle = screen.getByRole("button", {
      name: "展开交换地图导航",
    })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle.parentElement).toHaveClass("top-16")
    expect(
      screen.queryByRole("navigation", { name: "交换地图导航" })
    ).not.toBeInTheDocument()

    await user.click(toggle)

    const navigation = screen.getByRole("navigation", {
      name: "交换地图导航",
    })
    expect(navigation).toHaveClass("right-[calc(100%+0.5rem)]")
    expect(screen.getByRole("button", { name: "地图" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(
      screen.getByRole("link", { name: "管理我的交换账号" })
    ).toHaveAttribute("href", "/community/exchange/me")

    await user.click(screen.getByRole("button", { name: "打开筛选" }))

    expect(callbacks.onOpenFilter).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole("navigation", { name: "交换地图导航" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "展开交换地图导航" })
    ).toHaveAttribute("aria-expanded", "false")
  })

  it("retains the active state and applied-filter cue in the side navigation", async () => {
    const user = userEvent.setup()
    renderNavigation({ filterActive: true, filterApplied: true })

    await user.click(screen.getByRole("button", { name: "展开交换地图导航" }))

    expect(
      screen.getByRole("button", { name: "打开筛选，已应用筛选" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "地图" })).not.toHaveAttribute(
      "aria-current"
    )
  })
})
