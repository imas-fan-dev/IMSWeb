import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Namecard } from "~/lib/api"
import { NamecardDetailDialog } from "~/pages/community/components/namecard-detail-dialog"
import { makeNamecard } from "@/mocks/data/namecards"
import { renderPage } from "@/tests/unit/support/harness"

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    // 详情窗挂载时读企划目录；这里只关心底栏，给一份空目录即可。
    getFudabaSeries: () => ({
      send: () => Promise.resolve({ items: [] }),
    }),
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
})
