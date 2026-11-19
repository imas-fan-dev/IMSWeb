import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NamecardQuickSettings } from "@imsweb/contracts/namecards"

import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import type { PickerCandidate } from "~/components/community/exchange/exchange-card-picker-model"
import { makeCardPage, makeNamecardCardLayout } from "@/mocks/data/namecards"

const apiMocks = vi.hoisted(() => ({
  getExchangeCandidates: vi.fn(),
  sendCandidates: vi.fn(),
  getCardLayout: vi.fn(),
  sendLayout: vi.fn(),
  useDesktopAccountWorkspace: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getExchangeCandidates: apiMocks.getExchangeCandidates,
    getCardLayout: apiMocks.getCardLayout,
  }
})

// 断点决定外壳：默认走 PC 的 Dialog，需要验证 Sheet 的用例再把它翻成 false。
vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: apiMocks.useDesktopAccountWorkspace,
}))

vi.mock("sonner", () => ({ toast: toastMocks.toast }))

function candidate(
  cardNumber: number,
  overrides: Partial<PickerCandidate> = {}
): PickerCandidate {
  return {
    cardNumber,
    pages: [
      makeCardPage({
        role: "front",
        order: 1,
        url: `/uploads/namecard/original/${cardNumber}.webp`,
      }),
    ],
    exchangeMode: "manual",
    selected: false,
    ...overrides,
  }
}

function settings(
  cards: PickerCandidate[],
  overrides: Partial<NamecardQuickSettings> = {}
): NamecardQuickSettings {
  return { limit: 20, cards, ...overrides }
}

function renderPicker(
  props: Partial<ComponentProps<typeof ExchangeCardPickerDialog>> = {}
) {
  const onSubmit = vi.fn()
  const onScan = vi.fn()
  const onOpenChange = vi.fn()
  const result = render(
    <ExchangeCardPickerDialog
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      onScan={onScan}
      {...props}
    />
  )
  return { ...result, onSubmit, onScan, onOpenChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.useDesktopAccountWorkspace.mockReturnValue(true)
  apiMocks.sendCandidates.mockResolvedValue(settings([candidate(1)]))
  apiMocks.getExchangeCandidates.mockReturnValue({ send: apiMocks.sendCandidates })
  apiMocks.sendLayout.mockResolvedValue(makeNamecardCardLayout())
  apiMocks.getCardLayout.mockReturnValue({ send: apiMocks.sendLayout })
})

describe("ExchangeCardPickerDialog shells", () => {
  it("wraps the content in a pinned dialog on desktop and exits without a request", async () => {
    const user = userEvent.setup()
    const { onSubmit, onOpenChange } = renderPicker()

    const panel = await screen.findByRole("dialog", { name: "交换名片" })
    expect(panel).toHaveAttribute("data-slot", "dialog-content")
    expect(panel).toHaveAttribute("data-layout", "pinned")

    await user.click(screen.getByRole("button", { name: "退出交换" }))

    // base-ui 的回调还带一个关闭详情对象，这里只关心第一个参数。
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("uses the bottom sheet below the account-workspace breakpoint", async () => {
    apiMocks.useDesktopAccountWorkspace.mockReturnValue(false)
    renderPicker()

    const panel = await screen.findByRole("dialog", { name: "交换名片" })
    expect(panel).toHaveAttribute("data-slot", "sheet-content")
    expect(panel).toHaveAttribute("data-side", "bottom")
    // 底部抽屉靠把手关闭，不再重复放一个 X。
    expect(screen.queryByRole("button", { name: "退出交换" })).toBeNull()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
  })
})

describe("ExchangeCardPickerDialog candidates", () => {
  it("auto-selects the quick list, groups by layout and keeps the tiles textless", async () => {
    apiMocks.sendCandidates.mockResolvedValue(
      settings(
        [candidate(3, { selected: true }), candidate(2), candidate(1)],
        { targetMissingCount: 2 }
      )
    )
    apiMocks.sendLayout.mockResolvedValue(
      makeNamecardCardLayout({
        defaultCardNumbers: [1, 2],
        groups: [{ id: "g1", title: "线下活动", cardNumbers: [3] }],
      })
    )
    renderPicker({ target: "u1" })

    expect(await screen.findByText("已选 1/20")).toBeInTheDocument()
    expect(apiMocks.getExchangeCandidates).toHaveBeenCalledWith({ target: "u1" })

    // 标题 + 组头：默认分组不渲染组头，只有自定义分组有。
    expect(screen.getByRole("heading", { name: "线下活动" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading")).toHaveLength(2)

    const lists = screen.getAllByRole("list")
    expect(within(lists[0]!).queryByRole("heading")).toBeNull()
    expect(within(lists[0]!).getAllByRole("button")).toHaveLength(2)
    expect(within(lists[1]!).getAllByRole("button")).toHaveLength(1)

    const tile = within(lists[0]!).getByRole("button", {
      name: "选择制作人名片 1",
    })
    expect(tile).toHaveAttribute("aria-pressed", "false")
    expect(tile.querySelector("img")).toHaveAttribute(
      "src",
      "/uploads/namecard/original/1.webp"
    )
    expect(tile).toHaveTextContent("")
  })

  it("falls back to one untitled group when the layout request fails", async () => {
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(2), candidate(1)])
    )
    apiMocks.sendLayout.mockRejectedValue(new Error("layout down"))
    renderPicker()

    expect(await screen.findByText("已选 0/20")).toBeInTheDocument()
    // 只有对话框自己的标题，没有组头。
    expect(screen.getAllByRole("heading")).toHaveLength(1)
    const lists = screen.getAllByRole("list")
    expect(lists).toHaveLength(1)
    expect(within(lists[0]!).getAllByRole("button")).toHaveLength(2)
  })

  it("asks with the target card number when the wall only has the card", async () => {
    renderPicker({ targetCard: 786 })

    expect(await screen.findByText("已选 0/20")).toBeInTheDocument()
    expect(apiMocks.getExchangeCandidates).toHaveBeenCalledWith({
      targetCard: 786,
    })
  })

  it("keeps a card the target already owns unclickable", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(1, { selected: true, targetOwns: true }), candidate(2)])
    )
    const { onSubmit } = renderPicker()

    const tile = await screen.findByRole("button", {
      name: "选择制作人名片 1，对方已经有这张名片",
    })
    expect(tile).toHaveAttribute("aria-disabled", "true")
    expect(tile).not.toHaveAttribute("aria-pressed")
    expect(tile).toHaveAttribute("title", "对方已经有这张名片")

    await user.click(tile)
    expect(screen.getByText("已选 0/20")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "确定" }))
    expect(onSubmit).toHaveBeenCalledWith([])
  })

  it("shows the empty state when nothing is published", async () => {
    apiMocks.sendCandidates.mockResolvedValue(settings([]))
    renderPicker()

    expect(
      await screen.findByText("你还没有已发布的名片")
    ).toBeInTheDocument()
  })

  it("offers a retry when the candidate request fails", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(settings([candidate(1)]))
    renderPicker()

    expect(await screen.findByText("候选名片加载失败。")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "重试" }))

    expect(
      await screen.findByRole("button", { name: "选择制作人名片 1" })
    ).toBeInTheDocument()
  })
})

