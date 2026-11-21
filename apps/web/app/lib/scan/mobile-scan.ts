import { isTauri } from "@tauri-apps/api/core"

import { PUBLIC_SITE_ORIGIN } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import {
  isAndroidRuntimeIdentity,
  isIosRuntimeIdentity,
} from "~/lib/native-glass"

/** 非移动端没有相机通道：入口保留，只给出这句话。 */
export const SCAN_RUNTIME_UNSUPPORTED_MESSAGE = "请在手机 App 内扫码"
export const SCAN_PERMISSION_MESSAGE = "请允许相机权限后再扫码"
export const SCAN_FAILED_MESSAGE = "扫码失败，请重试"
export const SCAN_INVALID_CODE_MESSAGE = "不是有效的名片交换二维码"

export class ScanCancelledError extends Error {
  constructor() {
    super("Barcode scan cancelled")
    this.name = "ScanCancelledError"
  }
}

export class ScanInvalidCodeError extends Error {
  constructor() {
    super("Barcode is not an exchange token")
    this.name = "ScanInvalidCodeError"
  }
}

export class ScanPermissionError extends Error {
  constructor() {
    super("Barcode scan camera permission denied")
    this.name = "ScanPermissionError"
  }
}

/**
 * 只有打包后的手机 App 有相机插件；桌面 App 与网页一律走
 * 「请在手机 App 内扫码」，不引入任何 web 摄像头兜底。
 */
export function isMobileScanRuntime(): boolean {
  if (!IS_APP_TARGET || typeof window === "undefined" || !isTauri()) {
    return false
  }

  return (
    isAndroidRuntimeIdentity(window.navigator.userAgent) ||
    isIosRuntimeIdentity({
      maxTouchPoints: window.navigator.maxTouchPoints,
      platform: window.navigator.platform,
      userAgent: window.navigator.userAgent,
    })
  )
}

/** 插件在用户返回 / 主动取消时以 `cancelled` 拒绝，这里统一识别。 */
function isCancellation(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return /cancelled|canceled/i.test(message)
}

/** 扫码令牌是 32 字节随机数的十六进制形态（服务端 `newScanToken`）。 */
const SCAN_TOKEN_PATTERN = /^[0-9a-f]{64}$/i
/** 单卡分享短链（`namecard_exchange_links.slug`）。 */
const CARD_SHARE_SLUG_PATTERN = /^[a-z0-9]{12}$/
/** 快速清单的 handle：uid、公开主页地址或账号 id，都不带斜杠。 */
const QUICK_HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * 扫到的东西分三类：扫码交换的一次性令牌、单卡分享页、快速清单分享页。
 * 分享页的二维码内容是**本站绝对链接**（分享弹窗里就是这么画的）。
 */
export type ScannedExchangeTarget =
  | { kind: "token"; token: string }
  | { kind: "card-share"; slug: string }
  | { kind: "quick"; handle: string }

function shareSiteOrigin(): string {
  if (PUBLIC_SITE_ORIGIN) return PUBLIC_SITE_ORIGIN
  return typeof window === "undefined" ? "" : window.location.origin
}

/**
 * 把扫描/相册得到的文本归一成交换目标；不是本站二维码时返回 null。
 * 只接受站点根下的 `/exchange/card/<slug>` 与 `/exchange/<handle>`，其它路径一律不认。
 */
export function parseScannedExchangeContent(
  value: string | null
): ScannedExchangeTarget | null {
  const content = (value ?? "").trim()
  if (SCAN_TOKEN_PATTERN.test(content)) return { kind: "token", token: content }
  if (!content) return null

  let url: URL
  try {
    url = new URL(content)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const site = shareSiteOrigin().replace(/\/+$/u, "")
  if (!site || url.origin !== site) return null
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments[0] !== "exchange" || segments.length > 3) return null
  if (segments.length === 3) {
    const [, scope, slug] = segments
    return scope === "card" && CARD_SHARE_SLUG_PATTERN.test(slug)
      ? { kind: "card-share", slug }
      : null
  }
  if (segments.length === 2) {
    const handle = segments[1]
    return QUICK_HANDLE_PATTERN.test(handle) ? { kind: "quick", handle } : null
  }
  return null
}

type Scanner = typeof import("@tauri-apps/plugin-barcode-scanner")

let scannerModule: Promise<Scanner> | undefined

function loadScanner(): Promise<Scanner> {
  // 共享正在加载的模块；导入失败后允许用户重试。
  return (scannerModule ??= import("@tauri-apps/plugin-barcode-scanner").catch(
    (error) => {
      scannerModule = undefined
      throw error
    }
  ))
}

// 原生插件只有一个扫码回调。下一轮要等当前取景结束或 cancel 确认，
// 不能用旧 scan() 是否返回作判断（有的平台取消后不会回调旧请求）。
let cameraReleased: Promise<void> | null = null

async function captureQr(scanner: Scanner, signal?: AbortSignal) {
  let releaseCamera!: () => void
  cameraReleased = new Promise<void>((resolve) => {
    releaseCamera = () => {
      cameraReleased = null
      resolve()
    }
  })

  let cancellation: Promise<void> | undefined
  let rejectOnAbort!: (error: ScanCancelledError) => void
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = reject
  })
  const onAbort = () => {
    cancellation = scanner.cancel()
    rejectOnAbort(new ScanCancelledError())
  }
  signal?.addEventListener("abort", onAbort, { once: true })

  try {
    return await Promise.race([
      scanner.scan({ windowed: true, formats: [scanner.Format.QRCode] }),
      aborted,
    ])
  } finally {
    signal?.removeEventListener("abort", onAbort)
    // 取消由 cancel 的回调释放相机；迟到的 scan 结果不会影响下一轮。
    if (cancellation) void cancellation.then(releaseCamera, releaseCamera)
    else releaseCamera()
  }
}

/**
 * 打开系统相机扫一次二维码，返回交换目标。
 * windowed 模式下原生负责取景，页面负责取景框、关闭和相册。
 * 取消只影响传入该 signal 的这一轮，包括仍在等权限的轮次。
 */
export async function scanExchangeCode(
  signal?: AbortSignal
): Promise<ScannedExchangeTarget> {
  const ensureActive = () => {
    if (signal?.aborted) throw new ScanCancelledError()
  }

  // 动态导入：只有手机 App 有原生实现，不将插件拉入其它平台的初始包。
  try {
    ensureActive()
    const scanner = await loadScanner()
    ensureActive()
    let permission = await scanner.checkPermissions()
    ensureActive()
    if (permission !== "granted") {
      permission = await scanner.requestPermissions()
      ensureActive()
    }
    if (permission !== "granted") throw new ScanPermissionError()

    while (cameraReleased) {
      await cameraReleased
      ensureActive()
    }

    const result = await captureQr(scanner, signal)
    ensureActive()
    if (result.format && result.format !== "QR_CODE") {
      throw new ScanInvalidCodeError()
    }
    const target = parseScannedExchangeContent(result.content)
    if (!target) throw new ScanInvalidCodeError()
    return target
  } catch (error) {
    if (signal?.aborted || isCancellation(error)) throw new ScanCancelledError()
    throw error
  }
}

/** 相册图片里的二维码文本；不是本站交换二维码时返回 null。 */
export function exchangeTargetFromText(
  value: string | null
): ScannedExchangeTarget | null {
  return parseScannedExchangeContent(value)
}
