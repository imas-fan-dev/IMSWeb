import { invoke, isTauri } from "@tauri-apps/api/core"
import { readFile } from "@tauri-apps/plugin-fs"

import { IS_APP_TARGET } from "~/lib/app-target"
import { isIosRuntimeIdentity } from "~/lib/native-glass"

export type NativeImageKind =
  | "platform-avatar"
  | "fudaba-card-front"
  | "fudaba-card-back"
  | "guest-namecard"

export type PreparedNativeImage = {
  id: string
  filePath: string
  fileName: string
  mimeType: "image/webp"
  byteLength: number
  width: number
  height: number
  expiresAt: string
}

export type NativeImageFile = {
  descriptor: PreparedNativeImage
  file: File
}

export function shouldUseNativeImage(): boolean {
  if (!IS_APP_TARGET || typeof window === "undefined" || !isTauri()) {
    return false
  }

  return isIosRuntimeIdentity({
    maxTouchPoints: window.navigator.maxTouchPoints,
    platform: window.navigator.platform,
    userAgent: window.navigator.userAgent,
  })
}

export async function selectNativeImage(
  mediaKind: NativeImageKind
): Promise<NativeImageFile | null> {
  const descriptor = await invoke<PreparedNativeImage | null>(
    "plugin:native-image|prepare",
    { options: { mediaKind } }
  )
  if (!descriptor) return null

  try {
    const bytes = await readFile(descriptor.filePath)
    const file = new File([bytes], descriptor.fileName, {
      type: descriptor.mimeType,
      lastModified: Date.now(),
    })
    return { descriptor, file }
  } catch (error) {
    await releaseNativeImage(descriptor.id)
    throw error
  }
}

export async function releaseNativeImage(id: string): Promise<void> {
  await invoke("plugin:native-image|release", { options: { id } })
}

export async function cleanupExpiredNativeImages(): Promise<void> {
  await invoke("plugin:native-image|cleanup_expired")
}

export function nativeImageErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("native-image-input-too-large")) {
    return "图片分辨率过高，请选择尺寸较小的图片。"
  }
  if (message.includes("native-image-output-too-large")) {
    return "图片压缩后仍超过上传限制，请选择尺寸较小的图片。"
  }
  if (
    message.includes("native-image-input-invalid") ||
    message.includes("native-image-write-failed")
  ) {
    return "图片内容损坏或无法解码，请选择其他图片。"
  }
  return "图片处理失败，请重新选择后重试。"
}
