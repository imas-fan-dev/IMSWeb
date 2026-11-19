import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api"
import {
  classifyScanExchangeFailure,
  scanExchangeQueue,
} from "~/lib/namecards/scan-exchange-queue"
import type { ScanExchangeQueueEntry } from "~/lib/namecards/scan-exchange-store"

const storeMocks = vi.hoisted(() => {
  const rows = new Map<string, unknown>()
  return {
    rows,
    readAll: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
  }
})

vi.mock("~/lib/namecards/scan-exchange-store", () => ({
  scanExchangeStore: {
    readAll: storeMocks.readAll,
    read: storeMocks.read,
    write: storeMocks.write,
    remove: storeMocks.remove,
  },
}))

const apiMocks = vi.hoisted(() => ({ commitScanSession: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return { ...actual, commitScanSession: apiMocks.commitScanSession }
})

const refreshMocks = vi.hoisted(() => ({ notify: vi.fn() }))

vi.mock("~/lib/namecards/data-refresh", () => ({
  NAMECARD_DATA_CHANGED_EVENT: "ims:namecard-data-changed",
  notifyNamecardDataChanged: refreshMocks.notify,
}))

const TOKEN = "a".repeat(64)
const COMPLETED_RESULT = {
  exchangeId: "exchange-1",
  status: "completed",
  targetCardNumbers: [9],
  initiatorCardNumbers: [3, 5],
  skipped: [],
  targetMissingCount: 0,
}

function storedRows(): ScanExchangeQueueEntry[] {
  return [...storeMocks.rows.values()] as ScanExchangeQueueEntry[]
}

async function enqueueSample() {
  const entry = await scanExchangeQueue.enqueue({
    token: TOKEN,
    clientExchangeId: "client-1",
    giveCardNumbers: [3, 5],
  })
  expect(entry).not.toBeNull()
  return entry as ScanExchangeQueueEntry
}

beforeEach(() => {
  storeMocks.rows.clear()
  storeMocks.readAll.mockImplementation(async () => storedRows())
  storeMocks.read.mockImplementation(
    async (id: string) => storeMocks.rows.get(id) ?? null
  )
  storeMocks.write.mockImplementation(async (entry: ScanExchangeQueueEntry) => {
    storeMocks.rows.set(entry.id, {
      ...entry,
      giveCardNumbers: [...entry.giveCardNumbers],
    })
    return true
  })
  storeMocks.remove.mockImplementation(async (id: string) =>
    storeMocks.rows.delete(id)
  )
  apiMocks.commitScanSession.mockResolvedValue(COMPLETED_RESULT)
})

describe("scanExchangeQueue", () => {
  it("enqueues a scan exchange as a pending local record", async () => {
    const entry = await scanExchangeQueue.enqueue({
      token: TOKEN,
      clientExchangeId: "client-1",
      giveCardNumbers: [3, 5],
    })

    expect(entry).toMatchObject({
      token: TOKEN,
      clientExchangeId: "client-1",
      giveCardNumbers: [3, 5],
      expiresAt: null,
      status: "pending",
      error: null,
      attempts: 0,
      lastAttemptAt: null,
    })
    expect(storeMocks.write).toHaveBeenCalledTimes(1)
    expect(storedRows()).toHaveLength(1)
  })

  it("returns null when the local store cannot persist the record", async () => {
    storeMocks.write.mockResolvedValue(false)

    await expect(
      scanExchangeQueue.enqueue({
        token: TOKEN,
        clientExchangeId: "client-1",
        giveCardNumbers: [3],
      })
    ).resolves.toBeNull()
    expect(storedRows()).toHaveLength(0)
  })

  it("lists the newest record first", async () => {
    const first = await enqueueSample()
    const second = await scanExchangeQueue.enqueue({
      token: "b".repeat(64),
      clientExchangeId: "client-2",
      giveCardNumbers: [7],
    })
    expect(second).not.toBeNull()
    const rows = storedRows()
    const firstRow = rows.find((row) => row.id === first.id)
    const secondRow = rows.find((row) => row.id === second?.id)
    if (firstRow) firstRow.createdAt = "2026-08-01T00:00:00.000Z"
    if (secondRow) secondRow.createdAt = "2026-08-02T00:00:00.000Z"

    await expect(scanExchangeQueue.list()).resolves.toEqual([
      expect.objectContaining({ id: second?.id }),
      expect.objectContaining({ id: first.id }),
    ])
  })

  it("replays with the queued idempotency anchor, then removes and broadcasts", async () => {
    const entry = await enqueueSample()

    await scanExchangeQueue.replayAll()

    expect(apiMocks.commitScanSession).toHaveBeenCalledWith(TOKEN, {
      clientExchangeId: entry.clientExchangeId,
      giveCardNumbers: [3, 5],
    })
    expect(storedRows()).toHaveLength(0)
    expect(refreshMocks.notify).toHaveBeenCalledTimes(1)
  })

  it("keeps a network failure queued and counts the attempt", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("网络请求失败", { kind: "network" })
    )
    await enqueueSample()

    await scanExchangeQueue.replayAll()

    expect(storedRows()).toEqual([
      expect.objectContaining({
        status: "failed",
        attempts: 1,
        error: "网络请求失败",
        lastAttemptAt: expect.any(String),
      }),
    ])
    expect(refreshMocks.notify).not.toHaveBeenCalled()
  })

  it("accumulates attempts across repeated network failures", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("网络请求失败", { kind: "network" })
    )
    await enqueueSample()

    await scanExchangeQueue.replayAll()
    await scanExchangeQueue.replayAll()

    expect(storedRows()).toEqual([
      expect.objectContaining({ status: "failed", attempts: 2 }),
    ])
  })

  it("marks a business 4xx as expired and never submits it again", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("二维码已失效，请让对方重新生成", {
        kind: "business",
        status: 409,
      })
    )
    await enqueueSample()

    await scanExchangeQueue.replayAll()

    expect(storedRows()).toEqual([
      expect.objectContaining({
        status: "expired",
        attempts: 0,
        error: "二维码已失效，请让对方重新生成",
      }),
    ])

    await scanExchangeQueue.replayAll()
    expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
  })

  it("leaves a record untouched while the session is not authenticated", async () => {
    apiMocks.commitScanSession.mockRejectedValue(
      new ApiError("请先登录", { kind: "http", status: 401 })
    )
    await enqueueSample()

    await scanExchangeQueue.replayAll()

    expect(storedRows()).toEqual([
      expect.objectContaining({ status: "pending", attempts: 0 }),
    ])
  })

  it("does not submit the same record twice for concurrent replays", async () => {
    await enqueueSample()

    await Promise.all([
      scanExchangeQueue.replayAll(),
      scanExchangeQueue.replayAll(),
    ])

    expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
  })

  it("skips the queue while the browser is offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false)
    await enqueueSample()

    await scanExchangeQueue.replayAll()

    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
    expect(storedRows()).toEqual([
      expect.objectContaining({ status: "pending" }),
    ])
  })

  it("replays when the browser fires the online event", async () => {
    await enqueueSample()

    window.dispatchEvent(new Event("online"))

    await vi.waitFor(() =>
      expect(apiMocks.commitScanSession).toHaveBeenCalledTimes(1)
    )
    await vi.waitFor(() => expect(storedRows()).toHaveLength(0))
  })

  it("removes a record without submitting it", async () => {
    const entry = await enqueueSample()

    await scanExchangeQueue.remove(entry.id)

    expect(storedRows()).toHaveLength(0)
    expect(apiMocks.commitScanSession).not.toHaveBeenCalled()
  })
})

describe("classifyScanExchangeFailure", () => {
  it("treats transport failures, aborts and 5xx as retryable", () => {
    expect(
      classifyScanExchangeFailure(new ApiError("断网", { kind: "network" }))
    ).toBe("retry")
    expect(
      classifyScanExchangeFailure(new ApiError("取消", { kind: "aborted" }))
    ).toBe("retry")
    expect(
      classifyScanExchangeFailure(
        new ApiError("服务不可用", { kind: "http", status: 503 })
      )
    ).toBe("retry")
    expect(classifyScanExchangeFailure(new Error("boom"))).toBe("retry")
  })

  it("separates expired QR business errors from missing authentication", () => {
    expect(
      classifyScanExchangeFailure(
        new ApiError("二维码已失效", { kind: "business", status: 409 })
      )
    ).toBe("expired")
    expect(
      classifyScanExchangeFailure(
        new ApiError("请先登录", { kind: "http", status: 401 })
      )
    ).toBe("auth")
    expect(
      classifyScanExchangeFailure(
        new ApiError("没有权限", { kind: "http", status: 403 })
      )
    ).toBe("auth")
  })
})
