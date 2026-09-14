import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
  getPlatformAvatar: vi.fn(),
  isManagedPlatformAvatarUrl: vi.fn(),
}))

vi.mock("~/lib/api", () => ({
  getPlatformAvatar: apiMocks.getPlatformAvatar,
  isManagedPlatformAvatarUrl: apiMocks.isManagedPlatformAvatarUrl,
}))

import { usePlatformAvatarSource } from "~/components/platform/use-platform-avatar-source"

type AvatarMethod = {
  abort: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function deferredBlobMethod() {
  let resolvePromise!: (blob: Blob) => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<Blob>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  const method: AvatarMethod = {
    abort: vi.fn(),
    send: vi.fn(() => promise),
  }
  return {
    method,
    resolve: (blob: Blob) => resolvePromise(blob),
    reject: (error: unknown) => rejectPromise(error),
  }
}

describe("usePlatformAvatarSource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:avatar-1")
      .mockReturnValueOnce("blob:avatar-2")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps ordinary Web and external OAuth avatar URLs direct", () => {
    apiMocks.isManagedPlatformAvatarUrl.mockReturnValue(false)
    const { result, rerender } = renderHook(
      ({ avatarUrl }) => usePlatformAvatarSource(avatarUrl),
      { initialProps: { avatarUrl: "/api/platform/me/avatar?v=1" } }
    )

    expect(result.current).toBe("/api/platform/me/avatar?v=1")
    rerender({ avatarUrl: "https://oauth.example.test/avatar.png" })
    expect(result.current).toBe("https://oauth.example.test/avatar.png")
    expect(apiMocks.getPlatformAvatar).not.toHaveBeenCalled()
  })

  it("loads managed avatars as Blob URLs and revokes each replacement", async () => {
    apiMocks.isManagedPlatformAvatarUrl.mockReturnValue(true)
    const first = deferredBlobMethod()
    const second = deferredBlobMethod()
    apiMocks.getPlatformAvatar
      .mockReturnValueOnce(first.method)
      .mockReturnValueOnce(second.method)

    const hook = renderHook(
      ({ avatarUrl }) => usePlatformAvatarSource(avatarUrl),
      {
        initialProps: {
          avatarUrl: "https://api.example.test/api/platform/me/avatar?v=1",
        },
      }
    )
    expect(hook.result.current).toBeNull()
    await waitFor(() => expect(first.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      first.resolve(new Blob(["first"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-1")

    hook.rerender({
      avatarUrl: "https://api.example.test/api/platform/me/avatar?v=2",
    })
    expect(hook.result.current).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-1")
    await waitFor(() => expect(second.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      second.resolve(new Blob(["second"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-2")

    hook.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-2")
  })

  it("does not reuse a revoked Blob URL after returning from a direct URL", async () => {
    apiMocks.isManagedPlatformAvatarUrl.mockImplementation((avatarUrl) =>
      avatarUrl?.startsWith("https://api.example.test/")
    )
    const first = deferredBlobMethod()
    const replacement = deferredBlobMethod()
    apiMocks.getPlatformAvatar
      .mockReturnValueOnce(first.method)
      .mockReturnValueOnce(replacement.method)

    const managedUrl = "https://api.example.test/api/platform/me/avatar?v=1"
    const hook = renderHook(
      ({ avatarUrl }) => usePlatformAvatarSource(avatarUrl),
      { initialProps: { avatarUrl: managedUrl } }
    )
    await waitFor(() => expect(first.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      first.resolve(new Blob(["first"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-1")

    hook.rerender({
      avatarUrl: "https://oauth.example.test/avatar.png",
    })
    expect(hook.result.current).toBe("https://oauth.example.test/avatar.png")
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-1")

    hook.rerender({ avatarUrl: managedUrl })
    expect(hook.result.current).toBeNull()
    await waitFor(() => expect(replacement.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      replacement.resolve(new Blob(["replacement"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-2")
  })

  it("replaces a managed Blob when the account changes at the same URL", async () => {
    apiMocks.isManagedPlatformAvatarUrl.mockReturnValue(true)
    const first = deferredBlobMethod()
    const second = deferredBlobMethod()
    apiMocks.getPlatformAvatar
      .mockReturnValueOnce(first.method)
      .mockReturnValueOnce(second.method)

    const managedUrl = "https://api.example.test/api/platform/me/avatar?v=1"
    const hook = renderHook(
      ({ accountId }) => usePlatformAvatarSource(managedUrl, accountId),
      { initialProps: { accountId: "platform-1" } }
    )
    await waitFor(() => expect(first.method.send).toHaveBeenCalledOnce())
    await act(async () => {
      first.resolve(new Blob(["first"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-1")

    hook.rerender({ accountId: "platform-2" })
    expect(hook.result.current).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-1")
    await waitFor(() => expect(second.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      second.resolve(new Blob(["second"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-2")
  })

  it("aborts obsolete requests and ignores their late responses", async () => {
    apiMocks.isManagedPlatformAvatarUrl.mockReturnValue(true)
    const first = deferredBlobMethod()
    const second = deferredBlobMethod()
    apiMocks.getPlatformAvatar
      .mockReturnValueOnce(first.method)
      .mockReturnValueOnce(second.method)

    const hook = renderHook(
      ({ avatarUrl }) => usePlatformAvatarSource(avatarUrl),
      {
        initialProps: {
          avatarUrl: "https://api.example.test/api/platform/me/avatar?v=1",
        },
      }
    )
    await waitFor(() => expect(first.method.send).toHaveBeenCalledOnce())
    hook.rerender({
      avatarUrl: "https://api.example.test/api/platform/me/avatar?v=2",
    })

    expect(first.method.abort).toHaveBeenCalledOnce()
    await waitFor(() => expect(second.method.send).toHaveBeenCalledOnce())
    await act(async () => {
      first.resolve(new Blob(["stale"], { type: "image/webp" }))
    })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(hook.result.current).toBeNull()

    await act(async () => {
      second.resolve(new Blob(["current"], { type: "image/webp" }))
    })
    expect(hook.result.current).toBe("blob:avatar-1")
  })

  it("keeps the fallback on failure and aborts a pending unmount", async () => {
    apiMocks.isManagedPlatformAvatarUrl.mockReturnValue(true)
    const failed = deferredBlobMethod()
    apiMocks.getPlatformAvatar.mockReturnValueOnce(failed.method)
    const failure = renderHook(() =>
      usePlatformAvatarSource(
        "https://api.example.test/api/platform/me/avatar?v=1"
      )
    )
    await waitFor(() => expect(failed.method.send).toHaveBeenCalledOnce())

    await act(async () => {
      failed.reject(new Error("offline"))
    })
    await waitFor(() => expect(failure.result.current).toBeNull())
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    failure.unmount()

    const pending = deferredBlobMethod()
    apiMocks.getPlatformAvatar.mockReturnValueOnce(pending.method)
    const unmounted = renderHook(() =>
      usePlatformAvatarSource(
        "https://api.example.test/api/platform/me/avatar?v=2"
      )
    )
    await waitFor(() => expect(pending.method.send).toHaveBeenCalledOnce())
    unmounted.unmount()
    expect(pending.method.abort).toHaveBeenCalledOnce()

    await act(async () => {
      pending.resolve(new Blob(["late"], { type: "image/webp" }))
    })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
