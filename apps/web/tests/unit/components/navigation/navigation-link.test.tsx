import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { MemoryRouter, useLocation } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  appTarget: false,
  decision: { kind: "router", to: "/works" } as
    | { kind: "router"; to: string }
    | { kind: "document"; href: string }
    | { kind: "system"; href: string }
    | { kind: "unavailable" },
  openSystemUrl: vi.fn(async () => undefined),
  shouldUseSystemOpener: vi.fn(() => false),
  toastError: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return mocks.appTarget
  },
}))
vi.mock("~/lib/navigation/resolve-navigation", () => ({
  resolveNavigation: vi.fn(() => mocks.decision),
}))
vi.mock("~/lib/navigation/system-opener", () => ({
  openSystemUrl: mocks.openSystemUrl,
  shouldUseSystemOpener: mocks.shouldUseSystemOpener,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))

import {
  NavigationBoundary,
  NavigationLink,
} from "~/components/navigation/navigation-link"

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

afterEach(() => {
  mocks.appTarget = false
  mocks.decision = { kind: "router", to: "/works" }
  mocks.openSystemUrl.mockReset().mockResolvedValue(undefined)
  mocks.shouldUseSystemOpener.mockReset().mockReturnValue(false)
  mocks.toastError.mockClear()
})

describe("NavigationLink", () => {
  it("delegates application routes to React Router and forwards refs", () => {
    const ref = createRef<HTMLAnchorElement>()
    render(
      <MemoryRouter>
        <NavigationLink ref={ref} to="/works">
          作品
        </NavigationLink>
      </MemoryRouter>
    )

    expect(screen.getByRole("link", { name: "作品" })).toHaveAttribute(
      "href",
      "/works"
    )
    expect(ref.current).toBe(screen.getByRole("link", { name: "作品" }))
  })

  it("renders document links without React Router interception", () => {
    mocks.decision = { kind: "document", href: "https://example.test/page" }
    render(
      <NavigationLink href="https://example.test/page" target="_blank">
        外链
      </NavigationLink>
    )

    expect(screen.getByRole("link", { name: "外链" })).toHaveAttribute(
      "href",
      "https://example.test/page"
    )
    expect(screen.getByRole("link", { name: "外链" })).toHaveAttribute(
      "target",
      "_blank"
    )
  })

  it("routes root-relative href links through React Router", () => {
    mocks.decision = { kind: "router", to: "/events" }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavigationLink href="/events">活动</NavigationLink>
        <LocationProbe />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole("link", { name: "活动" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/events")
  })

  it("uses the Tauri opener for system decisions", async () => {
    mocks.decision = { kind: "system", href: "https://example.test/page" }
    mocks.shouldUseSystemOpener.mockReturnValue(true)
    render(
      <NavigationLink href="https://example.test/page">外链</NavigationLink>
    )

    fireEvent.click(screen.getByRole("link", { name: "外链" }))

    await waitFor(() =>
      expect(mocks.openSystemUrl).toHaveBeenCalledWith(
        "https://example.test/page"
      )
    )
  })

  it("reports opener failures centrally", async () => {
    mocks.decision = { kind: "system", href: "https://example.test/page" }
    mocks.shouldUseSystemOpener.mockReturnValue(true)
    mocks.openSystemUrl.mockRejectedValueOnce(new Error("unavailable"))
    render(
      <NavigationLink href="https://example.test/page">外链</NavigationLink>
    )

    fireEvent.click(screen.getByRole("link", { name: "外链" }))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "无法打开链接，请检查系统浏览器设置后重试。"
      )
    )
  })

  it("hides Web-only navigation and its surrounding boundary in App", () => {
    mocks.appTarget = true
    const { rerender } = render(
      <NavigationLink availability="web" to="/wiki/classic">
        经典视图
      </NavigationLink>
    )

    expect(screen.queryByText("经典视图")).not.toBeInTheDocument()

    rerender(
      <NavigationBoundary availability="web">
        <div>Web OAuth</div>
      </NavigationBoundary>
    )
    expect(screen.queryByText("Web OAuth")).not.toBeInTheDocument()
  })
})
