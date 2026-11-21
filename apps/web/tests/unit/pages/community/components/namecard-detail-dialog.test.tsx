import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Namecard } from "~/lib/api"
import { NamecardDetailDialog } from "~/pages/community/components/namecard-detail-dialog"
import { makeNamecard } from "@/mocks/data/namecards"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getCardShareLink: vi.fn(),
  setNamecardCardTags: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    // 详情窗挂载时读企划目录；这里只关心底栏，给一份空目录即可。
    getFudabaSeries: () => ({
      send: () => Promise.resolve({ items: [] }),
    }),
    getCardShareLink: apiMocks.getCardShareLink,
    setNamecardCardTags: apiMocks.setNamecardCardTags,
  }
})

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: sessionMocks.useOptionalPlatformSession,
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

/** 别家已发布的卡：底栏只出现「交换」，属主分支不参与。 */
function visitorCard(overrides: Partial<Namecard> = {}): Namecard {
  return makeNamecard({
    id: 42,
    cardNumber: 42,
    cardId: "card-42",
    hasOwner: true,
    claimStatus: "claimed",
    claimerUid: 4242,
    ...overrides,
  })
}

function renderDialog(
  overrides: Partial<Namecard> = {},
  props: Partial<ComponentProps<typeof NamecardDetailDialog>> = {}
) {
  const onExchange = vi.fn()
  const result = renderPage(
    <NamecardDetailDialog
      card={visitorCard(overrides)}
      canClaim={false}
      reactions={{ reactions: {}, loading: false }}
      busy={false}
      onOpenChange={vi.fn()}
      onOpenPreview={vi.fn()}
      onClaim={vi.fn()}
      onSupplement={vi.fn()}
      onExchange={onExchange}
      onReact={vi.fn().mockResolvedValue(true)}
      onReturnFocus={vi.fn()}
      {...props}
    />
  )
  return { ...result, onExchange }
}

beforeEach(() => {
  sessionMocks.useOptionalPlatformSession.mockReturnValue(session("anonymous"))
})

