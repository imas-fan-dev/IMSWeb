import type { ReactNode } from "react"

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardExchangeResult, NamecardScanLanding } from "~/lib/api"
import { makeNamecard } from "@/mocks/data/namecards"
import ScanSharePage from "~/pages/exchange/scan-share-page"
import { renderPage } from "@/tests/unit/support/harness"

const TOKEN = "b".repeat(64)

const apiMocks = vi.hoisted(() => ({
  getScanLandingPage: vi.fn(),
  sendLanding: vi.fn(),
  commitScanSession: vi.fn(),
  sendCommit: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
  provider: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getScanLandingPage: apiMocks.getScanLandingPage,
  commitScanSession: apiMocks.commitScanSession,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  PlatformSessionProvider: (props: { children?: ReactNode }) => {
    sessionMocks.provider(props)
    return props.children
  },
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
}))

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: () => ({ token: TOKEN }),
}))

// 选卡窗口有独立单测；落地页只验证「传了什么、确定后调了哪个端点」。
vi.mock("~/components/community/exchange/exchange-card-picker-dialog", () => ({
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
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
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

function landing(
  overrides: Partial<NamecardScanLanding> = {}
): NamecardScanLanding {
  return {
    state: "active",
    expiresAt: "2026-11-28T12:00:00.000Z",
    owner: {
      accountId: "acct-2",
      uid: 4242,
      pageSlug: "haruka",
      displayName: "春香P",
    },
    cards: [
      makeNamecard({ id: 11, cardNumber: 101 }),
      makeNamecard({ id: 12, cardNumber: 102 }),
    ],
    targetMissingCount: 2,
    ...overrides,
  }
}

function exchangeResult(): NamecardExchangeResult {
  return {
    exchangeId: "exchange-1",
    status: "completed",
    targetCardNumbers: [101, 102],
    initiatorCardNumbers: [5],
    skipped: [],
    targetMissingCount: 0,
  }
}

function renderPageAtToken() {
  return renderPage(<ScanSharePage />, { route: `/exchange/scan/${TOKEN}` })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.useOptionalPlatformSession.mockReturnValue(session("anonymous"))
  apiMocks.getScanLandingPage.mockReturnValue({ send: apiMocks.sendLanding })
  apiMocks.sendLanding.mockResolvedValue(landing())
  // alova 的 method 是 thenable；测试里直接给可 await 的结果即可。
  apiMocks.commitScanSession.mockResolvedValue(exchangeResult())
})

describe("ScanSharePage", () => {
  it("previews the owner and the offered cards before login", async () => {
    renderPageAtToken()

    expect(
      await screen.findByRole("link", { name: "春香P" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("img", { name: "制作人名片 101 正面" })
    ).toBeTruthy()
    const exchange = screen.getByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "登录后才能交换")
    expect(screen.getByText("登录后才能交换")).toBeTruthy()
  })

  it("lets a signed-in visitor give cards through the picker", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    const user = userEvent.setup()
    renderPageAtToken()

    const exchange = await screen.findByRole("button", { name: "交换" })
    expect(exchange).toBeEnabled()
    await user.click(exchange)

    expect(screen.getByTestId("picker-target")).toHaveTextContent("acct-2")
    expect(screen.getByTestId("picker-missing")).toHaveTextContent("2")
    await user.click(screen.getByRole("button", { name: "确定" }))

    expect(apiMocks.commitScanSession).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ giveCardNumbers: [5] })
    )
    await waitFor(
      () => expect(apiMocks.sendLanding).toHaveBeenCalledTimes(2),
      { timeout: 3000 }
    )
  })

  it("hides the owner and the cards once the code was used", async () => {
    apiMocks.sendLanding.mockResolvedValue(
      landing({ state: "committed", owner: null, cards: [] })
    )
    renderPageAtToken()

    expect(
      await screen.findByText("这个二维码已经完成过一次交换")
    ).toBeVisible()
    expect(screen.getByText("面对面交换")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "春香P" })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("img", { name: /制作人名片/ })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
  })

  it("drops the owner and the cards for an expired code", async () => {
    apiMocks.sendLanding.mockResolvedValue(
      landing({ state: "expired", owner: null, cards: [] })
    )
    renderPageAtToken()

    expect(await screen.findByText("这个二维码已过期")).toBeVisible()
    expect(screen.queryByRole("link", { name: "春香P" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
  })

  it("recognises the owner opening their own code", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    apiMocks.sendLanding.mockResolvedValue(landing({ state: "own-card" }))
    renderPageAtToken()

    expect(await screen.findByText("这是你自己的二维码")).toBeVisible()
    expect(screen.getByRole("link", { name: "去名片管理" })).toHaveAttribute(
      "href",
      "/account/me/namecards"
    )
    expect(screen.getByRole("button", { name: "交换" })).toBeDisabled()
  })

  it("renders the invalid-code page when the API rejects the token", async () => {
    apiMocks.sendLanding.mockRejectedValue(new Error("404"))
    renderPageAtToken()

    expect(await screen.findByText("二维码无效或已失效")).toBeVisible()
  })
})
