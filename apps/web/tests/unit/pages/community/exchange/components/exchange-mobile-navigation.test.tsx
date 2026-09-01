import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { ExchangeMobileNavigation } from "~/pages/community/exchange/components/exchange-mobile-navigation"

vi.mock("~/lib/app-target", () => ({
  APP_FLOATING_CONTROL_OFFSET: "bottom-[var(--app-floating-bottom)]",
  IS_APP_TARGET: true,
}))

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
  it("uses an App-offset map tool cluster instead of a second navigation bar", async () => {
    const user = userEvent.setup()
    const callbacks = renderNavigation()

    const toggle = screen.getByRole("button", {
      name: "展开地图工具",
    })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveClass(
      "exchange-map-app-control",
      "size-10",
      "rounded-lg"
    )
    expect(toggle.parentElement).toHaveClass(
      "bottom-[var(--app-floating-bottom)]"
    )
    expect(toggle.parentElement).not.toHaveClass("md:hidden")
    expect(toggle.parentElement).toHaveClass("lg:hidden")
    const collapsedTools = document.getElementById("exchange-map-tools")
    expect(collapsedTools).toHaveClass(
      "invisible",
      "translate-x-2",
      "scale-95",
      "opacity-0"
    )
    expect(collapsedTools).toHaveAttribute("aria-hidden", "true")
    expect(collapsedTools).toHaveAttribute("inert")
    expect(
      screen.queryByRole("toolbar", { name: "交换地图工具" })
    ).not.toBeInTheDocument()

    await user.click(toggle)

    const tools = screen.getByRole("toolbar", {
      name: "交换地图工具",
    })
    expect(tools).toHaveClass(
      "right-[calc(100%+0.5rem)]",
      "visible",
      "translate-x-0",
      "scale-100",
      "opacity-100"
    )
    expect(tools).toHaveAttribute("aria-hidden", "false")
    expect(tools).not.toHaveAttribute("inert")
    expect(
      within(tools).queryByRole("button", { name: "地图" })
    ).not.toBeInTheDocument()
    expect(
      within(tools).queryByRole("link", { name: "管理我的交换账号" })
    ).not.toBeInTheDocument()
    expect(
      within(tools).getByRole("button", { name: "打开事务所名录" })
    ).toBeVisible()
    expect(
      within(tools).getByRole("button", { name: "打开名片名录" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "打开筛选" }))

    expect(callbacks.onOpenFilter).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole("toolbar", { name: "交换地图工具" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "展开地图工具" })
    ).toHaveAttribute("aria-expanded", "false")
    expect(document.getElementById("exchange-map-tools")).toHaveClass(
      "invisible",
      "opacity-0"
    )
  })

  it("retains the active state and applied-filter cue in the side navigation", async () => {
    const user = userEvent.setup()
    renderNavigation({ filterActive: true, filterApplied: true })

    await user.click(screen.getByRole("button", { name: "展开地图工具" }))

    expect(
      screen.getByRole("button", { name: "打开筛选，已应用筛选" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.queryByRole("button", { name: "地图" })
    ).not.toBeInTheDocument()
  })
})
