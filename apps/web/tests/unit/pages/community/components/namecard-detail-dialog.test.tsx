import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Namecard } from "~/lib/api"
import { NamecardDetailDialog } from "~/pages/community/components/namecard-detail-dialog"
import { makeNamecard } from "@/mocks/data/namecards"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getCardShareLink: vi.fn(),
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
  }
})

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: () => ({
    status: "anonymous",
    session: null,
    error: null,
    acceptSession: vi.fn(),
    reload: vi.fn(),
    logout: vi.fn(),
  }),
}))

/** 别家已发布的卡：底栏只出现「交换」，属主分支不参与。 */
function visitorCard(overrides: Partial<Namecard> = {}): Namecard {
  return makeNamecard({
    id: 42,
    cardNumber: 42,
    cardId: "card-42",
    hasOwner: true,
    claimStatus: "claimed",
    ...overrides,
  })
}

function renderDialog(overrides: Partial<Namecard> = {}) {
  return renderPage(
    <NamecardDetailDialog
      card={visitorCard(overrides)}
      canClaim={false}
      reactions={{ reactions: {}, loading: false }}
      busy={false}
      onOpenChange={vi.fn()}
      onOpenPreview={vi.fn()}
      onClaim={vi.fn()}
      onSupplement={vi.fn()}
      onReact={vi.fn().mockResolvedValue(true)}
      onReturnFocus={vi.fn()}
    />
  )
}

describe("NamecardDetailDialog", () => {
  it("offers the placeholder exchange entry while the visitor owns nothing", async () => {
    renderDialog()

    const exchange = await screen.findByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "暂未开放")
  })

  it("names the reason when the visitor already owns the card", async () => {
    renderDialog({ collected: true })

    const exchange = await screen.findByRole("button", { name: "交换" })
    expect(exchange).toBeDisabled()
    expect(exchange).toHaveAttribute("title", "你已经拥有这张名片")
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

    await screen.findByRole("button", { name: "交换" })
    expect(screen.queryByRole("button", { name: "分享" })).toBeNull()
    expect(apiMocks.getCardShareLink).not.toHaveBeenCalled()
  })
})
