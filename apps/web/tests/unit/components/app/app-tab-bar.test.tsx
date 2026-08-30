import { render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppTabBar } from "~/components/app/app-tab-bar"
import { i18n } from "~/i18n/config"

const nativeMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  destroy: vi.fn(),
  shouldAttempt: vi.fn(() => false),
  update: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("~/lib/native-glass", () => ({
  configureNativeGlass: nativeMocks.configure,
  destroyNativeGlass: nativeMocks.destroy,
  nativeTabRoute: (event: Event) =>
    event instanceof CustomEvent && typeof event.detail?.route === "string"
      ? event.detail.route
      : null,
  NATIVE_TAB_SELECT_EVENT: "ims:native-tab-select",
  shouldAttemptNativeGlass: nativeMocks.shouldAttempt,
  updateNativeGlass: nativeMocks.update,
}))

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderTabBar(initialEntry = "/") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppTabBar />
        <LocationProbe />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe("AppTabBar platform material", () => {
  beforeEach(() => {
    nativeMocks.configure.mockReset()
    nativeMocks.configure.mockResolvedValue({ supported: false })
    nativeMocks.destroy.mockReset()
    nativeMocks.destroy.mockResolvedValue(undefined)
    nativeMocks.shouldAttempt.mockReset()
    nativeMocks.shouldAttempt.mockReturnValue(false)
    nativeMocks.update.mockReset()
    nativeMocks.update.mockResolvedValue({ supported: true })
  })

  it("keeps the Web fallback without pointer-tracked white sheen", () => {
    const { container } = renderTabBar()

    const fallback = container.querySelector<HTMLElement>(
      "[data-glass-fallback]"
    )
    expect(fallback).toBeInTheDocument()
    expect(fallback).not.toHaveClass("glass-sheen")
    expect(fallback).not.toHaveAttribute("data-glass-interactive")
    expect(nativeMocks.configure).not.toHaveBeenCalled()
  })

  it("hides the fallback only after native glass installs", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar()

    expect(screen.getByRole("navigation")).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    })
    const [configuredOptions] = nativeMocks.configure.mock.calls[0]
    expect(
      configuredOptions.items.map(
        (item: { lucideIcon: string }) => item.lucideIcon
      )
    ).toEqual([
      "house",
      "calendar-days",
      "book-open-text",
      "users",
      "circle-user",
    ])

    window.dispatchEvent(
      new CustomEvent("ims:native-tab-select", {
        detail: { route: "/events" },
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/events")
    })
    expect(nativeMocks.update).toHaveBeenLastCalledWith({
      dark: false,
      selectedIndex: 1,
    })
  })

  it("retains the fallback when the native API reports unsupported", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({
      supported: false,
      reason: "requires-ios-26",
    })
    renderTabBar("/events")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalled()
    })
    expect(screen.getByRole("navigation")).toBeVisible()
    expect(nativeMocks.update).not.toHaveBeenCalled()
  })

  it("does not reselect the home tab for non-tab routes", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar("/works")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalled()
    })
    expect(nativeMocks.update).not.toHaveBeenCalled()
  })
})
