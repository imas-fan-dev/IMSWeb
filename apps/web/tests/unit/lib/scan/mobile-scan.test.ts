import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  isMobileScanRuntime,
  ScanCancelledError,
  ScanInvalidCodeError,
  ScanPermissionError,
  SCAN_FAILED_MESSAGE,
  SCAN_RUNTIME_UNSUPPORTED_MESSAGE,
  scanExchangeCode,
} from "~/lib/scan/mobile-scan"

const runtime = vi.hoisted(() => ({ app: true, tauri: true }))

vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return runtime.app
  },
}))
vi.mock("~/lib/api/origin", () => ({ PUBLIC_SITE_ORIGIN: "https://ims.test" }))
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

const TOKEN = "b".repeat(64)

function setUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)
}

function setPlatform(platform: string) {
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform)
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.app = true
  runtime.tauri = true
  setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")
  setPlatform("iPhone")
  scannerMocks.checkPermissions.mockResolvedValue("granted")
  scannerMocks.requestPermissions.mockResolvedValue("granted")
  scannerMocks.scan.mockResolvedValue({ content: TOKEN, format: "QR_CODE" })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("isMobileScanRuntime", () => {
  it.each([
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)", true],
    ["Android", "Mozilla/5.0 (Linux; Android 16)", true],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", false],
  ])("gates %s", (_name, userAgent, mobile) => {
    setUserAgent(userAgent)
    expect(isMobileScanRuntime()).toBe(mobile)
  })

  it("requires both the App target and the Tauri runtime", () => {
    runtime.app = false
    expect(isMobileScanRuntime()).toBe(false)
    runtime.app = true
    runtime.tauri = false
    expect(isMobileScanRuntime()).toBe(false)
  })

  it("keeps the desktop hint text stable", () => {
    expect(SCAN_RUNTIME_UNSUPPORTED_MESSAGE).toBe("请在手机 App 内扫码")
  })
})

describe("scanExchangeCode", () => {
  it("opens the windowed camera without a formats list and returns the token", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: `  ${TOKEN}\n`,
      format: "QR_CODE",
    })

    await expect(scanExchangeCode()).resolves.toEqual({
      kind: "token",
      token: TOKEN,
    })
    // 不能传 formats：Android 的 mapFormats 会把 [QR_CODE] 变成 [0]，MLKit 建 scanner 失败。
    expect(scannerMocks.scan).toHaveBeenCalledWith({ windowed: true })
    expect(scannerMocks.requestPermissions).not.toHaveBeenCalled()
  })

  it("rejects a non-QR symbol without touching the commit path", async () => {
    scannerMocks.scan.mockResolvedValue({ content: "1234567890", format: "EAN_13" })

    await expect(scanExchangeCode()).rejects.toBeInstanceOf(ScanInvalidCodeError)
  })

  it("rejects a QR code from another site", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: "https://example.com/",
      format: "QR_CODE",
    })

    await expect(scanExchangeCode()).rejects.toBeInstanceOf(
      ScanInvalidCodeError
    )
  })

  it("recognizes a single-card share link", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: "https://ims.test/exchange/card/abcdef123456",
      format: "QR_CODE",
    })

    await expect(scanExchangeCode()).resolves.toEqual({
      kind: "card-share",
      slug: "abcdef123456",
    })
  })

  it("recognizes a quick-list share link", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: "https://ims.test/exchange/zheizhei",
      format: "QR_CODE",
    })

    await expect(scanExchangeCode()).resolves.toEqual({
      kind: "quick",
      handle: "zheizhei",
    })
  })

  it("does not accept other site paths", async () => {
    scannerMocks.scan.mockResolvedValue({
      content: "https://ims.test/user/6",
      format: "QR_CODE",
    })

    await expect(scanExchangeCode()).rejects.toBeInstanceOf(
      ScanInvalidCodeError
    )
  })

  it("asks for camera permission before opening the camera", async () => {
    scannerMocks.checkPermissions.mockResolvedValue("prompt")

    await expect(scanExchangeCode()).resolves.toEqual({
      kind: "token",
      token: TOKEN,
    })
    expect(scannerMocks.requestPermissions).toHaveBeenCalledTimes(1)
    expect(scannerMocks.scan).toHaveBeenCalledTimes(1)
  })

  it("fails with a permission error when the camera request is denied", async () => {
    scannerMocks.checkPermissions.mockResolvedValue("denied")
    scannerMocks.requestPermissions.mockResolvedValue("denied")

    await expect(scanExchangeCode()).rejects.toBeInstanceOf(
      ScanPermissionError
    )
    expect(scannerMocks.scan).not.toHaveBeenCalled()
  })

  it("maps a cancelled scan to ScanCancelledError", async () => {
    scannerMocks.scan.mockRejectedValue("cancelled")

    await expect(scanExchangeCode()).rejects.toBeInstanceOf(
      ScanCancelledError
    )
  })

  it("keeps other camera failures as-is", async () => {
    scannerMocks.scan.mockRejectedValue("No camera available on this device")

    await expect(scanExchangeCode()).rejects.toBe(
      "No camera available on this device"
    )
    expect(SCAN_FAILED_MESSAGE).toBe("扫码失败，请重试")
  })
})
