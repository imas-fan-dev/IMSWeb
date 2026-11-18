import { fireEvent, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardQuickExchange } from "~/lib/api"
import { makeNamecard } from "@/mocks/data/namecards"
import QuickSharePage from "~/pages/exchange/quick-share-page"
import { renderPage } from "@/tests/unit/support/harness"

const HANDLE = "haruka"

const apiMocks = vi.hoisted(() => ({
  getQuickExchangePage: vi.fn(),
  send: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getQuickExchangePage: apiMocks.getQuickExchangePage,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: () => ({ handle: HANDLE }),
}))

function session(status: "anonymous" | "authenticated") {
  return {
    status,
    session: status === "authenticated" ? { account: { id: "acct-1" } } : null,
    error: null,
    acceptSession: vi.fn(),
    reload: vi.fn(),
    logout: vi.fn(),
  }
}

function quickShare(
  overrides: Partial<NamecardQuickExchange> = {}
): NamecardQuickExchange {
  return {
    handle: HANDLE,
    accountId: "acct-2",
    uid: 4242,
    displayName: "春香P",
    cards: [makeNamecard({ id: 11, cardNumber: 101 })],
    targetMissingCount: 0,
    ...overrides,
  }
}

function renderShare() {
  return renderPage(<QuickSharePage />, { route: `/exchange/${HANDLE}` })
}

beforeEach(() => {
  sessionMocks.useOptionalPlatformSession.mockReturnValue(session("anonymous"))
  apiMocks.getQuickExchangePage.mockReturnValue({ send: apiMocks.send })
})

describe("QuickSharePage", () => {
  it("previews the listed cards and links the handle back to the profile", async () => {
    apiMocks.send.mockResolvedValue(
      quickShare({
        cards: [
          makeNamecard({ id: 11, cardNumber: 101 }),
          makeNamecard({ id: 12, cardNumber: 202 }),
        ],
      })
    )
    renderShare()

    expect(await screen.findByRole("link", { name: "春香P" })).toHaveAttribute(
      "href",
      `/user/${HANDLE}`
    )
    expect(screen.getByText("向你分享了 2 张名片")).toBeTruthy()
    expect(screen.getByRole("img", { name: "制作人名片 101 正面" })).toBeTruthy()
    expect(screen.getByText("1/2")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "交换功能即将开放" })
    ).toBeDisabled()
    expect(screen.getByText("登录后才能交换")).toBeTruthy()
    expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute(
      "href",
      `/account/login?returnTo=${encodeURIComponent(`/exchange/${HANDLE}`)}`
    )
  })

  it("only disables the exchange pitch when every card is already owned", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(
      quickShare({
        cards: [
          makeNamecard({ id: 11, cardNumber: 101, collected: true }),
          makeNamecard({ id: 12, cardNumber: 202, collected: true }),
        ],
      })
    )
    renderShare()

    expect(await screen.findByText("你已经拥有这些名片")).toBeTruthy()
    // 轨道首尾有克隆格，所以按「当前这一格」断言角标，而不是全页数个数。
    const activeBadges = () =>
      within(document.querySelector('[data-active="true"]') as HTMLElement)
        .queryAllByText("已拥有")
        .length
    expect(activeBadges()).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: "下一张" }))
    expect(activeBadges()).toBe(1)
    expect(screen.getByText("2/2")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "去登录" })).toBeNull()
  })

  it("keeps the upcoming copy and badges only the cards the visitor holds", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(
      quickShare({
        cards: [
          makeNamecard({ id: 11, cardNumber: 101, collected: true }),
          makeNamecard({ id: 12, cardNumber: 202 }),
        ],
      })
    )
    renderShare()

    // 部分已拥有：只有那张卡带角标，按钮与状态行文案照旧（按钮本来就 disabled）。
    expect(await screen.findByText("已拥有")).toBeTruthy()
    expect(screen.getAllByText("已拥有")).toHaveLength(1)
    expect(screen.getAllByText("交换功能即将开放")).toHaveLength(2)
    expect(
      screen.getByRole("button", { name: "交换功能即将开放" })
    ).toBeDisabled()
  })

  it("explains an empty quick list and renders no controls", async () => {
    apiMocks.send.mockResolvedValue(quickShare({ cards: [] }))
    renderShare()

    expect(
      await screen.findByText("这位制作人还没有可交换的名片。")
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "下一张" })).toBeNull()
  })

  it("renders the missing-producer copy when nobody owns the handle", async () => {
    apiMocks.send.mockRejectedValue(new Error("HTTP 404"))
    renderShare()

    expect(await screen.findByText("找不到这位制作人")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "交换功能即将开放" })
    ).toBeNull()
  })
})
