import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ScanExchangeDialog } from "~/components/community/exchange/scan-exchange-dialog"
import { EXCHANGE_COMPLETED_MESSAGE } from "~/components/community/exchange/use-exchange-submit"
import { ApiError } from "~/lib/api"

const runtime = vi.hoisted(() => ({ app: true, tauri: true }))

vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return runtime.app
  },
}))
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => runtime.tauri,
}))

const scannerMocks = vi.hoisted(() => ({
  scan: vi.fn(),
  cancel: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-barcode-scanner", () => ({
  Format: { QRCode: "QR_CODE" },
  scan: scannerMocks.scan,
  cancel: scannerMocks.cancel,
  checkPermissions: scannerMocks.checkPermissions,
  requestPermissions: scannerMocks.requestPermissions,
}))

const apiMocks = vi.hoisted(() => ({
  commitScanSession: vi.fn(),
  commitCardShare: vi.fn(),
  commitQuickExchange: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    commitScanSession: apiMocks.commitScanSession,
    commitCardShare: apiMocks.commitCardShare,
    commitQuickExchange: apiMocks.commitQuickExchange,
  }
})

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const refreshMocks = vi.hoisted(() => ({ notify: vi.fn() }))

const queueMocks = vi.hoisted(() => ({ enqueue: vi.fn() }))

vi.mock("sonner", () => ({ toast: toastMocks }))
vi.mock("~/lib/namecards/data-refresh", () => ({
  notifyNamecardDataChanged: refreshMocks.notify,
}))
vi.mock("~/lib/namecards/scan-exchange-queue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/lib/namecards/scan-exchange-queue")>()
  return {
    ...actual,
    scanExchangeQueue: {
      ...actual.scanExchangeQueue,
      enqueue: queueMocks.enqueue,
    },
  }
})
const qrMocks = vi.hoisted(() => ({ decode: vi.fn() }))
vi.mock("~/lib/scan/qr-image", () => ({
  decodeQrFromImage: qrMocks.decode,
}))

vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: () => true,
}))

const TOKEN = "b".repeat(64)
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)"
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
const COMPLETED_RESULT = {
  exchangeId: "exchange-1",
  status: "completed",
  targetCardNumbers: [9],
  initiatorCardNumbers: [3, 5],
  skipped: [],
  targetMissingCount: 0,
}

function renderDialog(onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...render(
      <ScanExchangeDialog
        open
        onOpenChange={onOpenChange}
        cardNumbers={[3, 5]}
      />
    ),
  }
}

function setUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  runtime.app = true
  runtime.tauri = true
  setUserAgent(IPHONE_UA)
  scannerMocks.checkPermissions.mockResolvedValue("granted")
  scannerMocks.requestPermissions.mockResolvedValue("granted")
  scannerMocks.scan.mockResolvedValue({ content: TOKEN, format: "QR_CODE" })
  scannerMocks.cancel.mockResolvedValue(undefined)
  apiMocks.commitScanSession.mockResolvedValue(COMPLETED_RESULT)
  queueMocks.enqueue.mockResolvedValue({ id: "queued-1" })
})

