import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NamecardExchangeDetail } from "@imsweb/contracts/namecards"

import { ExchangeRequestDialog } from "~/components/community/exchange/exchange-request-dialog"
import { ApiError } from "~/lib/api"
import { makeNamecard } from "@/mocks/data/namecards"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getExchangeDetail: vi.fn(),
  sendDetail: vi.fn(),
  acceptExchange: vi.fn(),
  sendAccept: vi.fn(),
  declineExchange: vi.fn(),
  sendDecline: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getExchangeDetail: apiMocks.getExchangeDetail,
    acceptExchange: apiMocks.acceptExchange,
    declineExchange: apiMocks.declineExchange,
    // 只读名片窗挂载时读企划目录；用例不关心，给一份空目录即可。
    getFudabaSeries: () => ({
      send: () => Promise.resolve({ items: [] }),
    }),
  }
})

vi.mock("sonner", () => ({ toast: { error: toastMocks.toast } }))

function detail(
  overrides: Partial<NamecardExchangeDetail> = {}
): NamecardExchangeDetail {
  return {
    id: "ex-1",
    status: "pending",
    source: "card-request",
    createdAt: "2026-11-18T02:03:04.000Z",
    expiresAt: "2026-11-25T02:03:04.000Z",
    initiator: { accountId: "u1", displayName: "天海春香" },
    target: { accountId: "u2", displayName: "如月千早" },
    targetCards: [makeNamecard({ cardId: "card-11", cardNumber: 11 })],
    initiatorCards: [
      makeNamecard({ cardId: "card-22", cardNumber: 22 }),
      makeNamecard({ cardId: "card-33", cardNumber: 33 }),
    ],
    skipped: [],
    ...overrides,
  }
}

function renderDialog(
  props: Partial<ComponentProps<typeof ExchangeRequestDialog>> = {}
) {
  const onOpenChange = vi.fn()
  const onDecided = vi.fn()
  const result = renderPage(
    <ExchangeRequestDialog
      open
      onOpenChange={onOpenChange}
      exchangeId="ex-1"
      onDecided={onDecided}
      {...props}
    />
  )
  return { ...result, onOpenChange, onDecided }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.sendDetail.mockResolvedValue(detail())
  apiMocks.getExchangeDetail.mockReturnValue({ send: apiMocks.sendDetail })
  apiMocks.sendAccept.mockResolvedValue({
    success: true,
    status: "completed",
  })
  apiMocks.acceptExchange.mockReturnValue({ send: apiMocks.sendAccept })
  apiMocks.sendDecline.mockResolvedValue({
    success: true,
    status: "declined",
  })
  apiMocks.declineExchange.mockReturnValue({ send: apiMocks.sendDecline })
})

