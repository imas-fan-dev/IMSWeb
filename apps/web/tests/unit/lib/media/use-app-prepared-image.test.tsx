import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cleanupExpiredNativeImages: vi.fn(),
  releaseNativeImage: vi.fn(),
  selectNativeImage: vi.fn(),
  shouldUseNativeImage: vi.fn(() => true),
}))

vi.mock("~/lib/media/native-image", () => ({
  cleanupExpiredNativeImages: mocks.cleanupExpiredNativeImages,
  nativeImageErrorMessage: () => "图片处理失败，请重新选择后重试。",
  releaseNativeImage: mocks.releaseNativeImage,
  selectNativeImage: mocks.selectNativeImage,
  shouldUseNativeImage: mocks.shouldUseNativeImage,
}))

import { useAppPreparedImage } from "~/lib/media/use-app-prepared-image"

function prepared(id: string) {
  return {
    descriptor: {
      id,
      filePath: `/cache/${id}.webp`,
      fileName: `${id}.webp`,
      mimeType: "image/webp" as const,
      byteLength: 4,
      width: 640,
      height: 640,
      expiresAt: "2026-01-01T00:00:00Z",
    },
    file: new File([new Uint8Array([1, 2, 3, 4])], `${id}.webp`, {
      type: "image/webp",
    }),
  }
}

describe("useAppPreparedImage", () => {
  beforeEach(() => {
    mocks.cleanupExpiredNativeImages.mockReset().mockResolvedValue(undefined)
    mocks.releaseNativeImage.mockReset().mockResolvedValue(undefined)
    mocks.selectNativeImage.mockReset()
    mocks.shouldUseNativeImage.mockReset().mockReturnValue(true)
  })

  it("selects a prepared image and releases it when cleared", async () => {
    const result = prepared("first")
    const onError = vi.fn()
    const onSelected = vi.fn()
    mocks.selectNativeImage.mockResolvedValue(result)
    const { result: hook } = renderHook(() =>
      useAppPreparedImage({
        mediaKind: "platform-avatar",
        validate: () => null,
        onError,
        onSelected,
      })
    )

    await act(async () => hook.current.browse?.())

    expect(hook.current.file).toBe(result.file)
    expect(hook.current.preparing).toBe(false)
    expect(onSelected).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()

    act(() => hook.current.clear())
    expect(hook.current.file).toBeNull()
    expect(mocks.releaseNativeImage).toHaveBeenCalledWith("first")
  })

  it("releases a native result rejected by client validation", async () => {
    mocks.selectNativeImage.mockResolvedValue(prepared("invalid"))
    const onError = vi.fn()
    const { result: hook } = renderHook(() =>
      useAppPreparedImage({
        mediaKind: "platform-avatar",
        validate: () => "图片不能超过 5 MiB。",
        onError,
      })
    )

    await act(async () => hook.current.browse?.())

    expect(hook.current.file).toBeNull()
    expect(mocks.releaseNativeImage).toHaveBeenCalledWith("invalid")
    expect(onError).toHaveBeenCalledWith("图片不能超过 5 MiB。")
  })

  it("keeps the browser file path when native preparation is unavailable", () => {
    mocks.shouldUseNativeImage.mockReturnValue(false)
    const file = new File(["avatar"], "avatar.png", { type: "image/png" })
    const { result: hook } = renderHook(() =>
      useAppPreparedImage({
        mediaKind: "platform-avatar",
        validate: () => null,
        onError: vi.fn(),
      })
    )

    expect(hook.current.browse).toBeUndefined()
    act(() => hook.current.selectFile(file))
    expect(hook.current.file).toBe(file)
  })
})
