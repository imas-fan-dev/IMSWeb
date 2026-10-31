import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { WallInsightsPanel } from "~/pages/community/components/wall-insights-panel"

const insights = {
  ownerless: 10,
  ownerlessMissingSeries: 9,
  claimed: 2,
  claimsPending: 1,
  supplemented: 3,
  supplementsPending: 2,
  contributors: [
    { accountId: "acct-1", displayName: "春香P", points: 5, cards: 3 },
    { accountId: "acct-2", displayName: "千早P", points: 2, cards: 1 },
  ],
  viewer: { accountId: "acct-2", displayName: "千早P", points: 2, rank: 2 },
}

afterEach(() => {
  installFetchMock()
  window.localStorage.clear()
})

describe("WallInsightsPanel", () => {
  it("shows both progress bars, the leaderboard and the viewer's rank", async () => {
    installFetchMock().mockResolvedValueOnce(
      Response.json(insights, { status: 200 })
    )
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)

    expect(await screen.findByText(/2 \/ 12（17%）/)).toBeTruthy()
    expect(screen.getByText(/待审 1/)).toBeTruthy()
    expect(
      screen.getByRole("progressbar", { name: "认领进度" })
    ).toHaveAttribute("aria-valuenow", "17")
    expect(
      screen.getByRole("progressbar", { name: "信息补充进度" })
    ).toHaveAttribute("aria-valuenow", "25")
    expect(screen.getByText("春香P")).toBeTruthy()
    expect(screen.getByText("5 点 · 3 张")).toBeTruthy()
    expect(screen.getByText("你：2 点 · 第 2 名")).toBeTruthy()
  })

  it("collapses, remembers the choice and picks a random card", async () => {
    installFetchMock()
      .mockResolvedValueOnce(Response.json(insights, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ cardNumber: 789 }, { status: 200 }))
    const onPickCard = vi.fn()
    renderPage(<WallInsightsPanel onPickCard={onPickCard} />)

    await screen.findByText("贡献榜")
    await userEvent.setup().click(screen.getByRole("button", { name: "收起" }))
    expect(screen.queryByText("贡献榜")).toBeNull()
    expect(window.localStorage.getItem("imsweb.wall-insights.collapsed")).toBe(
      "1"
    )

    await userEvent.setup().click(screen.getByRole("button", { name: "展开" }))
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "随机补充一张" }))
    await waitFor(() => expect(onPickCard).toHaveBeenCalledWith(789))
  })

  it("reports an empty pool instead of opening a card", async () => {
    installFetchMock()
      .mockResolvedValueOnce(Response.json(insights, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json(
          { success: false, code: "FUDABA_NO_OWNERLESS_CARD" },
          { status: 404 }
        )
      )
    const onPickCard = vi.fn()
    renderPage(<WallInsightsPanel onPickCard={onPickCard} />)

    await screen.findByText("贡献榜")
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "随机补充一张" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "随机补充一张" })
      ).toBeEnabled()
    )
    expect(onPickCard).not.toHaveBeenCalled()
  })
})