describe("ExchangeCardPickerDialog selection", () => {
  it("keeps the selection on the picked card and submits the numbers", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(3, { selected: true }), candidate(1, { selected: true })])
    )
    const { onSubmit, onOpenChange } = renderPicker()

    expect(await screen.findByText("已选 2/20")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "选择制作人名片 1" })
    )
    expect(screen.getByText("已选 1/20")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "确定" }))

    expect(onSubmit).toHaveBeenCalledWith([3])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("disables 清空 until something is selected and clears everything", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(1, { selected: true })])
    )
    renderPicker()

    const clear = await screen.findByRole("button", { name: "清空" })
    expect(clear).toBeEnabled()
    await user.click(clear)

    expect(screen.getByText("已选 0/20")).toBeInTheDocument()
    expect(clear).toBeDisabled()
  })

  it("warns without changing the selection once the limit is reached", async () => {
    const user = userEvent.setup()
    const cards = Array.from({ length: 21 }, (_, index) =>
      candidate(index + 1, { selected: true })
    )
    apiMocks.sendCandidates.mockResolvedValue(settings(cards))
    renderPicker()

    expect(await screen.findByText("已选 20/20")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "选择制作人名片 21" })
    )

    expect(toastMocks.toast).toHaveBeenCalledWith("一次最多给出 20 张名片")
    expect(screen.getByText("已选 20/20")).toBeInTheDocument()
  })
})

describe("ExchangeCardPickerDialog footer", () => {
  it("keeps 确定 available at zero while 分享 needs one card and 扫码 never does", async () => {
    apiMocks.sendCandidates.mockResolvedValue(settings([candidate(1)]))
    const { unmount } = renderPicker()

    await screen.findByText("已选 0/20")
    expect(screen.getByRole("button", { name: "确定" })).toBeEnabled()
    unmount()

    renderPicker({ variant: "scan-share" })
    await screen.findByText("已选 0/20")
    expect(screen.getByRole("button", { name: "分享" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "扫码" })).toBeEnabled()
  })

  it("asks again before giving nothing to a target that still misses cards", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(settings([candidate(1)]))
    const { onSubmit, onOpenChange } = renderPicker({ targetMissingCount: 5 })

    await screen.findByText("已选 0/20")
    await user.click(screen.getByRole("button", { name: "确定" }))

    const confirm = await screen.findByRole("alertdialog")
    expect(
      within(confirm).getByText("你还有 5 张对方没有的名片，确定一张都不给吗？")
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole("button", { name: "确定" }))

    expect(onSubmit).toHaveBeenCalledWith([])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("hands the current selection to 扫码", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(1, { selected: true })])
    )
    const { onScan } = renderPicker({ variant: "scan-share" })

    await screen.findByText("已选 1/20")
    await user.click(screen.getByRole("button", { name: "扫码" }))

    expect(onScan).toHaveBeenCalledWith([1])
  })
})

describe("ExchangeCardPickerDialog gift mode", () => {
  it("starts empty, blocks 确定 until a card is picked and leaves closing to the caller", async () => {
    const user = userEvent.setup()
    apiMocks.sendCandidates.mockResolvedValue(
      settings([candidate(1, { selected: true }), candidate(2)])
    )
    const { onSubmit, onOpenChange } = renderPicker({
      variant: "gift",
      target: "u1",
    })

    expect(
      await screen.findByRole("dialog", { name: "发送名片" })
    ).toBeInTheDocument()
    // 送片不预勾快速清单：打开窗口就是 0 张。
    expect(screen.getByText("已选 0/20")).toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: "确定" })
    expect(confirm).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "选择制作人名片 2" })
    )
    expect(screen.getByText("已选 1/20")).toBeInTheDocument()
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    expect(onSubmit).toHaveBeenCalledWith([2])
    // 请求还没落定：窗口由接入方在成功后关闭，这里不能自己关。
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("disables both footer buttons and shows busy while the gift request is in flight", async () => {
    apiMocks.sendCandidates.mockResolvedValue(settings([candidate(1)]))
    renderPicker({ variant: "gift", submitting: true })

    expect(await screen.findByText("已选 0/20")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    expect(screen.getByRole("button", { name: /发送中/ })).toBeDisabled()
  })
})
