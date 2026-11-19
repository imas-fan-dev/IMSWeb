import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScanShareDialog } from "~/components/community/exchange/scan-share-dialog"
import { SCAN_STATUS_POLL_MS } from "~/components/community/exchange/use-scan-share"
import { EXCHANGE_COMPLETED_MESSAGE } from "~/components/community/exchange/use-exchange-submit"

const apiMocks = vi.hoisted(() => ({
  createScanSession: vi.fn(),
  sendCreate: vi.fn(),
  getScanSession: vi.fn(),
  sendStatus: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const refreshMocks = vi.hoisted(() => ({ notify: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    createScanSession: apiMocks.createScanSession,
    getScanSession: apiMocks.getScanSession,
  }
})

vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: () => true,
}))

vi.mock("~/lib/namecards/data-refresh", () => ({
  notifyNamecardDataChanged: refreshMocks.notify,
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

const EXPIRES_AT = "2026-11-19T12:00:00.000Z"

function renderDialog(cardNumbers: readonly number[] = [3, 5]) {
  return render(
    <ScanShareDialog open onOpenChange={vi.fn()} cardNumbers={cardNumbers} />
  )
}

/** 让创建会话的微任务落地（假定时器下 `findBy*` 不会自己推进时间）。 */
async function flushCreate() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  apiMocks.createScanSession.mockReturnValue({ send: apiMocks.sendCreate })
  apiMocks.sendCreate.mockResolvedValue({
    token: "a".repeat(64),
    expiresAt: EXPIRES_AT,
  })
  apiMocks.getScanSession.mockReturnValue({ send: apiMocks.sendStatus })
  apiMocks.sendStatus.mockResolvedValue({
    status: "active",
    expiresAt: EXPIRES_AT,
    exchangeId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ScanShareDialog", () => {
  it("opens a scan session for the selected cards and shows the QR code", async () => {
    renderDialog([3, 5])
    await flushCreate()

    expect(apiMocks.createScanSession).toHaveBeenCalledWith([3, 5])
    expect(
      screen.getByRole("img", { name: "扫码交换二维码" })
    ).toBeInTheDocument()
    expect(screen.getByText("等待对方扫码")).toBeVisible()
  })

  it("polls until committed, announces success and refreshes namecard data", async () => {
    apiMocks.sendStatus.mockResolvedValue({
      status: "committed",
      expiresAt: EXPIRES_AT,
      exchangeId: "exchange-1",
    })
    renderDialog()
    await flushCreate()

    expect(apiMocks.sendStatus).not.toHaveBeenCalled()
    const token = "a".repeat(64)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_MS)
    })

    expect(apiMocks.getScanSession).toHaveBeenCalledWith(token)
    expect(toastMocks.success).toHaveBeenCalledWith(EXCHANGE_COMPLETED_MESSAGE)
    expect(refreshMocks.notify).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText(EXCHANGE_COMPLETED_MESSAGE)
    ).toBeVisible()
  })

  it("stops polling and offers a retry when the session expires", async () => {
    apiMocks.sendStatus.mockResolvedValue({
      status: "expired",
      expiresAt: EXPIRES_AT,
      exchangeId: null,
    })
    renderDialog()
    await flushCreate()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_MS)
    })

    expect(toastMocks.error).toHaveBeenCalledWith("这次交换已过期")
    expect(screen.getByText("二维码已过期，请重新生成。")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "重新生成" })
    ).toBeInTheDocument()
  })
})
