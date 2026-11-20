import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NamecardExchangeHistoryEntry } from "@imsweb/contracts/namecards"
import type { ScanExchangeQueueEntry } from "~/lib/namecards/scan-exchange-store"

import { ExchangeHistoryDialog } from "~/components/community/exchange/exchange-history-dialog"
import { EXCHANGE_HISTORY_PAGE_SIZE } from "~/components/community/exchange/use-exchange-history"
import { renderPage } from "@/tests/unit/support/harness"

const apiMocks = vi.hoisted(() => ({
  getExchangeHistory: vi.fn(),
  sendHistory: vi.fn(),
  getExchangeDetail: vi.fn(),
  sendDetail: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getExchangeHistory: apiMocks.getExchangeHistory,
    getExchangeDetail: apiMocks.getExchangeDetail,
  }
})

const queueMocks = vi.hoisted(() => ({
  list: vi.fn(),
  replay: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("~/lib/namecards/scan-exchange-queue", () => ({
  SCAN_EXCHANGE_QUEUED_MESSAGE: "已保存到本地，联网后自动重试",
  scanExchangeQueue: {
    list: queueMocks.list,
    replay: queueMocks.replay,
    remove: queueMocks.remove,
  },
}))

vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: () => true,
}))

function serverEntry(
  overrides: Partial<NamecardExchangeHistoryEntry> = {}
): NamecardExchangeHistoryEntry {
  return {
    id: "exchange-1",
    source: "scan",
    status: "completed",
    direction: "incoming",
    counterpart: {
      accountId: "acc-2",
      uid: 9,
      pageSlug: null,
      displayName: "春日未来",
    },
    targetCardNumbers: [11],
    initiatorCardNumbers: [22],
    createdAt: "2026-08-02T00:00:00.000Z",
    resolvedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  }
}

function localEntry(
  overrides: Partial<ScanExchangeQueueEntry> = {}
): ScanExchangeQueueEntry {
  return {
    id: "local-1",
    token: "a".repeat(64),
    clientExchangeId: "client-1",
    giveCardNumbers: [3, 5],
    createdAt: "2026-08-04T00:00:00.000Z",
    expiresAt: null,
    status: "failed",
    error: "网络请求失败",
    attempts: 1,
    lastAttemptAt: "2026-08-04T00:01:00.000Z",
    ...overrides,
  }
}

function renderDialog() {
  return renderPage(<ExchangeHistoryDialog open onOpenChange={vi.fn()} />)
}

beforeEach(() => {
  apiMocks.sendHistory.mockResolvedValue({
    list: [],
    total: 0,
    totalPage: 1,
  })
  apiMocks.getExchangeHistory.mockReturnValue({ send: apiMocks.sendHistory })
  apiMocks.sendDetail.mockResolvedValue({
    id: "exchange-pending",
    status: "pending",
    source: "scan",
    createdAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2026-08-10T00:00:00.000Z",
    initiator: { accountId: "acc-1", displayName: "我" },
    target: { accountId: "acc-2", displayName: "春日未来" },
    targetCards: [],
    initiatorCards: [],
    skipped: [],
  })
  apiMocks.getExchangeDetail.mockReturnValue({ send: apiMocks.sendDetail })
  queueMocks.list.mockResolvedValue([])
  queueMocks.replay.mockResolvedValue(undefined)
  queueMocks.remove.mockResolvedValue(undefined)
})

