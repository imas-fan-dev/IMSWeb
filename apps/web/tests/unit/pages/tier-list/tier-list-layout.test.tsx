import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ appTarget: false }))

vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return mocks.appTarget
  },
}))

import type { TierListActions } from "~/pages/tier-list/hooks/use-tier-list-state"
import { createTierListDocument } from "~/pages/tier-list/tier-list-model"
import { TierListToolbar } from "~/pages/tier-list/components/toolbar"
import { UnrankedPool } from "~/pages/tier-list/components/unranked-pool"

const actions = {
  setTitle: vi.fn(),
  addTier: vi.fn(),
  clearAll: vi.fn(),
  removeItem: vi.fn(),
} as unknown as TierListActions

afterEach(() => {
  mocks.appTarget = false
  cleanup()
})

describe("Tier List mobile layout", () => {
  it("keeps the App unranked pool above the tab bar", () => {
    mocks.appTarget = true

    render(<UnrankedPool itemIds={[]} items={{}} actions={actions} />)

    const pool = screen.getByTestId("unranked-pool")
    expect(pool).toHaveClass("sticky", "bottom-(--app-bottom-clearance)")
    expect(pool).not.toHaveClass("bottom-2")
    expect(screen.getByText(/暂无图片/)).toBeVisible()
  })

  it("keeps the Web sticky offset unchanged", () => {
    render(<UnrankedPool itemIds={[]} items={{}} actions={actions} />)

    const pool = screen.getByTestId("unranked-pool")
    expect(pool).toHaveClass("sticky", "bottom-2")
    expect(pool).not.toHaveClass("bottom-(--app-bottom-clearance)")
  })

  it("uses a fixed two-row toolbar before the small breakpoint", () => {
    render(
      <TierListToolbar
        document={createTierListDocument()}
        actions={actions}
        onOpenImport={vi.fn()}
      />
    )

    expect(screen.getByTestId("tier-list-toolbar")).toHaveClass(
      "grid",
      "grid-cols-1",
      "sm:flex"
    )
    expect(screen.getByLabelText("排行榜标题")).toHaveClass("w-full", "sm:w-72")
    expect(screen.getByTestId("tier-list-toolbar-actions")).toHaveClass(
      "grid",
      "grid-cols-4",
      "sm:flex"
    )
    expect(screen.getByRole("button", { name: "添加层级" })).toHaveClass(
      "w-full",
      "sm:w-auto"
    )
    expect(screen.getByRole("button", { name: "导入图片" })).toHaveClass(
      "w-full",
      "sm:w-auto"
    )
    expect(screen.getByRole("button", { name: "导出图片" })).toHaveClass(
      "w-full",
      "sm:w-auto"
    )
    expect(screen.getByRole("button", { name: "清空排行榜" })).toHaveClass(
      "w-full",
      "sm:w-auto"
    )
  })
})
