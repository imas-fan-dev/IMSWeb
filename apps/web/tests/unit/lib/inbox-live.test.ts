import { afterEach, expect, it, vi } from "vitest"

import { startInboxLive } from "~/lib/namecards/inbox-live"

const { receive, invalidate, setAccount } = vi.hoisted(() => ({
  receive: vi.fn(),
  invalidate: vi.fn(),
  setAccount: vi.fn(),
}))
vi.mock("~/lib/api", () => ({
  receiveInboxChanges: receive,
}))
vi.mock("~/lib/use-namecard-unread", () => ({
  invalidateNamecardInbox: invalidate,
  setNamecardInboxAccount: setAccount,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

it("reconnects and refreshes after EOF, stops when hidden and on logout", async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, "random").mockReturnValue(0)
  let visible = true
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden"
  )
  let end!: () => void
  receive.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        end = resolve
      })
  )
  const stop = startInboxLive("alice")
  try {
    expect(setAccount).toHaveBeenCalledWith("alice")
    expect(receive).toHaveBeenCalledTimes(1)
    receive.mock.calls[0][2]()
    expect(invalidate).toHaveBeenCalledTimes(2)
    end()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(receive).toHaveBeenCalledTimes(2)
    receive.mock.calls[1][2]()
    expect(invalidate).toHaveBeenCalledTimes(3)
    visible = false
    document.dispatchEvent(new Event("visibilitychange"))
    expect(receive.mock.calls[1][1].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(receive).toHaveBeenCalledTimes(2)
    visible = true
    document.dispatchEvent(new Event("visibilitychange"))
    expect(receive).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledTimes(4)
  } finally {
    stop()
  }
  expect(receive.mock.calls[2][1].aborted).toBe(true)
  expect(setAccount).toHaveBeenLastCalledWith(null)
  receive.mock.calls[2][2]()
  expect(invalidate).toHaveBeenCalledTimes(4)
})

it("falls back to a snapshot while the foreground stream is unavailable", async () => {
  vi.useFakeTimers()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  receive.mockResolvedValue(undefined)
  const stop = startInboxLive("alice")
  try {
    await vi.advanceTimersByTimeAsync(60_000)
    expect(invalidate).toHaveBeenCalledTimes(2)
  } finally {
    stop()
  }
})
