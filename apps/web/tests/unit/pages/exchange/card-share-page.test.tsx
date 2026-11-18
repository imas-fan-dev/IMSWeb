import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardCardShare } from "~/lib/api"
import { makeCardPage, makeNamecard } from "@/mocks/data/namecards"
import CardSharePage from "~/pages/exchange/card-share-page"
import { renderPage } from "@/tests/unit/support/harness"

const SLUG = "abcdefghijkl"

const apiMocks = vi.hoisted(() => ({
  getCardSharePage: vi.fn(),
  send: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getCardSharePage: apiMocks.getCardSharePage,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: () => ({ slug: SLUG }),
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

function cardShare(overrides: Partial<NamecardCardShare> = {}): NamecardCardShare {
  return {
    state: "available",
    card: makeNamecard({ cardNumber: 101 }),
    owner: {
      accountId: "acct-2",
      uid: 4242,
      pageSlug: "haruka",
      displayName: "春香P",
    },
    targetMissingCount: 0,
    ...overrides,
  }
}

function renderShare() {
  return renderPage(<CardSharePage />, { route: `/exchange/card/${SLUG}` })
}

beforeEach(() => {
  sessionMocks.useOptionalPlatformSession.mockReturnValue(session("anonymous"))
  apiMocks.getCardSharePage.mockReturnValue({ send: apiMocks.send })
})

describe("CardSharePage", () => {
  it("previews every page of the card and offers the disabled exchange button", async () => {
    apiMocks.send.mockResolvedValue(cardShare())
    renderShare()

    // 分享人 + 主页链接（优先公开地址）。
    expect(await screen.findByRole("link", { name: "春香P" })).toHaveAttribute(
      "href",
      "/user/haruka"
    )
    expect(screen.getByText("向你分享了 1 张名片")).toBeTruthy()

    // 正面 + 背面各一页：轮播控件与 1/2 角标都在。
    expect(screen.getByRole("img", { name: "制作人名片 101 正面" })).toBeTruthy()
    expect(screen.getByText("1/2")).toBeTruthy()
    expect(screen.getByRole("button", { name: "下一张" })).toBeTruthy()

    expect(
      screen.getByRole("button", { name: "交换功能即将开放" })
    ).toBeDisabled()
    expect(screen.getByText("登录后才能交换")).toBeTruthy()
  })

  it("sends anonymous visitors back to the share page after login", async () => {
    apiMocks.send.mockResolvedValue(cardShare())
    renderShare()

    expect(await screen.findByRole("link", { name: "去登录" })).toHaveAttribute(
      "href",
      `/account/login?returnTo=${encodeURIComponent(`/exchange/card/${SLUG}`)}`
    )
  })

  it("marks the card the signed-in visitor already holds", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(
      cardShare({ card: makeNamecard({ cardNumber: 101, collected: true }) })
    )
    renderShare()

    expect(await screen.findByText("你已经拥有这张名片")).toBeTruthy()
    // 轨道首尾有克隆格，所以按「当前这一格」断言角标，而不是全页数个数。
    expect(
      within(document.querySelector('[data-active="true"]') as HTMLElement)
        .queryAllByText("已拥有")
        .length
    ).toBe(1)
    expect(screen.queryByRole("link", { name: "去登录" })).toBeNull()
  })

  it("hands owners their own card back to the card manager", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(cardShare({ state: "own-card" }))
    renderShare()

    expect(await screen.findByText("这是你自己的名片")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "去名片管理" })
    ).toHaveAttribute("href", "/account/me/namecards")
  })

  it("explains a card that no longer accepts exchanges", async () => {
    apiMocks.send.mockResolvedValue(cardShare({ state: "not-accepting" }))
    renderShare()

    expect(await screen.findByText("这张名片不接受交换")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "交换功能即将开放" })
    ).toBeDisabled()
  })

  it("falls back to the visitor's account id when the owner picked no page slug", async () => {
    apiMocks.send.mockResolvedValue(
      cardShare({
        owner: {
          accountId: "acct-2",
          uid: 4242,
          pageSlug: null,
          displayName: "春香P",
        },
        card: makeNamecard({
          cardNumber: 7,
          pages: [makeCardPage({ role: "front", order: 1 })],
        }),
      })
    )
    renderShare()

    expect(await screen.findByRole("link", { name: "春香P" })).toHaveAttribute(
      "href",
      "/user/4242"
    )
    // 单页名片不渲染轮播控件。
    expect(screen.queryByRole("button", { name: "下一张" })).toBeNull()
    expect(screen.queryByText("1/1")).toBeNull()
  })

  it("renders the unavailable copy when the link is dead", async () => {
    apiMocks.send.mockRejectedValue(new Error("HTTP 404"))
    renderShare()

    expect(await screen.findByText("这张名片当前不开放交换")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "交换功能即将开放" })
    ).toBeNull()
    expect(screen.getByRole("link", { name: "去名片墙看看" })).toHaveAttribute(
      "href",
      "/community/cards"
    )
  })
})
