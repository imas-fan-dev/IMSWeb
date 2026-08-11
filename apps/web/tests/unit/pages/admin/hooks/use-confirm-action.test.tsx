import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("useConfirmAction", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  it("uses a synchronous single-flight lock and one success toast", async () => {
    const pending = deferred()
    const onConfirm = vi.fn(() => pending.promise)
    const trigger = document.createElement("button")
    document.body.append(trigger)
    trigger.focus()
    const { result } = renderHook(() =>
      useConfirmAction({
        onConfirm,
        getTitle: (item: string) => item,
        getDescription: (item: string) => item,
        successMessage: "操作成功",
      })
    )

    act(() => result.current.requestAction("目标", trigger))
    expect(result.current.status).toBe("confirming")

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.confirmAction()
      second = result.current.confirmAction()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe("submitting")

    act(() => result.current.onOpenChange(false))
    expect(result.current.open).toBe(true)

    pending.resolve()
    await act(async () => Promise.all([first, second]))
    expect(result.current.status).toBe("idle")
    expect(result.current.open).toBe(false)
    expect(toastMocks.success).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveFocus()
  })

  it("keeps the target and enables retry after a failure", async () => {
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce()
    const { result } = renderHook(() =>
      useConfirmAction({
        onConfirm,
        getTitle: (item: string) => item,
        getDescription: (item: string) => item,
        successMessage: "操作成功",
      })
    )

    act(() => result.current.requestAction("目标"))
    await act(() => result.current.confirmAction())
    expect(result.current.status).toBe("error")
    expect(result.current.target).toBe("目标")
    expect(toastMocks.error).toHaveBeenCalledWith(
      "请求失败，当前输入已保留，请稍后重试。"
    )

    await act(() => result.current.confirmAction())
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe("idle")
  })

  it("uses a fallback when the successful action removed its trigger", async () => {
    const trigger = document.createElement("button")
    const fallback = document.createElement("button")
    document.body.append(trigger, fallback)
    const { result } = renderHook(() =>
      useConfirmAction({
        onConfirm: async () => trigger.remove(),
        getTitle: (item: string) => item,
        getDescription: (item: string) => item,
        successMessage: "操作成功",
        getFallbackFocus: () => fallback,
      })
    )

    act(() => result.current.requestAction("目标", trigger))
    await act(() => result.current.confirmAction())
    expect(fallback).toHaveFocus()
  })
})
