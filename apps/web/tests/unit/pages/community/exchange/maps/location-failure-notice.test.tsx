import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { suppressNativeTabBar } from "~/lib/native-tab-bar-suppression"
import { ExchangeMapActions } from "~/pages/community/exchange/components/exchange-map-actions"
import { LocationFailureNotice } from "~/pages/community/exchange/maps/location-failure-notice"

const base = {
  size: { width: 390, height: 844 },
  onRetry: vi.fn(),
  onDismiss: vi.fn(),
}

it("offers independent retry and dismissal with a polite, cause-specific explanation", async () => {
  const user = userEvent.setup()
  render(<LocationFailureNotice {...base} kind="permission-denied" />)
  expect(screen.getByRole("status")).toHaveTextContent("未获得位置权限")
  await user.click(screen.getByRole("button", { name: "重试定位" }))
  expect(base.onRetry).toHaveBeenCalledOnce()
  expect(base.onDismiss).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "关闭定位提示" }))
  expect(base.onDismiss).toHaveBeenCalledOnce()
})

it("gives a useful search/manual fallback without retrying unsupported positioning", () => {
  render(<LocationFailureNotice {...base} kind="unsupported" />)
  expect(
    screen.queryByRole("button", { name: "重试定位" })
  ).not.toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("搜索地点")
  expect(screen.getByRole("button", { name: "关闭定位提示" })).toBeVisible()
})

it("defers visible feedback during map help and restores it afterward", () => {
  const actions = { startCreate: vi.fn(), showHelp: vi.fn() }
  const view = render(
    <ExchangeMapActions value={{ ...actions, tourTarget: "map" }}>
      <LocationFailureNotice {...base} kind="unavailable" />
    </ExchangeMapActions>
  )
  expect(
    screen.queryByRole("button", { name: "重试定位" })
  ).not.toBeInTheDocument()
  view.rerender(
    <ExchangeMapActions value={{ ...actions, tourTarget: null }}>
      <LocationFailureNotice {...base} kind="unavailable" />
    </ExchangeMapActions>
  )
  expect(screen.getByRole("button", { name: "重试定位" })).toBeVisible()
})

it("keeps an embedded map's feedback available when its own dialog hides navigation", () => {
  const release = suppressNativeTabBar()
  try {
    render(<LocationFailureNotice {...base} kind="unavailable" />)
    expect(screen.getByRole("button", { name: "重试定位" })).toBeVisible()
  } finally {
    release()
  }
})
