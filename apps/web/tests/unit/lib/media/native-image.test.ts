import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  readFile: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: mocks.readFile }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import {
  nativeImageErrorMessage,
  selectNativeImage,
  shouldUseNativeImage,
} from "~/lib/media/native-image"

describe("native image bridge", () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.isTauri.mockReset()
    mocks.isTauri.mockReturnValue(true)
    mocks.readFile.mockReset()
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
    )
  })

  it("uses native preparation only in an iOS Tauri runtime", () => {
    expect(shouldUseNativeImage()).toBe(true)
    mocks.isTauri.mockReturnValue(false)
    expect(shouldUseNativeImage()).toBe(false)
  })

  it("returns null when the system picker is cancelled", async () => {
    mocks.invoke.mockResolvedValue(null)

    await expect(selectNativeImage("platform-avatar")).resolves.toBeNull()
    expect(mocks.invoke).toHaveBeenCalledWith("plugin:native-image|prepare", {
      options: { mediaKind: "platform-avatar" },
    })
  })

  it("exposes only the compressed file returned by the plugin", async () => {
    const descriptor = {
      id: "8c35f44d-24df-4dc5-8cc4-475459052d37",
      filePath: "/cache/native-image/avatar.webp",
      fileName: "avatar.webp",
      mimeType: "image/webp",
      byteLength: 4,
      width: 640,
      height: 640,
      expiresAt: "2026-01-01T00:00:00Z",
    }
    mocks.invoke.mockResolvedValue(descriptor)
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3, 4]))

    const result = await selectNativeImage("platform-avatar")

    expect(mocks.invoke).toHaveBeenCalledWith("plugin:native-image|prepare", {
      options: { mediaKind: "platform-avatar" },
    })
    expect(mocks.readFile).toHaveBeenCalledWith(descriptor.filePath)
    expect(result?.file).toBeInstanceOf(File)
    expect(result?.file.type).toBe("image/webp")
    expect(result?.file.size).toBe(4)
  })

  it("maps native failures to stable user messages", () => {
    expect(nativeImageErrorMessage("native-image-input-too-large")).toContain(
      "分辨率过高"
    )
    expect(nativeImageErrorMessage("native-image-input-invalid")).toContain(
      "无法解码"
    )
  })
})
