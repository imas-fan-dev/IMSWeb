import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardExchangeResult } from "~/lib/api"
import { ApiError } from "~/lib/api"
import { useExchangeSubmit } from "~/components/community/exchange/use-exchange-submit"

const toastMocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  })
  return { toast }
})

vi.mock("sonner", () => ({ toast: toastMocks.toast }))

function exchangeResult(
  overrides: Partial<NamecardExchangeResult> = {}
): NamecardExchangeResult {
  return {
    exchangeId: "exchange-1",
    status: "completed",
    targetCardNumbers: [101],
    initiatorCardNumbers: [],
    skipped: [],
    targetMissingCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  toastMocks.toast.mockClear()
  toastMocks.toast.success.mockClear()
  toastMocks.toast.error.mockClear()
})

describe("useExchangeSubmit", () => {
  it("sends one round id, announces the completed result and refreshes", async () => {
    const onSettled = vi.fn()
    const { result } = renderHook(() => useExchangeSubmit({ onSettled }))
    const ids: string[] = []
    const send = vi.fn((clientExchangeId: string) => {
      ids.push(clientExchangeId)
      return Promise.resolve(exchangeResult())
    })

    let outcome: NamecardExchangeResult | null = null
    await act(async () => {
      outcome = await result.current.submit(send)
    })

    expect(outcome).not.toBeNull()
    expect(ids).toHaveLength(1)
    expect(ids[0]?.length).toBeGreaterThanOrEqual(8)
    expect(ids[0]?.length).toBeLessThanOrEqual(64)
    expect(toastMocks.toast.success).toHaveBeenCalledWith(
      "交换完成，名片已放进你的名片册"
    )
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(result.current.submitting).toBe(false)
  })

  it("announces a pending request with the confirmation copy", async () => {
    const { result } = renderHook(() => useExchangeSubmit())

    await act(async () => {
      await result.current.submit(() =>
        Promise.resolve(exchangeResult({ status: "pending" }))
      )
    })

    expect(toastMocks.toast.success).toHaveBeenCalledWith(
      "已发出申请，对方确认后会通知你"
    )
  })

  it("announces a decline and only reports unavailable skips", async () => {
    const { result } = renderHook(() => useExchangeSubmit())

    await act(async () => {
      await result.current.submit(() =>
        Promise.resolve(
          exchangeResult({
            status: "declined",
            skipped: [
              { cardNumber: 1, side: "target", reason: "already-owned" },
              { cardNumber: 2, side: "initiator", reason: "owned-by-target" },
              { cardNumber: 3, side: "target", reason: "unavailable" },
            ],
          })
        )
      )
    })

    expect(toastMocks.toast.error).toHaveBeenCalledWith("对方拒绝了这次交换")
    // 已拥有的名片在批量交换里是常态：不再额外弹提示。
    expect(toastMocks.toast).not.toHaveBeenCalledWith("你已经有这张了")
    expect(toastMocks.toast).not.toHaveBeenCalledWith("对方已经有这张了")
    expect(toastMocks.toast).toHaveBeenCalledWith("对方的这张名片暂时不可交换")
  })

  it("shows the backend copy for a rejected request and reuses the same round id", async () => {
    const onSettled = vi.fn()
    const { result } = renderHook(() => useExchangeSubmit({ onSettled }))
    const ids: string[] = []

    await act(async () => {
      await result.current.submit((clientExchangeId) => {
        ids.push(clientExchangeId)
        return Promise.reject(
          new ApiError("这张名片不接受交换", { kind: "http", status: 409 })
        )
      })
    })

    expect(toastMocks.toast.error).toHaveBeenCalledWith("这张名片不接受交换")
    expect(onSettled).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.submit((clientExchangeId) => {
        ids.push(clientExchangeId)
        return Promise.resolve(exchangeResult())
      })
    })

    // 失败重放沿用同一个幂等锚点；成功之后才换新号。
    expect(ids[1]).toBe(ids[0])
  })

  it("uses a fresh round id after a successful exchange", async () => {
    const { result } = renderHook(() => useExchangeSubmit())
    const ids: string[] = []
    const send = vi.fn((clientExchangeId: string) => {
      ids.push(clientExchangeId)
      return Promise.resolve(exchangeResult())
    })

    await act(async () => {
      await result.current.submit(send)
      await result.current.submit(send)
    })

    expect(ids).toHaveLength(2)
    expect(ids[1]).not.toBe(ids[0])
  })

  it("falls back to a generic message when the failure is not an API error", async () => {
    const { result } = renderHook(() => useExchangeSubmit())

    await act(async () => {
      await result.current.submit(() => Promise.reject(new Error("boom")))
    })

    expect(toastMocks.toast.error).toHaveBeenCalledWith("交换失败，请重试")
  })
})
