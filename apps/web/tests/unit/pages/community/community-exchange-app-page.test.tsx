import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CommunityExchangePage from "~/pages/community/exchange/community-exchange-page"

const apiMocks = vi.hoisted(() => ({
  getFudabaSeries: vi.fn(),
  getFudabaOfficePage: vi.fn(),
  getFudabaCardPage: vi.fn(),
  sendSeries: vi.fn(),
  sendOffices: vi.fn(),
  sendCards: vi.fn(),
}))

const glassMocks = vi.hoisted(() => ({
  registrations: [] as Array<{ id: string; icon: string; label: string }>,
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

// The native bridge is the only path that draws real Liquid Glass on iOS 26, so
// the page has to keep handing the toolbar refresh control to it.
vi.mock("~/lib/native-glass-controls", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/lib/native-glass-controls")>()
  return {
    ...actual,
    useNativeGlassControl: (
      ...args: Parameters<typeof actual.useNativeGlassControl>
    ) => {
      glassMocks.registrations.push({
        id: args[0],
        icon: args[1].icon,
        label: args[1].label,
      })
      return actual.useNativeGlassControl(...args)
    },
  }
})

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaSeries: apiMocks.getFudabaSeries,
    getFudabaOfficePage: apiMocks.getFudabaOfficePage,
    getFudabaCardPage: apiMocks.getFudabaCardPage,
  }
})

vi.mock("~/pages/community/exchange/community-exchange-map-section", () => ({
  CommunityExchangeMapSection: () => <div>模拟地图内容</div>,
}))

vi.mock(
  "~/pages/community/exchange/components/exchange-discovery-rail",
  () => ({ ExchangeDiscoveryRail: () => null })
)

vi.mock(
  "~/pages/community/exchange/components/exchange-mobile-navigation",
  () => ({ ExchangeMobileNavigation: () => null })
)

describe("CommunityExchangePage app map toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    glassMocks.registrations.length = 0
    apiMocks.getFudabaSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.getFudabaOfficePage.mockReturnValue({ send: apiMocks.sendOffices })
    apiMocks.getFudabaCardPage.mockReturnValue({ send: apiMocks.sendCards })
    apiMocks.sendSeries.mockResolvedValue({ items: [] })
    apiMocks.sendOffices.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
    apiMocks.sendCards.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
  })

  it("keeps only the refresh control above the packaged app map", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/community/exchange"]}>
        <CommunityExchangePage />
      </MemoryRouter>
    )

    const toolbar = await screen.findByRole("region", { name: "地图工具" })
    const refresh = within(toolbar).getByRole("button", { name: "刷新交换区" })

    expect(document.querySelector("main")).toHaveClass(
      "exchange-map-app-viewport"
    )
    expect(toolbar).toHaveClass("top-[calc(env(safe-area-inset-top)+0.75rem)]")
    expect(toolbar).not.toHaveTextContent("名片交换事务所")
    expect(refresh).toHaveClass(
      "exchange-map-app-control",
      "size-10",
      "rounded-full"
    )

    await user.click(refresh)
    await waitFor(() => {
      expect(apiMocks.sendSeries).toHaveBeenCalledTimes(2)
    })
  })

  it("hands the map toolbar refresh control to the native glass bridge", async () => {
    render(
      <MemoryRouter initialEntries={["/community/exchange"]}>
        <CommunityExchangePage />
      </MemoryRouter>
    )

    const refresh = await screen.findByRole("button", { name: "刷新交换区" })

    // `data-native-glass-control` is the hook `app.css` uses to hide the DOM twin
    // once the overlay reports `supported: true`, so the Web and UIKit copies can
    // never be visible at the same time.
    expect(refresh).toHaveAttribute("data-native-glass-control", "refresh")
    expect(glassMocks.registrations).toContainEqual({
      id: "refresh",
      icon: "refresh-cw",
      label: "刷新交换区",
    })
  })
})
