import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LocateMyCards } from "~/pages/community/exchange/locate-my-cards"
import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"

function media(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mobile,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    }))
  )
}
function card(
  id: string,
  pinnedAt: string,
  viewerOwned = true
): FudabaWallLayoutItem {
  return {
    kind: "card",
    id,
    displayName: id,
    viewerOwned,
    preview: null,
    assetVersion: id,
    width: 240,
    height: 160,
    layoutVersion: 1,
    placement: {
      pinnedAt,
      x: 800,
      y: 450,
      rotation: 0,
      zIndex: 1,
      revision: 0,
      updatedAt: pinnedAt,
    },
  }
}
const cards = [
  card("new", "2026-10-03T00:00:00.000Z"),
  card("old-b", "2026-10-01T00:00:00.000Z"),
  card("old-a", "2026-10-01T00:00:00.000Z"),
  card("visitor", "2026-09-01T00:00:00.000Z", false),
]

describe("locating owned wall cards", () => {
  it("cycles oldest first, breaks ties by id and wraps on mobile", async () => {
    media(true)
    const user = userEvent.setup(),
      locate = vi.fn()
    render(<LocateMyCards items={cards} ready onLocate={locate} />)
    for (let index = 0; index < 4; index++)
      await user.click(screen.getByRole("button", { name: /^定位我的名片/ }))
    expect(locate.mock.calls.map(([item]) => item.id)).toEqual([
      "old-a",
      "old-b",
      "new",
      "old-a",
    ])
    expect(
      screen.getByRole("button", { name: "定位我的名片 · 1/3" })
    ).toBeVisible()
  })
  it("offers a desktop chooser and keeps locating disabled until the index is complete", async () => {
    media(false)
    const user = userEvent.setup(),
      locate = vi.fn()
    const view = render(
      <LocateMyCards items={cards} ready={false} onLocate={locate} />
    )
    expect(screen.getByRole("button", { name: "正在准备定位…" })).toBeDisabled()
    view.rerender(<LocateMyCards items={cards} ready onLocate={locate} />)
    await user.click(screen.getByRole("button", { name: "定位我的名片" }))
    await user.click(screen.getByRole("button", { name: /new/ }))
    expect(locate).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }))
    expect(
      screen.queryByRole("button", { name: /visitor/ })
    ).not.toBeInTheDocument()
  })
})
