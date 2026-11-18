import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardCardShare, NamecardExchangeResult } from "~/lib/api"
import { makeCardPage, makeNamecard } from "@/mocks/data/namecards"
import CardSharePage from "~/pages/exchange/card-share-page"
import { renderPage } from "@/tests/unit/support/harness"

const SLUG = "abcdefghijkl"

const apiMocks = vi.hoisted(() => ({
  getCardSharePage: vi.fn(),
  send: vi.fn(),
  commitCardShare: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

const toastMocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  })
  return { toast }
})

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getCardSharePage: apiMocks.getCardSharePage,
  commitCardShare: apiMocks.commitCardShare,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

// 选卡窗口有自己的单测；分享页只负责「传了什么、确定后调了哪个端点」。
vi.mock(
  "~/components/community/exchange/exchange-card-picker-dialog",
  () => ({
    ExchangeCardPickerDialog: ({
      open,
      target,
      targetMissingCount,
      onSubmit,
      onOpenChange,
    }: {
      open: boolean
      target?: string
      targetMissingCount?: number
      onSubmit: (cardNumbers: number[]) => void
      onOpenChange: (open: boolean) => void
    }) =>
      open ? (
        <div role="dialog" aria-label="交换名片">
          <span data-testid="picker-target">{target}</span>
          <span data-testid="picker-missing">{targetMissingCount}</span>
          <button
            type="button"
            onClick={() => {
              onSubmit([7, 8])
              onOpenChange(false)
            }}
          >
            确定
          </button>
        </div>
      ) : null,
  })
)

vi.mock("sonner", () => ({ toast: toastMocks.toast }))

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

function exchangeResult(
  overrides: Partial<NamecardExchangeResult> = {}
): NamecardExchangeResult {
  return {
    exchangeId: "exchange-1",
    status: "completed",
    targetCardNumbers: [101],
    initiatorCardNumbers: [],
    skipped: [],
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
  apiMocks.send.mockResolvedValue(cardShare())
  apiMocks.commitCardShare.mockResolvedValue(exchangeResult())
})

describe("CardSharePage", () => {
  it("previews every page and keeps the exchange button disabled for anonymous visitors", async () => {
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

    const exchange = screen.getByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "登录后才能交换")
    expect(screen.getByText("登录后才能交换")).toBeTruthy()
  })

  it("sends anonymous visitors back to the share page after login", async () => {
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
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
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
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
  })

  it("explains a card that no longer accepts exchanges", async () => {
    apiMocks.send.mockResolvedValue(cardShare({ state: "not-accepting" }))
    renderShare()

    expect(await screen.findByText("这张名片不接受交换")).toBeTruthy()
    const exchange = screen.getByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "这张名片不接受交换")
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
    expect(screen.queryByRole("button", { name: "交换" })).toBeNull()
    expect(screen.getByRole("link", { name: "去名片墙看看" })).toHaveAttribute(
      "href",
      "/community/cards"
    )
  })

  it("opens the picker for the owner and commits the chosen cards", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(cardShare({ targetMissingCount: 3 }))
    renderShare()

    await user.click(await screen.findByRole("button", { name: "交换" }))

    const picker = screen.getByRole("dialog", { name: "交换名片" })
    expect(within(picker).getByTestId("picker-target")).toHaveTextContent(
      "acct-2"
    )
    expect(within(picker).getByTestId("picker-missing")).toHaveTextContent("3")

    await user.click(within(picker).getByRole("button", { name: "确定" }))

    const [slug, body] = apiMocks.commitCardShare.mock.calls[0] as [
      string,
      { clientExchangeId: string; giveCardNumbers: number[] },
    ]
    expect(slug).toBe(SLUG)
    expect(body.giveCardNumbers).toEqual([7, 8])
    expect(body.clientExchangeId.length).toBeGreaterThanOrEqual(8)
    expect(body.clientExchangeId.length).toBeLessThanOrEqual(64)
    expect(toastMocks.toast.success).toHaveBeenCalledWith(
      "交换完成，名片已放进你的名片册"
    )
    expect(screen.queryByRole("dialog", { name: "交换名片" })).toBeNull()
  })

  it("announces a pending request instead of claiming the exchange is done", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.commitCardShare.mockResolvedValue(
      exchangeResult({ status: "pending" })
    )
    renderShare()

    await user.click(await screen.findByRole("button", { name: "交换" }))
    await user.click(screen.getByRole("button", { name: "确定" }))

    await waitFor(() =>
      expect(toastMocks.toast.success).toHaveBeenCalledWith(
        "已发出申请，对方确认后会通知你"
      )
    )
  })
})
