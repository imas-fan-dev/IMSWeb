import { isTauri } from "@tauri-apps/api/core"

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
 * **不要传 `formats`**：2.5.x 的 Android 实现把 `[QR_CODE]` 映射成 `[0]` 再交给
 * MLKit，扫描器创建失败，表现为「相机开着但永远不解码」。不传时走全格式分支，
 * 返回后再在这里过滤。
 */
export async function scanExchangeToken(): Promise<string> {
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
    const content = result.content.trim()
    if (!SCAN_TOKEN_PATTERN.test(content)) throw new ScanInvalidCodeError()
    return content
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

/** 相册图片里的二维码文本；识别不到或不是交换令牌时返回 null。 */
export function exchangeTokenFromText(value: string | null): string | null {
  const content = (value ?? "").trim()
  return SCAN_TOKEN_PATTERN.test(content) ? content : null
}
