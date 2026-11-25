import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScanShareDialog } from "~/components/community/exchange/scan-share-dialog"
import { EXCHANGE_COMPLETED_MESSAGE } from "~/components/community/exchange/use-exchange-submit"

const apiMocks = vi.hoisted(() => ({
  createScanSession: vi.fn(),
  sendCreate: vi.fn(),
  getScanSession: vi.fn(),
  sendStatus: vi.fn(),
  receiveScanChanges: vi.fn(),
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
    receiveScanChanges: apiMocks.receiveScanChanges,
  }
})

vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: () => true,
}))

vi.mock("~/lib/namecards/data-refresh", () => ({
  notifyNamecardDataChanged: refreshMocks.notify,
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

const SCAN_STATUS_POLL_MS = 1_500
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
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
  apiMocks.receiveScanChanges.mockImplementation(
    (_token, signal: AbortSignal) =>
      new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true })
      )
  )
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
  vi.restoreAllMocks()
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
    // 一次性 + 有效期：上海时区到分钟（EXPIRES_AT = 20:00 Asia/Shanghai）。
    const warning = screen.getByText(
      /此二维码仅可交换一次，有效期至 2026-11-19 20:00/
    )
    expect(warning).toBeVisible()
    expect(warning).toHaveClass("text-warning")
  })

  it("reads only on SSE hints when healthy, then announces completion and closes", async () => {
    renderDialog()
    await flushCreate()
    const [token, signal, changed] = apiMocks.receiveScanChanges.mock.calls[0]!
    expect(token).toBe("a".repeat(64))
    await act(async () => changed())
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(1)
    apiMocks.sendStatus.mockResolvedValue({
      status: "committed",
      expiresAt: EXPIRES_AT,
      exchangeId: "exchange-1",
    })
    await act(async () => {
      changed()
      changed()
    })
    expect(apiMocks.getScanSession).toHaveBeenCalledWith(token)
    expect(signal.aborted).toBe(true)
    expect(toastMocks.success).toHaveBeenCalledWith(EXCHANGE_COMPLETED_MESSAGE)
    expect(refreshMocks.notify).toHaveBeenCalledTimes(1)
    expect(screen.getByText(EXCHANGE_COMPLETED_MESSAGE)).toBeVisible()
  })

  it("polls after a stream failure and offers a retry when the session expires", async () => {
    apiMocks.receiveScanChanges.mockResolvedValueOnce(undefined)
    renderDialog()
    await flushCreate()
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(1)
    apiMocks.sendStatus.mockResolvedValue({
      status: "expired",
      expiresAt: EXPIRES_AT,
      exchangeId: null,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_MS)
    })

    expect(toastMocks.error).toHaveBeenCalledWith("这次交换已过期")
    expect(screen.getByText("二维码已过期，请重新生成。")).toBeVisible()
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(2)
    expect(apiMocks.receiveScanChanges).toHaveBeenCalledTimes(1)
  })

  it("stops in the background and reconnects with a fresh snapshot on return", async () => {
    const { unmount } = renderDialog()
    await flushCreate()
    const [, firstSignal, firstHint] =
      apiMocks.receiveScanChanges.mock.calls[0]!
    await act(async () => firstHint())
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(1)

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(firstSignal.aborted).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(1)

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    const [, nextSignal, nextHint] = apiMocks.receiveScanChanges.mock.calls[1]!
    await act(async () => nextHint())
    expect(apiMocks.sendStatus).toHaveBeenCalledTimes(2)
    unmount()
    expect(nextSignal.aborted).toBe(true)
  })
})
