import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Namecard, NamecardPage } from "~/lib/api"
import { useNamecardPreviewNavigation } from "~/pages/community/hooks/use-namecard-preview-navigation"

const api = vi.hoisted(() => ({ getNamecardPage: vi.fn(), send: vi.fn() }))
vi.mock("~/lib/api", () => ({ getNamecardPage: api.getNamecardPage }))

function card(id: number): Namecard {
  return {
    id,
    seriesCode: null,
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    image1_url: `/front-${id}.jpg`,
    image2_url: `/back-${id}.jpg`,
    image1_thumbnail_url: `/front-${id}-thumbnail.jpg`,
    image2_thumbnail_url: `/back-${id}-thumbnail.jpg`,
  }
}

function page(ids: number[], totalPage = 3): NamecardPage {
  return { list: ids.map(card), total: totalPage * 2, totalPage }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function setup(index = 0, currentPage = 2) {
  const hook = renderHook(
    ({ context }) => useNamecardPreviewNavigation(context),
    { initialProps: { context: "page=2&size=2" } }
  )
  act(() =>
    hook.result.current.open({
      page: currentPage,
      pageSize: 2,
      result: page([3, 4]),
      index,
      side: "back",
    })
  )
  return hook
}

describe("useNamecardPreviewNavigation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getNamecardPage.mockReturnValue({ send: api.send })
  })

  it("moves both ways within the page and resets to front without requesting data", () => {
    const { result } = setup()
    expect(result.current.card?.id).toBe(3)
    expect(result.current.side).toBe("back")
    act(() => result.current.navigation?.onNext())
    expect(result.current.card?.id).toBe(4)
    expect(result.current.side).toBe("front")
    expect(result.current.navigation?.position).toBe(4)
    act(() => result.current.changeSide("back"))
    act(() => result.current.navigation?.onPrevious())
    expect(result.current.card?.id).toBe(3)
    expect(result.current.side).toBe("front")
    expect(api.send).not.toHaveBeenCalled()
  })

  it("fetches forward across a boundary and backwards to the previous page's last card", async () => {
    const { result } = setup(1)
    api.send
      .mockResolvedValueOnce(page([5, 6]))
      .mockResolvedValueOnce(page([3, 4]))
    await act(async () => result.current.navigation?.onNext())
    expect(api.getNamecardPage).toHaveBeenLastCalledWith(3, 2)
    expect(result.current.card?.id).toBe(5)
    expect(result.current.navigation?.position).toBe(5)
    expect(result.current.side).toBe("front")
    await act(async () => result.current.navigation?.onPrevious())
    expect(api.getNamecardPage).toHaveBeenLastCalledWith(2, 2)
    expect(result.current.card?.id).toBe(4)
    expect(result.current.navigation?.position).toBe(4)
  })

  it("fetches backwards first and then forwards using the viewer page, not the original page", async () => {
    const { result } = setup()
    api.send
      .mockResolvedValueOnce(page([1, 2]))
      .mockResolvedValueOnce(page([3, 4]))
    await act(async () => result.current.navigation?.onPrevious())
    expect(api.getNamecardPage).toHaveBeenLastCalledWith(1, 2)
    expect(result.current.card?.id).toBe(2)
    await act(async () => result.current.navigation?.onNext())
    expect(api.getNamecardPage).toHaveBeenLastCalledWith(2, 2)
    expect(result.current.card?.id).toBe(3)
  })

  it("never wraps at either global boundary", () => {
    const { result } = setup(0, 1)
    expect(result.current.navigation?.canPrevious).toBe(false)
    act(() => result.current.navigation?.onPrevious())
    expect(result.current.card?.id).toBe(3)
    act(() =>
      result.current.open({
        result: page([5, 6]),
        page: 3,
        pageSize: 2,
        index: 1,
        side: "front",
      })
    )
    expect(result.current.navigation?.canNext).toBe(false)
    act(() => result.current.navigation?.onNext())
    expect(result.current.card?.id).toBe(6)
    expect(api.send).not.toHaveBeenCalled()
  })

  it("locks duplicate and reverse navigation synchronously while keeping the card and side controls", async () => {
    const pending = deferred<NamecardPage>()
    api.send.mockReturnValue(pending.promise)
    const { result } = setup(1)
    const navigation = result.current.navigation!
    act(() => {
      navigation.onNext()
      navigation.onNext()
      navigation.onPrevious()
      navigation.onRetry()
    })
    expect(api.send).toHaveBeenCalledOnce()
    expect(result.current.navigation?.pending).toBe(true)
    expect(result.current.card?.id).toBe(4)
    expect(result.current.side).toBe("back")
    act(() => result.current.changeSide("front"))
    expect(result.current.side).toBe("front")
    await act(async () => pending.resolve(page([5, 6])))
    expect(result.current.navigation?.pending).toBe(false)
    expect(result.current.card?.id).toBe(5)
  })

  it.each([-1, 1] as const)(
    "retries a failed request in direction %s without losing the displayed side",
    async (direction) => {
      const { result } = setup(direction === 1 ? 1 : 0)
      api.send
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(page(direction === 1 ? [5, 6] : [1, 2]))
      await act(async () =>
        direction === 1
          ? result.current.navigation?.onNext()
          : result.current.navigation?.onPrevious()
      )
      expect(result.current.navigation?.error).toBe(
        "暂时无法读取名片，请重试。"
      )
      expect(result.current.navigation?.pending).toBe(false)
      expect(result.current.card?.id).toBe(direction === 1 ? 4 : 3)
      expect(result.current.side).toBe("back")
      await act(async () => result.current.navigation?.onRetry())
      expect(api.getNamecardPage).toHaveBeenLastCalledWith(
        direction === 1 ? 3 : 1,
        2
      )
      expect(result.current.card?.id).toBe(direction === 1 ? 5 : 2)
      expect(result.current.navigation?.error).toBeNull()
    }
  )

  it.each([page([], 2), page([5], 2)])(
    "keeps the current image for an empty or now-out-of-range response",
    async (response) => {
      const { result } = setup(1)
      api.send
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(page([5], 3))
      await act(async () => result.current.navigation?.onNext())
      expect(result.current.card?.id).toBe(4)
      expect(result.current.navigation?.error).toBe(
        "这一页已没有名片，请重试。"
      )
      expect(api.send).toHaveBeenCalledOnce()
      await act(async () => result.current.navigation?.onRetry())
      expect(result.current.card?.id).toBe(5)
      expect(result.current.navigation?.canNext).toBe(false)
    }
  )

  it("selects the last available item when a previous page shrinks", async () => {
    const { result } = setup()
    api.send.mockResolvedValue(page([1]))
    await act(async () => result.current.navigation?.onPrevious())
    expect(result.current.card?.id).toBe(1)
    expect(result.current.navigation?.canPrevious).toBe(false)
  })

  it.each(["resolve", "reject"] as const)(
    "ignores a late %s after close",
    async (completion) => {
      const pending = deferred<NamecardPage>()
      api.send.mockReturnValue(pending.promise)
      const { result } = setup(1)
      act(() => {
        result.current.navigation?.onNext()
        result.current.close()
      })
      await act(async () =>
        completion === "resolve"
          ? pending.resolve(page([5, 6]))
          : pending.reject(new Error("offline"))
      )
      expect(result.current.card).toBeNull()
      expect(result.current.navigation).toBeUndefined()
    }
  )

  it("invalidates an in-flight request synchronously on close and reopen, even before a render", async () => {
    const first = deferred<NamecardPage>()
    const second = deferred<NamecardPage>()
    api.send
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = setup(1)
    act(() => {
      result.current.navigation?.onNext()
      result.current.close()
      result.current.open({
        page: 1,
        pageSize: 2,
        result: page([1, 2]),
        index: 1,
        side: "back",
      })
      result.current.navigation?.onNext()
    })
    await act(async () => first.resolve(page([5, 6])))
    expect(result.current.card?.id).toBe(2)
    expect(result.current.side).toBe("back")
    expect(result.current.navigation?.pending).toBe(true)
    await act(async () => second.resolve(page([3, 4])))
    expect(result.current.card?.id).toBe(3)
  })

  it("reopening without a close also invalidates the previous session", async () => {
    const pending = deferred<NamecardPage>()
    api.send.mockReturnValue(pending.promise)
    const { result } = setup(1)
    act(() => {
      result.current.navigation?.onNext()
      result.current.open({
        page: 1,
        pageSize: 2,
        result: page([1, 2]),
        index: 0,
        side: "back",
      })
    })
    await act(async () => pending.resolve(page([5, 6])))
    expect(result.current.card?.id).toBe(1)
    expect(result.current.side).toBe("back")
  })

  it("invalidates the request and closes the preview on a list URL context change", async () => {
    const pending = deferred<NamecardPage>()
    api.send.mockReturnValue(pending.promise)
    const { result, rerender } = setup(1)
    act(() => result.current.navigation?.onNext())
    rerender({ context: "page=3&size=24" })
    await act(async () => pending.resolve(page([5, 6])))
    expect(result.current.card).toBeNull()
  })

  it("does not commit or let retained callbacks navigate after unmount", async () => {
    const pending = deferred<NamecardPage>()
    api.send.mockReturnValue(pending.promise)
    const { result, unmount } = setup(1)
    act(() => result.current.navigation?.onNext())
    const before = result.current
    unmount()
    await act(async () => pending.resolve(page([5, 6])))
    expect(result.current).toBe(before)
    act(() => before.navigation?.onNext())
    expect(api.send).toHaveBeenCalledOnce()
  })

  it("does not open an empty page or an invalid index", () => {
    const { result } = setup()
    act(() =>
      result.current.open({
        page: 1,
        pageSize: 2,
        result: page([]),
        index: 0,
        side: "front",
      })
    )
    expect(result.current.card).toBeNull()
    act(() =>
      result.current.open({
        page: 1,
        pageSize: 2,
        result: page([1]),
        index: 5,
        side: "front",
      })
    )
    expect(result.current.navigation).toBeUndefined()
  })
})
