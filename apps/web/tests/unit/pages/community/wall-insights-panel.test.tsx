import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { WallInsightsPanel } from "~/pages/community/components/wall-insights-panel"

const insights = {
  guestTotal: 10,
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
  it.each([
    { mobile: true, stored: null },
    { mobile: false, stored: "1" },
  ])(
    "hydrates the server markup before applying collapsed preferences: %j",
    async ({ mobile, stored }) => {
      const browserWindow = window
      const originalMedia = Object.getOwnPropertyDescriptor(
        window,
        "matchMedia"
      )
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
          matches: mobile && query === "(max-width: 640px)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }),
      })
      if (stored !== null)
        window.localStorage.setItem("imsweb.wall-insights.collapsed", stored)
      installFetchMock().mockResolvedValueOnce(Response.json(insights))
      const element = <WallInsightsPanel onPickCard={vi.fn()} />
      let html: string
      vi.stubGlobal("window", undefined)
      try {
        html = renderToString(element)
      } finally {
        vi.stubGlobal("window", browserWindow)
      }
      const container = document.createElement("div")
      // SAFETY: React rendered this local fixture; no external HTML enters the test.
      container.innerHTML = html
      document.body.append(container)
      const recovered = vi.fn()
      let root: ReturnType<typeof hydrateRoot> | undefined
      try {
        await act(async () => {
          root = hydrateRoot(container, element, {
            onRecoverableError: recovered,
          })
        })
        await waitFor(() =>
          expect(
            within(container).getByRole("button", { name: "展开" })
          ).toBeVisible()
        )
        expect(recovered).not.toHaveBeenCalled()
      } finally {
        await act(async () => root?.unmount())
        container.remove()
        if (originalMedia)
          Object.defineProperty(window, "matchMedia", originalMedia)
        else Reflect.deleteProperty(window, "matchMedia")
      }
    }
  )

  it("shows both progress bars, the leaderboard and the viewer's rank", async () => {
    installFetchMock().mockResolvedValueOnce(
      Response.json(insights, { status: 200 })
    )
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)

    expect(await screen.findByText("20%")).toBeTruthy()
    expect(screen.getByText(/待审 1/)).toBeTruthy()
    expect(
      screen.getByRole("progressbar", { name: "认领进度" })
    ).toHaveAttribute("aria-valuenow", "20")
    expect(
      screen.getByRole("progressbar", { name: "信息补充进度" })
    ).toHaveAttribute("aria-valuenow", "30")
    expect(screen.getByText("春香P")).toBeTruthy()
    expect(screen.getByText("参与 3 张名片")).toBeTruthy()
    expect(screen.getByText("我的贡献：2 点 · 第 2 名")).toBeTruthy()
  })

  it("preserves fractional progress instead of rounding a real contribution to zero", async () => {
    installFetchMock().mockResolvedValueOnce(
      Response.json({
        ...insights,
        guestTotal: 831,
        claimed: 1,
        supplemented: 4,
      })
    )
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)
    expect(await screen.findByText("0.1%")).toBeTruthy()
    expect(screen.getByText("0.5%")).toBeTruthy()
    expect(
      screen.getByRole("progressbar", { name: "认领进度" })
    ).toHaveAttribute("aria-valuetext", "已完成 1 张，共 831 张，0.1%")
  })

  it("loads the full leaderboard only when opened and paginates beyond the preview", async () => {
    const contributors = Array.from({ length: 26 }, (_, index) => ({
      accountId: `contributor-${index}`,
      displayName: `制作人 ${index + 1}`,
      points: 26 - index,
      cards: 1,
    }))
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(
        Response.json({ ...insights, contributors: contributors.slice(0, 5) })
      )
      .mockResolvedValueOnce(
        Response.json({
          contributors: contributors.slice(0, 25),
          pageInfo: {
            page: 1,
            pageSize: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: true,
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          contributors: contributors.slice(25),
          pageInfo: {
            page: 2,
            pageSize: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: false,
          },
        })
      )
    const user = userEvent.setup()
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)
    await screen.findByText("制作人 3")
    expect(screen.queryByText("制作人 4")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const trigger = screen.getByRole("button", { name: "完整榜单" })
    await user.click(trigger)
    const dialog = await screen.findByRole("dialog", { name: "名片墙贡献榜" })
    await within(dialog).findByText("制作人 25")
    expect(
      within(dialog).getByRole("button", { name: "上一页" })
    ).toBeDisabled()
    await user.click(within(dialog).getByRole("button", { name: "下一页" }))
    await within(dialog).findByText("制作人 26")
    expect(within(dialog).queryByText("制作人 25")).toBeNull()
    expect(
      within(dialog).getByRole("button", { name: "下一页" })
    ).toBeDisabled()
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("page=2")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("keeps a recoverable page caption when contributors disappear between requests", async () => {
    const contributors = Array.from({ length: 26 }, (_, index) => ({
      accountId: "contributor-" + index,
      displayName: "制作人 " + (index + 1),
      points: 26 - index,
      cards: 1,
    }))
    installFetchMock()
      .mockResolvedValueOnce(Response.json(insights))
      .mockResolvedValueOnce(
        Response.json({
          contributors: contributors.slice(0, 25),
          pageInfo: {
            page: 1,
            pageSize: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: true,
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          contributors: [],
          pageInfo: {
            page: 2,
            pageSize: 25,
            total: 10,
            totalPages: 1,
            hasNextPage: false,
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          contributors: contributors.slice(0, 10),
          pageInfo: {
            page: 1,
            pageSize: 25,
            total: 10,
            totalPages: 1,
            hasNextPage: false,
          },
        })
      )
    const user = userEvent.setup()
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)
    await screen.findByText("春香P")
    await user.click(screen.getByRole("button", { name: "完整榜单" }))
    const dialog = await screen.findByRole("dialog", { name: "名片墙贡献榜" })
    await within(dialog).findByText("制作人 25")
    await user.click(within(dialog).getByRole("button", { name: "下一页" }))
    await within(dialog).findByText("共 10 位 · 第 2 页")
    expect(
      within(dialog).getByText("这一页暂无贡献记录，请返回上一页。")
    ).toBeTruthy()
    expect(
      within(dialog).getByRole("button", { name: "下一页" })
    ).toBeDisabled()
    await user.click(within(dialog).getByRole("button", { name: "上一页" }))
    await within(dialog).findByText("制作人 10")
    expect(within(dialog).getByText("共 10 位 · 1 / 1 页")).toBeTruthy()
  })

  it("allows retrying a failed full-list request and shows an empty result", async () => {
    installFetchMock()
      .mockResolvedValueOnce(Response.json(insights))
      .mockResolvedValueOnce(
        Response.json({ error: "Unavailable" }, { status: 503 })
      )
      .mockResolvedValueOnce(
        Response.json({
          contributors: [],
          pageInfo: {
            page: 1,
            pageSize: 25,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
          },
        })
      )
    const user = userEvent.setup()
    renderPage(<WallInsightsPanel onPickCard={vi.fn()} />)
    await screen.findByText("春香P")
    await user.click(screen.getByRole("button", { name: "完整榜单" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("贡献榜加载失败")
    await user.click(screen.getByRole("button", { name: "重试" }))
    expect(
      await screen.findByText("暂无贡献记录，期待你的第一份贡献。")
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
  })

  it("collapses, remembers the choice and picks a random card", async () => {
    installFetchMock()
      .mockResolvedValueOnce(Response.json(insights, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({ cardNumber: 789 }, { status: 200 })
      )
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
      expect(screen.getByRole("button", { name: "随机补充一张" })).toBeEnabled()
    )
    expect(onPickCard).not.toHaveBeenCalled()
  })
})
