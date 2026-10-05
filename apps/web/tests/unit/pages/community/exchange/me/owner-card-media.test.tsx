import { act, renderHook, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  session: { account: { id: "owner" } } as object | null,
  bearer: true,
  load: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}))
vi.mock("~/lib/api/origin", () => ({ API_ORIGIN: "https://api.ims.test" }))
vi.mock("~/lib/api/platform-token-store", () => ({
  get usesPlatformBearerAuth() {
    return mocks.bearer
  },
}))
vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: () => ({
    session: mocks.session,
    status: mocks.session ? "authenticated" : "anonymous",
  }),
}))
vi.mock("~/lib/api/platform-client", () => ({
  platformApiClient: { Get: mocks.load },
}))

import { ownerCardMediaPath } from "~/lib/api/endpoints/fudaba/owner-card-media"
import { useOwnerCardMedia } from "~/pages/community/exchange/me/use-owner-card-media"
import { useObjectUrl } from "~/pages/community/exchange/me/card-editor-fields"

const front =
  "https://api.ims.test/api/community/exchange/me/cards/card-1/media/front?v=3"
const back = front.replace("front", "back")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bearer = true
  mocks.session = { account: { id: "owner" } }
  mocks.create.mockReturnValue("blob:owned")
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.create,
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revoke,
  })
})

describe("owner media credential boundary", () => {
  it("accepts exact API owner routes including revisions and encoded IDs", () => {
    expect(ownerCardMediaPath(front, "https://api.ims.test")).toBe(
      "/api/community/exchange/me/cards/card-1/media/front?v=3"
    )
    expect(
      ownerCardMediaPath(
        "/api/community/exchange/me/cards/%E6%98%A5%E9%A6%99/media/back",
        "https://api.ims.test"
      )
    ).toContain("/media/back")
  })
  it.each([
    "https://evil.test/api/community/exchange/me/cards/card-1/media/front",
    "//evil.test/api/community/exchange/me/cards/card-1/media/front",
    "https://user:secret@api.ims.test/api/community/exchange/me/cards/card-1/media/front",
    "/api/community/exchange/cards/card-1/media/front",
    "/api/community/exchange/me/cards/a%2Fb/media/front",
    "/api/community/exchange/me/cards/a%5Cb/media/front",
    "/api/community/exchange/me/cards/a/media/front?token=secret",
    "/api/community/exchange/me/cards/a/media/front?v=1&v=2",
    "/api/community/exchange/me/cards/a/media/front?v=-1",
    "/api/community/exchange/me/cards/a/media/front?v=1.5",
    "/api/community/exchange/me/cards/a/media/front?v=",
    "/api/community/exchange/me/cards/a/media/front?v=%31",
    "/api/community/exchange/me/cards/a/media/front#fragment",
    "blob:local",
  ])("rejects %s", (source) => {
    expect(ownerCardMediaPath(source, "https://api.ims.test")).toBeNull()
  })
})

describe("private image lifetime", () => {
  it("keeps cancellation independent for StrictMode preview remounts", async () => {
    const aborts: ReturnType<typeof vi.fn>[] = []
    mocks.load.mockImplementation((_path, config) => {
      expect(config.shareRequest).toBe(false)
      const abort = vi.fn()
      aborts.push(abort)
      return { send: () => Promise.resolve(new Blob(["image"])), abort }
    })
    const { result, unmount } = renderHook(() => useOwnerCardMedia(front), {
      wrapper: StrictMode,
    })
    await waitFor(() => expect(result.current.src).toBe("blob:owned"))
    expect(aborts).toHaveLength(2)
    expect(aborts[0]).toHaveBeenCalledOnce()
    expect(aborts[1]).not.toHaveBeenCalled()
    unmount()
    expect(mocks.revoke).toHaveBeenCalledOnce()
  })
  it("releases every local upload URL under StrictMode, replacement and removal", async () => {
    let id = 0
    mocks.create.mockImplementation(() => `blob:upload-${++id}`)
    const first = new File(["front"], "front.png")
    const second = new File(["back"], "back.png")
    const { result, rerender, unmount } = renderHook(
      ({ file }: { file: File | null }) => useObjectUrl(file),
      { initialProps: { file: first as File | null }, wrapper: StrictMode }
    )
    await waitFor(() => expect(result.current).toBe("blob:upload-2"))
    expect(mocks.revoke).toHaveBeenCalledWith("blob:upload-1")
    rerender({ file: second })
    await waitFor(() => expect(result.current).toBe("blob:upload-3"))
    expect(mocks.revoke).toHaveBeenCalledWith("blob:upload-2")
    rerender({ file: null })
    expect(result.current).toBeNull()
    unmount()
    expect(mocks.revoke).toHaveBeenCalledTimes(3)
  })
  it("revokes resolved images on source replacement and logout", async () => {
    const abort = vi.fn()
    mocks.load.mockImplementation(() => ({
      send: () => Promise.resolve(new Blob(["image"])),
      abort,
    }))
    const { result, rerender, unmount } = renderHook(
      ({ src }) => useOwnerCardMedia(src),
      { initialProps: { src: front } }
    )
    await waitFor(() => expect(result.current.src).toBe("blob:owned"))
    rerender({ src: back })
    expect(abort).toHaveBeenCalledTimes(1)
    expect(mocks.revoke).toHaveBeenCalledWith("blob:owned")
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    mocks.session = null
    rerender({ src: back })
    expect(result.current.src).toBeNull()
    expect(mocks.revoke).toHaveBeenCalledTimes(2)
    unmount()
  })
  it("discards late completion after account switch", async () => {
    let resolve!: (blob: Blob) => void
    const abort = vi.fn()
    mocks.load.mockImplementation(() => ({
      send: () =>
        new Promise<Blob>((done) => {
          resolve = done
        }),
      abort,
    }))
    const { result, rerender, unmount } = renderHook(() =>
      useOwnerCardMedia(front)
    )
    const oldResolve = resolve
    mocks.session = { account: { id: "another" } }
    rerender()
    await act(async () => oldResolve(new Blob(["old account"])))
    expect(result.current.src).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(abort).toHaveBeenCalled()
    unmount()
  })
  it("retries a failed load without rendering the protected URL", async () => {
    mocks.load
      .mockReturnValueOnce({
        send: () => Promise.reject(new Error("offline")),
        abort: vi.fn(),
      })
      .mockReturnValueOnce({
        send: () => Promise.resolve(new Blob(["image"])),
        abort: vi.fn(),
      })
    const { result } = renderHook(() => useOwnerCardMedia(front))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.src).toBeNull()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.src).toBe("blob:owned"))
  })
  it("preserves local upload and public URLs without platform requests", () => {
    const { result, rerender } = renderHook(
      ({ src }) => useOwnerCardMedia(src),
      { initialProps: { src: "blob:upload" } }
    )
    expect(result.current.src).toBe("blob:upload")
    rerender({ src: "https://public.test/image.webp" })
    expect(result.current.src).toBe("https://public.test/image.webp")
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it("preserves same-origin Web cookie image delivery", () => {
    mocks.bearer = false
    const { result } = renderHook(() => useOwnerCardMedia(front))
    expect(result.current.src).toBe(front)
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
