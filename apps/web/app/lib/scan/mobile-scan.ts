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

/**
 * 正在取景的插件模块。取消要在**同一个**模块实例上调用：另起一次 `import()`
 * 在测试替身与打包环境里可能落到不同实例，取消就丢了。
 */
let activeScanner: typeof import("@tauri-apps/plugin-barcode-scanner") | null =
  null
/** 取景还没真正开始（权限对话框期间）就收到取消请求。 */
let cancelRequested = false

/**
 * 打开系统相机扫一次性二维码，返回令牌文本。
 *
 * 相机由 Tauri 条码插件持有；`windowed: true` 让插件把 WebView 背景透明、相机画面
 * 垫在后面，页面自己画取景框/关闭/相册。首次使用先要相机权限；拒绝权限与取消
 * 失败分开，前者给可操作的提示，后者由调用方静默收场。
 *
 * 返回的不只是令牌：单卡/快速清单分享二维码也能扫，见 `parseScannedExchangeContent`。
 *
 * **不要传 `formats`**：2.5.x 的 Android 实现把 `[QR_CODE]` 映射成 `[0]` 再交给
 * MLKit，扫描器创建失败，表现为「相机开着但永远不解码」。不传时走全格式分支，
 * 返回后再在这里过滤。
 */
export async function scanExchangeCode(): Promise<ScannedExchangeTarget> {
  cancelRequested = false
  // 动态导入：插件只在手机 App 运行时有原生实现，静态导入会把它拉进
  // 网页与桌面 App 的初始包；同 `~/lib/geolocation` 的平台模块处理方式一致。
  const scanner = await import("@tauri-apps/plugin-barcode-scanner")

  let permission = await scanner.checkPermissions()
  if (permission !== "granted") {
    permission = await scanner.requestPermissions()
  }
  if (permission !== "granted") throw new ScanPermissionError()
  // 权限弹窗期间可能已经切到相册 / 关窗：不要再把相机打开。
  if (cancelRequested) {
    cancelRequested = false
    throw new ScanCancelledError()
  }

  activeScanner = scanner
  try {
    const result = await scanner.scan({ windowed: true })
    if (result.format && result.format !== "QR_CODE") {
      throw new ScanInvalidCodeError()
    }
    const target = parseScannedExchangeContent(result.content)
    if (!target) throw new ScanInvalidCodeError()
    return target
  } catch (error) {
    if (error instanceof ScanInvalidCodeError) throw error
    if (isCancellation(error)) throw new ScanCancelledError()
    throw error
  } finally {
    activeScanner = null
  }
}

/** 关闭原生取景；没有在扫时插件会抛错，这里一并吞掉。 */
export async function cancelExchangeScan(): Promise<void> {
  cancelRequested = true
  try {
    await activeScanner?.cancel()
  } catch {
    // 已经结束或平台不支持：调用方只关心「别再取景」。
  }
}

/** 相册图片里的二维码文本；不是本站交换二维码时返回 null。 */
export function exchangeTargetFromText(
  value: string | null
): ScannedExchangeTarget | null {
  return parseScannedExchangeContent(value)
}
