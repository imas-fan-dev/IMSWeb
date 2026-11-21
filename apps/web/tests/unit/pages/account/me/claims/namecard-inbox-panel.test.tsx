import { screen, within } from "@testing-library/react"
import { renderPage } from "@/tests/unit/support/harness"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NamecardNotification } from "@imsweb/contracts/fudaba/card-claims"
import type { NamecardExchangeDetail } from "@imsweb/contracts/namecards"

import { NamecardInboxPanel } from "~/pages/account/me/claims/namecard-inbox-panel"
import { makeNamecard } from "@/mocks/data/namecards"

const apiMocks = vi.hoisted(() => ({
  getNamecardNotifications: vi.fn(),
  sendNotifications: vi.fn(),
  markNamecardNotificationsRead: vi.fn(),
  sendMarkRead: vi.fn(),
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
    getNamecardNotifications: apiMocks.getNamecardNotifications,
    markNamecardNotificationsRead: apiMocks.markNamecardNotificationsRead,
    getExchangeDetail: apiMocks.getExchangeDetail,
    acceptExchange: apiMocks.acceptExchange,
    declineExchange: apiMocks.declineExchange,
  }
})

vi.mock("sonner", () => ({ toast: { error: toastMocks.toast } }))

const exchangeNotification: NamecardNotification = {
  id: "n-exchange",
  kind: "card-exchange-requested",
  cardNumber: null,
  exchangeId: "ex-1",
  title: "有一笔名片交换在等你确认",
  body: "天海春香希望交换您的名片 #11，一周内不处理将自动过期。",
  readAt: null,
  createdAt: "2026-11-18T02:03:04.000Z",
}

const stationNotification: NamecardNotification = {
  id: "n-station",
  kind: "station-message",
  cardNumber: null,
  exchangeId: null,
  title: "站内公告",
  body: "本周维护时间调整。",
  readAt: null,
  createdAt: "2026-11-17T02:03:04.000Z",
}

function exchangeDetail(
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
    initiatorCards: [makeNamecard({ cardId: "card-22", cardNumber: 22 })],
    skipped: [],
    ...overrides,
  }
}

function renderPanel(notifications: NamecardNotification[]) {
  apiMocks.sendNotifications.mockResolvedValue({
    items: notifications,
    unread: notifications.filter((item) => !item.readAt).length,
  })
  return renderPage(<NamecardInboxPanel readOnly={false} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getNamecardNotifications.mockReturnValue({
    send: apiMocks.sendNotifications,
  })
  apiMocks.sendMarkRead.mockResolvedValue({ success: true, updated: 1 })
  apiMocks.markNamecardNotificationsRead.mockReturnValue({
    send: apiMocks.sendMarkRead,
  })
  apiMocks.sendDetail.mockResolvedValue(exchangeDetail())
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

describe("NamecardInboxPanel exchange entries", () => {
  it("opens the exchange window and marks the request notification read", async () => {
    const user = userEvent.setup()
    renderPanel([exchangeNotification])

    await screen.findByRole("heading", { name: exchangeNotification.title })
    await user.click(screen.getByRole("button", { name: /查看详情/ }))

    expect(apiMocks.getExchangeDetail).toHaveBeenCalledWith("ex-1")
    expect(
      await screen.findByRole("dialog", { name: "名片交换请求" })
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(apiMocks.markNamecardNotificationsRead).toHaveBeenCalledWith([
        "n-exchange",
      ])
    )
  })

  it("refreshes the notification list after a decision lands", async () => {
    const user = userEvent.setup()
    renderPanel([exchangeNotification])

    await screen.findByRole("heading", { name: exchangeNotification.title })
    await user.click(screen.getByRole("button", { name: /查看详情/ }))
    const dialog = await screen.findByRole("dialog", {
      name: "名片交换请求",
    })
    await user.click(within(dialog).getByRole("button", { name: "同意" }))

    expect(apiMocks.acceptExchange).toHaveBeenCalledWith("ex-1")
    await vi.waitFor(() =>
      expect(apiMocks.sendNotifications).toHaveBeenCalledTimes(2)
    )
  })

  it("keeps the body dialog for other notification kinds", async () => {
    const user = userEvent.setup()
    renderPanel([stationNotification])

    await screen.findByRole("heading", { name: stationNotification.title })
    await user.click(screen.getByRole("button", { name: /查看详情/ }))

    expect(apiMocks.getExchangeDetail).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("dialog", { name: "名片交换请求" })
    ).not.toBeInTheDocument()
    const dialog = await screen.findByRole("dialog", {
      name: stationNotification.title,
    })
    expect(within(dialog).getByText("本周维护时间调整。")).toBeInTheDocument()
  })

  it("does not offer the exchange window when a request carries no exchange id", async () => {
    const user = userEvent.setup()
    renderPanel([{ ...exchangeNotification, exchangeId: null }])

    await screen.findByRole("heading", { name: exchangeNotification.title })
    await user.click(screen.getByRole("button", { name: /查看详情/ }))

    expect(apiMocks.getExchangeDetail).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("dialog", { name: "名片交换请求" })
    ).not.toBeInTheDocument()
    const dialog = await screen.findByRole("dialog", {
      name: exchangeNotification.title,
    })
    expect(
      within(dialog).getByText(exchangeNotification.body)
    ).toBeInTheDocument()
  })
})