describe("ExchangeHistoryDialog", () => {
  it("puts local queue entries above the server page and sorts both newest first", async () => {
    queueMocks.list.mockResolvedValue([localEntry()])
    apiMocks.sendHistory.mockResolvedValue({
      list: [
        serverEntry({
          id: "older",
          createdAt: "2026-08-01T00:00:00.000Z",
          counterpart: {
            accountId: "acc-3",
            uid: 10,
            pageSlug: null,
            displayName: "如月千早",
          },
        }),
        serverEntry({ id: "newer", createdAt: "2026-08-03T00:00:00.000Z" }),
      ],
      total: 2,
      totalPage: 1,
    })

    renderDialog()

    const items = await screen.findAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(within(items[0]!).getByText("本机扫码交换")).toBeVisible()
    expect(within(items[1]!).getByText("春日未来")).toBeVisible()
    expect(within(items[2]!).getByText("如月千早")).toBeVisible()
    // 交换方式跟着行一起标出来，扫的与手动请求一眼可分。
    expect(within(items[1]!).getByText("扫码")).toBeVisible()
    expect(apiMocks.getExchangeHistory).toHaveBeenCalledWith({
      page: 1,
      size: EXCHANGE_HISTORY_PAGE_SIZE,
    })
  })

  it("retries a failed local entry and reloads both sources", async () => {
    const user = userEvent.setup()
    queueMocks.list.mockResolvedValue([localEntry()])
    renderDialog()

    await user.click(await screen.findByRole("button", { name: /重试/ }))

    await waitFor(() =>
      expect(queueMocks.replay).toHaveBeenCalledWith("local-1")
    )
    await waitFor(() =>
      expect(apiMocks.getExchangeHistory).toHaveBeenCalledTimes(2)
    )
  })

  it("opens the request dialog for a pending server exchange", async () => {
    const user = userEvent.setup()
    apiMocks.sendHistory.mockResolvedValue({
      list: [
        serverEntry({
          id: "exchange-pending",
          status: "pending",
          resolvedAt: null,
        }),
      ],
      total: 1,
      totalPage: 1,
    })
    renderDialog()

    await user.click(
      await screen.findByRole("button", { name: /查看并处理这笔交换/ })
    )

    await waitFor(() =>
      expect(apiMocks.getExchangeDetail).toHaveBeenCalledWith(
        "exchange-pending"
      )
    )
    expect(await screen.findByText("名片交换请求")).toBeVisible()
  })

  it("opens a read-only detail for a finished server exchange", async () => {
    const user = userEvent.setup()
    apiMocks.sendDetail.mockResolvedValue({
      id: "exchange-done",
      status: "completed",
      source: "scan",
      createdAt: "2026-08-03T00:00:00.000Z",
      expiresAt: "2026-08-10T00:00:00.000Z",
      initiator: { accountId: "acc-1", displayName: "我" },
      target: { accountId: "acc-2", displayName: "春日未来" },
      targetCards: [],
      initiatorCards: [],
      skipped: [],
    })
    apiMocks.sendHistory.mockResolvedValue({
      list: [
        serverEntry({
          id: "exchange-done",
          status: "completed",
        }),
      ],
      total: 1,
      totalPage: 1,
    })
    renderDialog()

    await user.click(
      await screen.findByRole("button", { name: /查看这笔交换的详情/ })
    )

    await waitFor(() =>
      expect(apiMocks.getExchangeDetail).toHaveBeenCalledWith("exchange-done")
    )
    expect(await screen.findByText("这笔交换已完成")).toBeVisible()
    expect(screen.queryByRole("button", { name: "同意" })).toBeNull()
    expect(screen.queryByRole("button", { name: "拒绝" })).toBeNull()
  })

  it("shows the empty state when neither source has a record", async () => {
    renderDialog()

    expect(await screen.findByText("还没有交换记录")).toBeVisible()
  })

  it("explains an expired local entry and deletes it on request", async () => {
    const user = userEvent.setup()
    queueMocks.list.mockResolvedValue([
      localEntry({ status: "expired", error: "二维码已失效" }),
    ])
    renderDialog()

    expect(
      await screen.findByText(
        "这次交换的二维码已失效，需要重新生成二维码后再扫一次。"
      )
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: /重试/ })).toBeNull()

    await user.click(screen.getByRole("button", { name: /删除/ }))

    await waitFor(() =>
      expect(queueMocks.remove).toHaveBeenCalledWith("local-1")
    )
  })

  it("pages the server records without moving the local entries", async () => {
    const user = userEvent.setup()
    queueMocks.list.mockResolvedValue([localEntry()])
    apiMocks.sendHistory.mockResolvedValue({
      list: [serverEntry()],
      total: 24,
      totalPage: 3,
    })
    renderDialog()

    expect(await screen.findByText("第 1 / 3 页")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "下一页" }))

    await waitFor(() =>
      expect(apiMocks.getExchangeHistory).toHaveBeenLastCalledWith({
        page: 2,
        size: EXCHANGE_HISTORY_PAGE_SIZE,
      })
    )
    expect(screen.getByText("本机扫码交换")).toBeVisible()
  })
})
