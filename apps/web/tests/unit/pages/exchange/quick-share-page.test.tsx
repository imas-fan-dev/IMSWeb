import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardExchangeResult, NamecardQuickExchange } from "~/lib/api"
import { makeNamecard } from "@/mocks/data/namecards"
import QuickSharePage from "~/pages/exchange/quick-share-page"
import { renderPage } from "@/tests/unit/support/harness"

const HANDLE = "haruka"

const apiMocks = vi.hoisted(() => ({
  getQuickExchangePage: vi.fn(),
  send: vi.fn(),
  commitQuickExchange: vi.fn(),
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
  getQuickExchangePage: apiMocks.getQuickExchangePage,
  commitQuickExchange: apiMocks.commitQuickExchange,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

// 选卡窗口有自己的单测；快速页只负责「传了什么、确定后调了哪个端点」。
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
              onSubmit([5])
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
  return renderPage(<QuickSharePage />, { route: `/exchange/${HANDLE}` })
}

beforeEach(() => {
  sessionMocks.useOptionalPlatformSession.mockReturnValue(session("anonymous"))
  apiMocks.getQuickExchangePage.mockReturnValue({ send: apiMocks.send })
  apiMocks.send.mockResolvedValue(quickShare())
  apiMocks.commitQuickExchange.mockResolvedValue(exchangeResult())
})

describe("QuickSharePage", () => {
  it("previews the listed cards, links the handle back and keeps anonymous visitors out", async () => {
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
    const exchange = screen.getByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "登录后才能交换")
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
    const exchange = screen.getByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "你已经拥有这些名片")
  })

  it("keeps the ready copy and badges only the cards the visitor holds", async () => {
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

    // 部分已拥有：只有那张卡带角标，交换照常可点。
    expect(await screen.findByText("已拥有")).toBeTruthy()
    expect(screen.getAllByText("已拥有")).toHaveLength(1)
    expect(screen.getByText("选择你要给出的名片即可交换")).toBeTruthy()
    expect(screen.getByRole("button", { name: "交换" })).toBeEnabled()
  })

  it("explains an empty quick list and renders no controls", async () => {
    apiMocks.send.mockResolvedValue(quickShare({ cards: [] }))
    renderShare()

    expect(
      await screen.findByText("这位制作人还没有可交换的名片。")
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "下一张" })).toBeNull()
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
  })

  it("renders the missing-producer copy when nobody owns the handle", async () => {
    apiMocks.send.mockRejectedValue(new Error("HTTP 404"))
    renderShare()

    expect(await screen.findByText("找不到这位制作人")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "交换" })).toBeNull()
  })

  it("opens the picker for the list owner and commits through the quick path", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.send.mockResolvedValue(quickShare({ targetMissingCount: 2 }))
    renderShare()

    await user.click(await screen.findByRole("button", { name: "交换" }))

    const picker = screen.getByRole("dialog", { name: "交换名片" })
    expect(within(picker).getByTestId("picker-target")).toHaveTextContent(
      "acct-2"
    )
    expect(within(picker).getByTestId("picker-missing")).toHaveTextContent("2")

    await user.click(within(picker).getByRole("button", { name: "确定" }))

    const [handle, body] = apiMocks.commitQuickExchange.mock.calls[0] as [
      string,
      { clientExchangeId: string; giveCardNumbers: number[] },
    ]
    expect(handle).toBe(HANDLE)
    expect(body.giveCardNumbers).toEqual([5])
    expect(body.clientExchangeId.length).toBeGreaterThanOrEqual(8)
    expect(body.clientExchangeId.length).toBeLessThanOrEqual(64)
    expect(toastMocks.toast.success).toHaveBeenCalledWith(
      "交换完成，名片已放进你的名片册"
    )
  })

  it("announces a pending request instead of claiming the exchange is done", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.commitQuickExchange.mockResolvedValue(
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
