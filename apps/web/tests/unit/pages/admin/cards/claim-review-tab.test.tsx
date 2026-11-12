import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
import type {
  AdminCardSupplement,
  FudabaAdminCardClaim,
  ReviewQueueRow,
} from "~/lib/api"
import { ClaimReviewTab } from "~/pages/admin/cards/claim-review-tab"

const api = vi.hoisted(() => ({
  getAdminFudabaReviewQueue: vi.fn(),
  reviewAdminFudabaCardClaim: vi.fn(),
  reviewAdminFudabaCardSupplement: vi.fn(),
}))

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return { ...actual, ...api }
})

vi.mock("sonner", () => ({ toast: toasts }))

const submittedAt = "2026-10-01T08:00:00.000Z"

function page(
  pageId: string,
  order: number,
  role: "front" | "middle" | "back",
  url: string
) {
  return {
    pageId,
    role,
    order,
    url,
    previewUrl: url,
    thumbUrl: url,
    width: 900,
    height: 500,
  }
}

function claim(
  overrides: Partial<FudabaAdminCardClaim> = {}
): FudabaAdminCardClaim {
  return {
    id: "claim-1",
    legacyCardId: 101,
    targetCardId: null,
    seriesCode: "765as",
    payload: {},
    favoriteCharacters: [],
    state: "pending",
    message: "这是我以前做的名片",
    reviewNote: "",
    revision: 3,
    createdAt: submittedAt,
    updatedAt: submittedAt,
    reviewedAt: null,
    targetCardNumber: null,
    claimant: { id: "acct-1", displayName: "春香P" },
    legacyCard: {
      id: 101,
      pages: [
        page("front", 1, "front", "https://cdn.test/101-front.webp"),
        page("back", 2, "back", "https://cdn.test/101-back.webp"),
      ],
    },
    ...overrides,
  }
}

function supplement(
  overrides: Partial<AdminCardSupplement> = {}
): AdminCardSupplement {
  return {
    id: "supplement-1",
    cardId: "card-202",
    state: "pending",
    payload: { producerName: "如月千早P" },
    submitter: { id: "acct-2", displayName: "千早P" },
    reviewNote: "",
    revision: 2,
    createdAt: submittedAt,
    updatedAt: submittedAt,
    reviewedAt: null,
    ...overrides,
  }
}

function claimRow(
  overrides: Partial<FudabaAdminCardClaim> = {}
): ReviewQueueRow {
  return { type: "claim", submittedAt, claim: claim(overrides) }
}

function supplementRow(): ReviewQueueRow {
  return {
    type: "supplement",
    submittedAt,
    card: {
      id: "card-202",
      cardNumber: 202,
      producerName: "如月千早P",
      pages: [page("front", 1, "front", "https://cdn.test/202-front.webp")],
      pageCount: 1,
    },
    supplement: supplement(),
  }
}

function queueBody(rows: ReviewQueueRow[], total = rows.length) {
  return {
    data: rows,
    pageInfo: {
      page: 1,
      pageSize: 20,
      total,
      totalPages: 1,
      hasNextPage: false,
    },
  }
}

/** Points the queue endpoint at the given rows; each read gets its own `send`. */
function mockQueue(rows: ReviewQueueRow[], total?: number) {
  api.getAdminFudabaReviewQueue.mockReturnValue({
    send: vi.fn().mockResolvedValue(queueBody(rows, total)),
  })
}

function mockReviews() {
  api.reviewAdminFudabaCardClaim.mockReturnValue({
    send: vi.fn().mockResolvedValue({ revision: 4 }),
  })
  api.reviewAdminFudabaCardSupplement.mockReturnValue({
    send: vi.fn().mockResolvedValue({ revision: 3 }),
  })
}

function lastQueueQuery() {
  return api.getAdminFudabaReviewQueue.mock.calls.at(-1)?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockQueue([])
})