describe("ExchangeRequestDialog content", () => {
  it("shows both card grids with the initiator name and the expiry", async () => {
    renderDialog()

    expect(
      await screen.findByText("天海春香 希望与你交换名片")
    ).toBeInTheDocument()
    expect(screen.getByText(/发起于 2026-11-18 02:03/)).toBeInTheDocument()
    expect(
      screen.getByText(/有效期至 2026-11-25 02:03/)
    ).toBeInTheDocument()
    expect(apiMocks.getExchangeDetail).toHaveBeenCalledWith("ex-1")

    const lists = screen.getAllByRole("list")
    expect(within(lists[0]!).getAllByRole("listitem")).toHaveLength(1)
    expect(within(lists[1]!).getAllByRole("listitem")).toHaveLength(2)
    expect(within(lists[0]!).getByAltText("名片 #11")).toHaveAttribute(
      "src",
      "/uploads/namecard/original/abc.webp"
    )
    expect(within(lists[1]!).getByAltText("名片 #22")).toBeInTheDocument()
    expect(within(lists[1]!).getByAltText("名片 #33")).toBeInTheDocument()
  })

  it("tells the reader when the initiator gave no cards", async () => {
    apiMocks.sendDetail.mockResolvedValue(detail({ initiatorCards: [] }))
    renderDialog()

    expect(await screen.findByText("对方这次没有给出名片")).toBeInTheDocument()
    expect(screen.getAllByRole("list")).toHaveLength(1)
  })

  it("offers retry when the detail request fails", async () => {
    const user = userEvent.setup()
    apiMocks.sendDetail
      .mockRejectedValueOnce(new ApiError("boom", { kind: "network" }))
      .mockResolvedValueOnce(detail())
    renderDialog()

    expect(await screen.findByText("交换详情加载失败。")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "重试" }))

    expect(
      await screen.findByText("天海春香 希望与你交换名片")
    ).toBeInTheDocument()
    expect(apiMocks.sendDetail).toHaveBeenCalledTimes(2)
  })

  it("opens a thumbnail as a read-only card above the exchange window", async () => {
    const user = userEvent.setup()
    renderDialog()

    await screen.findByText("天海春香 希望与你交换名片")
    const lists = screen.getAllByRole("list")
    await user.click(
      within(lists[0]!).getByRole("button", { name: "查看名片 #11" })
    )

    // 完整名片用的是交换详情里那一侧的公开投影（卡号 11），叠在交换窗之上。
    const card = await screen.findByRole("dialog", {
      name: /制作人名片\s*1$/,
    })
    expect(within(card).getByText(/名片 #11/)).toBeInTheDocument()
    expect(within(card).getByLabelText("名片公开参数")).toBeInTheDocument()
    // 只读：反应区 / 交换 / 分享都不渲染，只留【反馈】。
    expect(within(card).getByRole("button", { name: "反馈" })).toBeInTheDocument()
    expect(within(card).queryByText("全部反应")).toBeNull()
    expect(within(card).queryByRole("button", { name: "交换名片" })).toBeNull()
    expect(within(card).queryByRole("button", { name: "分享" })).toBeNull()
    // 交换窗没被顶掉：只读名片窗在上层，下层内容仍在（被上层设为 aria-hidden）。
    expect(screen.getByText("对方希望交换的名片")).toBeInTheDocument()

    // 关掉上层，下层原样留着。
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /制作人名片/ })
      ).toBeNull()
    })
    expect(
      screen.getByRole("dialog", { name: "名片交换请求" })
    ).toBeInTheDocument()
  })
})

describe("ExchangeRequestDialog decisions", () => {
  it("keeps 拒绝 and 同意 available while the exchange is pending", async () => {
    renderDialog()

    expect(await screen.findByRole("button", { name: "同意" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "拒绝" })).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: "关闭" })
    ).not.toBeInTheDocument()
  })

  it("is read-only once the exchange expired", async () => {
    apiMocks.sendDetail.mockResolvedValue(detail({ status: "expired" }))
    renderDialog()

    expect(await screen.findByText("这笔交换已过期")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "同意" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "拒绝" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled()
  })

  it("accepts through acceptExchange and reports the outcome", async () => {
    const user = userEvent.setup()
    const { onOpenChange, onDecided } = renderDialog()

    await user.click(await screen.findByRole("button", { name: "同意" }))

    expect(apiMocks.acceptExchange).toHaveBeenCalledWith("ex-1")
    expect(onDecided).toHaveBeenCalledWith("completed")
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it("declines through declineExchange and reports the outcome", async () => {
    const user = userEvent.setup()
    const { onOpenChange, onDecided } = renderDialog()

    await user.click(await screen.findByRole("button", { name: "拒绝" }))

    expect(apiMocks.declineExchange).toHaveBeenCalledWith("ex-1")
    expect(onDecided).toHaveBeenCalledWith("declined")
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it("keeps the dialog open and toasts when the request already expired", async () => {
    const user = userEvent.setup()
    apiMocks.sendAccept.mockRejectedValue(
      new ApiError("这条交换请求已过期，对方需要重新发起", {
        kind: "http",
        status: 409,
      })
    )
    const { onOpenChange, onDecided } = renderDialog()

    await user.click(await screen.findByRole("button", { name: "同意" }))

    expect(toastMocks.toast).toHaveBeenCalledWith("这条交换请求已过期")
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onDecided).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "同意" })).toBeEnabled()
  })
})