describe("ScanExchangeDialog", () => {
  it("scans a QR token and commits the cards picked for this exchange", async () => {
    renderDialog()

    await waitFor(() =>
      expect(scannerMocks.scan).toHaveBeenCalledWith({
        windowed: true,
        formats: ["QR_CODE"],
      })
    )
    await waitFor(() =>
      expect(apiMocks.commitScanSession).toHaveBeenCalledWith(TOKEN, {
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )

    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        EXCHANGE_COMPLETED_MESSAGE
      )
    )
    expect(refreshMocks.notify).toHaveBeenCalledTimes(1)
    expect(screen.getByText("交换完成，名片已放进你的名片册")).toBeVisible()
  })

  it("opens one camera and submits its result after the scan effect reruns", async () => {
    const camera = Promise.withResolvers<{ content: string; format: string }>()
    scannerMocks.scan.mockReturnValue(camera.promise)

    render(
      <StrictMode>
        <ScanExchangeDialog open onOpenChange={vi.fn()} cardNumbers={[3, 5]} />
      </StrictMode>
    )
    await waitFor(() => expect(scannerMocks.scan).toHaveBeenCalledTimes(1))
    camera.resolve({ content: TOKEN, format: "QR_CODE" })

    expect(await screen.findByText(EXCHANGE_COMPLETED_MESSAGE)).toBeVisible()
    expect(scannerMocks.scan).toHaveBeenCalledTimes(1)
    expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
  })

  it("does not let an old permission response start a second scan", async () => {
    const permission = Promise.withResolvers<string>()
    const camera = Promise.withResolvers<{ content: string; format: string }>()
    scannerMocks.checkPermissions.mockReturnValueOnce(permission.promise)
    scannerMocks.scan.mockReturnValue(camera.promise)
    const first = renderDialog()
    await waitFor(() =>
      expect(scannerMocks.checkPermissions).toHaveBeenCalledTimes(1)
    )

    first.unmount()
    renderDialog()
    await waitFor(() => expect(scannerMocks.scan).toHaveBeenCalledTimes(1))
    await act(async () => permission.resolve("granted"))
    expect(scannerMocks.scan).toHaveBeenCalledTimes(1)
    expect(scannerMocks.cancel).not.toHaveBeenCalled()

    camera.resolve({ content: TOKEN, format: "QR_CODE" })
    expect(await screen.findByText(EXCHANGE_COMPLETED_MESSAGE)).toBeVisible()
    expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
  })

  it("waits for cancellation before opening the camera again", async () => {
    const stopping = Promise.withResolvers<void>()
    scannerMocks.cancel.mockReturnValueOnce(stopping.promise)
    scannerMocks.scan.mockReturnValueOnce(new Promise(() => {}))
    const first = renderDialog()
    await waitFor(() => expect(scannerMocks.scan).toHaveBeenCalledTimes(1))

    first.unmount()
    renderDialog()
    await act(async () => {})
    expect(scannerMocks.cancel).toHaveBeenCalledTimes(1)
    expect(scannerMocks.scan).toHaveBeenCalledTimes(1)

    stopping.resolve()
    expect(await screen.findByText(EXCHANGE_COMPLETED_MESSAGE)).toBeVisible()
    expect(scannerMocks.scan).toHaveBeenCalledTimes(2)
    expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
  })

  it("treats a cancelled scan as a quiet exit and commits nothing", async () => {
    scannerMocks.scan.mockRejectedValue("cancelled")
    const { onOpenChange } = renderDialog()

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it("submits a token decoded from an album image", async () => {
    scannerMocks.scan.mockReturnValue(new Promise(() => {}))
    qrMocks.decode.mockResolvedValue(TOKEN)
    renderDialog()

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    const file = new File(["fake"], "code.png", { type: "image/png" })
    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() =>
      expect(apiMocks.commitScanSession).toHaveBeenCalledWith(TOKEN, {
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )
    expect(
      await screen.findByText("交换完成，名片已放进你的名片册")
    ).toBeVisible()
  })

  it("ignores a late camera result after handing off to the album", async () => {
    const camera = Promise.withResolvers<{ content: string; format: string }>()
    const album = Promise.withResolvers<string>()
    const albumToken = "c".repeat(64)
    scannerMocks.scan.mockReturnValue(camera.promise)
    qrMocks.decode.mockReturnValue(album.promise)
    renderDialog()
    await waitFor(() => expect(scannerMocks.scan).toHaveBeenCalledTimes(1))

    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["fake"], "code.png", { type: "image/png" })],
      },
    })
    await act(async () => camera.resolve({ content: TOKEN, format: "QR_CODE" }))
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()

    album.resolve(albumToken)
    expect(await screen.findByText(EXCHANGE_COMPLETED_MESSAGE)).toBeVisible()
    expect(apiMocks.commitScanSession).toHaveBeenCalledExactlyOnceWith(
      albumToken,
      {
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      }
    )
  })

  it("rejects an album image without a valid exchange code", async () => {
    scannerMocks.scan.mockReturnValue(new Promise(() => {}))
    qrMocks.decode.mockResolvedValue("https://example.com/not-a-token")
    renderDialog()

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    fireEvent.change(input!, {
      target: { files: [new File(["fake"], "x.png", { type: "image/png" })] },
    })

    expect(await screen.findByText("不是有效的名片交换二维码")).toBeVisible()
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
  })

  it("treats a share-link QR as the exchange target", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: `${window.location.origin}/exchange/zheizhei`,
      format: "QR_CODE",
    })
    apiMocks.commitQuickExchange.mockResolvedValue(COMPLETED_RESULT)
    renderDialog()

    await waitFor(() =>
      expect(apiMocks.commitQuickExchange).toHaveBeenCalledWith("zheizhei", {
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )
    expect(
      await screen.findByText("交换完成，名片已放进你的名片册")
    ).toBeVisible()
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
  })

  it("queues a share-link network failure for the history list", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: `${window.location.origin}/exchange/zheizhei`,
      format: "QR_CODE",
    })
    apiMocks.commitQuickExchange.mockRejectedValue(
      new ApiError("网络请求失败", { kind: "network" })
    )
    renderDialog()

    await waitFor(() =>
      expect(queueMocks.enqueue).toHaveBeenCalledWith({
        target: { kind: "quick", handle: "zheizhei" },
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )
    expect(
      await screen.findByText("已保存到本地，联网后自动重试")
    ).toBeVisible()
  })

  it("submits a single-card share QR through its own endpoint", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: `${window.location.origin}/exchange/card/abcdef123456`,
      format: "QR_CODE",
    })
    apiMocks.commitCardShare.mockResolvedValue(COMPLETED_RESULT)
    renderDialog()

    await waitFor(() =>
      expect(apiMocks.commitCardShare).toHaveBeenCalledWith("abcdef123456", {
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )
  })

  it("closes the overlay on a right swipe", async () => {
    scannerMocks.scan.mockReturnValue(new Promise(() => {}))
    const { onOpenChange } = renderDialog()

    const overlay = await screen.findByRole("dialog", { name: "扫码" })
    fireEvent.pointerDown(overlay, { clientX: 40 })
    fireEvent.pointerUp(overlay, { clientX: 160 })

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("does not open a camera on desktop and points at the phone app", async () => {
    setUserAgent(WINDOWS_UA)
    renderDialog()

    expect(await screen.findByText("请在手机 App 内扫码")).toBeVisible()
    expect(scannerMocks.scan).not.toHaveBeenCalled()
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
  })

  it("asks for camera permission before scanning", async () => {
    scannerMocks.checkPermissions.mockResolvedValue("prompt")
    renderDialog()

    await waitFor(() => expect(scannerMocks.scan).toHaveBeenCalled())
    expect(scannerMocks.requestPermissions).toHaveBeenCalledTimes(1)
  })

  it("shows a permission hint when the camera stays denied", async () => {
    scannerMocks.checkPermissions.mockResolvedValue("denied")
    scannerMocks.requestPermissions.mockResolvedValue("denied")
    renderDialog()

    expect(await screen.findByText("请允许相机权限后再扫码")).toBeVisible()
    expect(scannerMocks.scan).not.toHaveBeenCalled()
  })

  it("surfaces the backend message when the commit fails", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("二维码已失效，请让对方重新生成", {
        kind: "business",
        status: 409,
      })
    )
    renderDialog()

    expect(
      await screen.findByText("二维码已失效，请让对方重新生成")
    ).toBeVisible()
    expect(toastMocks.error).toHaveBeenCalledWith(
      "二维码已失效，请让对方重新生成"
    )
    // 业务错误再扫一次也没用，不进离线队列。
    expect(queueMocks.enqueue).not.toHaveBeenCalled()
  })

  it("keeps a network failure in the offline queue and says so", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("网络请求失败", { kind: "network" })
    )
    renderDialog()

    expect(
      await screen.findByText("已保存到本地，联网后自动重试")
    ).toBeVisible()
    await waitFor(() =>
      expect(queueMocks.enqueue).toHaveBeenCalledWith({
        target: { kind: "token", token: TOKEN },
        clientExchangeId: expect.any(String),
        giveCardNumbers: [3, 5],
      })
    )
    // 入队后不再弹「交换失败，请重试」的兜底提示。
    expect(toastMocks.error).not.toHaveBeenCalled()
  })
})