describe("ClaimReviewTab", () => {
  it("renders claim and supplement rows with their badges, dropping submissions", async () => {
    const submission = {
      type: "submission",
      submittedAt,
      review: {
        card: { cardNumber: 303, producerName: "投稿制作人" },
        owner: { id: "acct-9", displayName: "投稿人" },
      },
    } as unknown as ReviewQueueRow
    mockQueue([claimRow(), supplementRow(), submission], 2)

    renderPage(<ClaimReviewTab />)

    expect(await screen.findByText("名片 #101")).toBeInTheDocument()
    expect(
      screen.getByText("名片认领与信息补充共用这一页 · 共 2 条待审核记录")
    ).toBeInTheDocument()
    expect(screen.getByText("如月千早P")).toBeInTheDocument()
    expect(screen.getByText("春香P")).toBeInTheDocument()

    const queue = screen.getByLabelText("名片认领队列内容")
    expect(within(queue).getByText("名片认领")).toBeInTheDocument()
    expect(within(queue).getByText("信息补充")).toBeInTheDocument()
    expect(within(queue).queryByText("投稿制作人")).not.toBeInTheDocument()
    expect(within(queue).queryByText("投稿人")).not.toBeInTheDocument()

    expect(api.getAdminFudabaReviewQueue).toHaveBeenCalledWith({
      type: "all",
      query: undefined,
      page: 1,
    })
  })

  it("narrows the queue request as the review-type filters change", async () => {
    mockQueue([claimRow()])
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("名片 #101")

    await user.click(screen.getByRole("checkbox", { name: "信息补充" }))
    await waitFor(() =>
      expect(lastQueueQuery()).toMatchObject({ type: "claim" })
    )

    await user.click(screen.getByRole("checkbox", { name: "名片认领" }))
    await waitFor(() => expect(lastQueueQuery()).toMatchObject({ type: "all" }))

    await user.click(screen.getByRole("checkbox", { name: "信息补充" }))
    await waitFor(() =>
      expect(lastQueueQuery()).toMatchObject({ type: "supplement" })
    )
  })

  it("approves a claim with its revision and note, then reloads the queue", async () => {
    mockQueue([claimRow()])
    mockReviews()
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("名片 #101")

    await user.click(screen.getByRole("button", { name: "通过" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "通过名片认领",
    })
    await user.click(within(dialog).getByRole("button", { name: "确认通过" }))

    await waitFor(() =>
      expect(api.reviewAdminFudabaCardClaim).toHaveBeenCalledWith("claim-1", {
        decision: "approve",
        expectedRevision: 3,
        note: "已核对历史名片与申请资料",
      })
    )
    await waitFor(() =>
      expect(api.getAdminFudabaReviewQueue).toHaveBeenCalledTimes(2)
    )
    expect(toasts.success).toHaveBeenCalledWith("名片 #101 已完成认领")
  })

  it("approves a supplement through its own review endpoint", async () => {
    mockQueue([supplementRow()])
    mockReviews()
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("如月千早P")

    await user.click(screen.getByRole("button", { name: "通过" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "通过信息补充",
    })
    await user.click(within(dialog).getByRole("button", { name: "确认通过" }))

    await waitFor(() =>
      expect(api.reviewAdminFudabaCardSupplement).toHaveBeenCalledWith(
        "supplement-1",
        {
          decision: "approve",
          expectedRevision: 2,
          note: "已核对名片墙上的资料",
        }
      )
    )
    await waitFor(() =>
      expect(api.getAdminFudabaReviewQueue).toHaveBeenCalledTimes(2)
    )
    expect(toasts.success).toHaveBeenCalledWith("补充已通过")
  })

  it("sends the reason typed into the reject dialog", async () => {
    mockQueue([claimRow()])
    mockReviews()
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("名片 #101")

    await user.click(screen.getByRole("button", { name: "驳回" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "驳回名片认领",
    })
    await user.type(within(dialog).getByLabelText("驳回理由"), "资料对不上")
    await user.click(within(dialog).getByRole("button", { name: "确认驳回" }))

    await waitFor(() =>
      expect(api.reviewAdminFudabaCardClaim).toHaveBeenCalledWith("claim-1", {
        decision: "reject",
        expectedRevision: 3,
        note: "资料对不上",
      })
    )
    expect(toasts.success).toHaveBeenCalledWith("名片 #101 的认领已驳回")
  })

  it("fills the reject reason from a preset before confirming", async () => {
    mockQueue([claimRow()])
    mockReviews()
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("名片 #101")

    await user.click(screen.getByRole("button", { name: "驳回" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "驳回名片认领",
    })
    await user.click(within(dialog).getByRole("button", { name: "重复提交" }))
    expect(within(dialog).getByLabelText("驳回理由")).toHaveValue("重复提交")

    await user.click(within(dialog).getByRole("button", { name: "确认驳回" }))

    await waitFor(() =>
      expect(api.reviewAdminFudabaCardClaim).toHaveBeenCalledWith("claim-1", {
        decision: "reject",
        expectedRevision: 3,
        note: "重复提交",
      })
    )
  })

  it("shows the empty message when nothing is waiting", async () => {
    mockQueue([])

    renderPage(<ClaimReviewTab />)

    expect(
      await screen.findByText("没有待审核的认领或补充")
    ).toBeInTheDocument()
    expect(
      screen.getByText("名片墙上的认领与补充提交后会显示在这里。")
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("正在加载认领队列")).not.toBeInTheDocument()
  })

  it("shows the retry state when the queue reload after a review fails", async () => {
    const okSend = vi.fn().mockResolvedValue(queueBody([claimRow()]))
    const failedSend = vi.fn().mockRejectedValue(new Error("boom"))
    api.getAdminFudabaReviewQueue
      .mockReturnValueOnce({ send: okSend })
      .mockReturnValueOnce({ send: failedSend })
      .mockReturnValue({ send: okSend })
    mockReviews()
    const user = userEvent.setup()

    renderPage(<ClaimReviewTab />)
    await screen.findByText("名片 #101")

    await user.click(screen.getByRole("button", { name: "通过" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "确认通过" }))

    expect(await screen.findByText("无法读取认领队列")).toBeInTheDocument()
    expect(
      screen.getByText("请确认管理会话有效，然后重试。")
    ).toBeInTheDocument()
    expect(screen.queryByText("名片 #101")).not.toBeInTheDocument()
  })
})
