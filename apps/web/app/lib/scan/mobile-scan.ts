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

export class ScanCancelledError extends Error {
  constructor() {
    super("Barcode scan cancelled")
    this.name = "ScanCancelledError"
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

/**
 * 打开系统相机扫一次性二维码，返回令牌文本。
 *
 * 相机由 Tauri 条码插件持有（`windowed: false` 全屏取景），首次使用先要相机权限；
 * 拒绝权限与取消失败分开，前者给可操作的提示，后者由调用方静默收场。
 */
export async function scanExchangeToken(): Promise<string> {
  // 动态导入：插件只在手机 App 运行时有原生实现，静态导入会把它拉进
  // 网页与桌面 App 的初始包；同 `~/lib/geolocation` 的平台模块处理方式一致。
  const scanner = await import("@tauri-apps/plugin-barcode-scanner")

  let permission = await scanner.checkPermissions()
  if (permission !== "granted") {
    permission = await scanner.requestPermissions()
  }
  if (permission !== "granted") throw new ScanPermissionError()

  try {
    const result = await scanner.scan({
      windowed: false,
      formats: [scanner.Format.QRCode],
    })
    return result.content.trim()
  } catch (error) {
    if (isCancellation(error)) throw new ScanCancelledError()
    throw error
  }
}