describe("NamecardDetailDialog", () => {
  it("keeps the exchange entry disabled until the visitor signs in", async () => {
    renderDialog()

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "登录后才能交换")
  })

  it("names the reason when the visitor already owns the card", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    renderDialog({ collected: true })

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "你已经拥有这张名片")
  })

  it("opens the exchange picker for a signed-in visitor", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    const { onExchange } = renderDialog()

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeEnabled()
    expect(exchange).not.toHaveAttribute("title")

    await user.click(exchange)

    // 没有页面级目标时退回卡上的 `claimerUid`（老调用方的兜底）。
    expect(onExchange).toHaveBeenCalledWith(
      expect.objectContaining({ cardNumber: 42 }),
      { accountId: "4242" }
    )
  })

  it("hands the page's account target down to the picker", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    const { onExchange } = renderDialog(
      { claimerUid: null },
      { exchangeTarget: "acct-2" }
    )

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeEnabled()
    await user.click(exchange)

    // 主页知道卡主账号：即使公开投影的 `claimerUid` 是 null 也能交换。
    expect(onExchange).toHaveBeenCalledWith(
      expect.objectContaining({ cardNumber: 42 }),
      { accountId: "acct-2" }
    )
  })

  it("hands the wall's card number down to the picker", async () => {
    const user = userEvent.setup()
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    const { onExchange } = renderDialog(
      { cardNumber: 786, claimerUid: null },
      { exchangeTargetCard: 786 }
    )

    const exchange = await screen.findByRole("button", { name: "交换名片" })
    expect(exchange).toBeEnabled()
    await user.click(exchange)

    expect(onExchange).toHaveBeenCalledWith(
      expect.objectContaining({ cardNumber: 786 }),
      { cardNumber: 786 }
    )
  })

  it("offers the owner a single card share panel loaded on demand", async () => {
    const user = userEvent.setup()
    // jsdom 没有 canvas 实现：给一个只记账的 2D 上下文，二维码绘制照常跑完。
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    apiMocks.getCardShareLink.mockReturnValue({
      send: () => Promise.resolve({ slug: "abcdefghijkl" }),
    })
    renderDialog({ canEdit: true })

    await user.click(await screen.findByRole("button", { name: "分享" }))

    expect(apiMocks.getCardShareLink).toHaveBeenCalledWith(42)
    expect(
      await screen.findByText(
        `${window.location.origin}/exchange/card/abcdefghijkl`
      )
    ).toBeVisible()
  })

  it("keeps the share entry out of a card the visitor only reads", async () => {
    renderDialog()

    await screen.findByRole("button", { name: "交换名片" })
    expect(screen.queryByRole("button", { name: "分享" })).toBeNull()
    expect(apiMocks.getCardShareLink).not.toHaveBeenCalled()
  })

  it("drops every interaction but the feedback entry in read-only mode", async () => {
    sessionMocks.useOptionalPlatformSession.mockReturnValue(
      session("authenticated")
    )
    renderDialog({}, { readOnly: true })

    // 只留【反馈】：反应区、交换、分享、编辑/认领/补充一律不渲染。
    expect(await screen.findByRole("button", { name: "反馈" })).toBeEnabled()
    expect(screen.queryByText("全部反应")).toBeNull()
    expect(screen.queryByLabelText("名片全部反应")).toBeNull()
    expect(screen.queryByRole("button", { name: "添加反应" })).toBeNull()
    expect(screen.queryByRole("button", { name: "添加标签" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "标签" })).toBeNull()
    expect(screen.queryByRole("button", { name: "交换名片" })).toBeNull()
    expect(screen.queryByRole("button", { name: "分享" })).toBeNull()
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull()
    expect(screen.queryByRole("button", { name: "认领" })).toBeNull()
    expect(screen.queryByRole("button", { name: "补充" })).toBeNull()

    // 卡片信息与公开参数照旧。
    expect(screen.getByLabelText("名片公开参数")).toBeInTheDocument()
    expect(screen.getByText("制作人名称")).toBeInTheDocument()
  })

  it("mounts the inline tag editor above the reactions by default", async () => {
    renderDialog({ tags: [{ name: "偶像", presetId: null }] })

    expect(await screen.findByText("标签")).toBeVisible()
    expect(screen.getByText("偶像")).toBeVisible()
    expect(screen.getByRole("button", { name: "添加标签" })).toBeVisible()
    const tagsSection = screen.getByRole("heading", { name: "标签" })
    const reactionsSection = screen.getByRole("heading", { name: "全部反应" })
    expect(
      tagsSection.compareDocumentPosition(reactionsSection) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("hides the tag section when the caller opts out", async () => {
    renderDialog(
      { tags: [{ name: "偶像", presetId: null }] },
      { showTags: false }
    )

    await screen.findByRole("button", { name: "交换名片" })
    expect(screen.queryByRole("heading", { name: "标签" })).toBeNull()
    expect(screen.queryByRole("button", { name: "添加标签" })).toBeNull()
  })

  it("renders the smaller reaction size", async () => {
    renderDialog(
      {},
      { reactions: { reactions: { "\u{1F525}": 2 }, loading: false } }
    )

    const chip = await screen.findByRole("button", {
      name: "\u{1F525}，2 次反应",
    })
    expect(chip).toHaveClass("h-7", { exact: false })
  })

  it("replaces the exchange entry with the collection hide toggle", async () => {
    const user = userEvent.setup()
    const onToggleHidden = vi.fn()
    renderDialog({}, { collection: { hidden: false, busy: false, onToggleHidden } })

    const hide = await screen.findByRole("button", { name: "隐藏" })
    expect(hide).toBeEnabled()
    expect(screen.queryByRole("button", { name: "交换名片" })).toBeNull()

    await user.click(hide)
    expect(onToggleHidden).toHaveBeenCalledTimes(1)
  })

  it("reads as 取消隐藏 and blocks repeats while the write is in flight", async () => {
    renderDialog(
      {},
      { collection: { hidden: true, busy: true, onToggleHidden: vi.fn() } }
    )

    expect(await screen.findByRole("button", { name: "取消隐藏" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "隐藏" })).toBeNull()
  })

  it("offers neither exchange nor hide on my own collected card", async () => {
    renderDialog({ canEdit: true }, { collection: null })

    expect(await screen.findByRole("button", { name: "分享" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "交换名片" })).toBeNull()
    expect(screen.queryByRole("button", { name: "隐藏" })).toBeNull()
    expect(screen.queryByRole("button", { name: "取消隐藏" })).toBeNull()
  })
})
