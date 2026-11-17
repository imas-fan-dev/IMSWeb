import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import type { FudabaOwnerCard } from "~/lib/api"
import { CardManager } from "~/pages/account/me/namecards/card-manager"

const apiMocks = vi.hoisted(() => ({
  putCardLayout: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("sonner", () => ({
  // 管理器还会用可调用的 `toast(...)`（长按提示），不只有 `toast.success/error`。
  toast: Object.assign(apiMocks.toast, {
    success: apiMocks.toastSuccess,
    error: apiMocks.toastError,
  }),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return { ...actual, putCardLayout: apiMocks.putCardLayout }
})

function card(
  cardNumber: number,
  overrides: Partial<FudabaOwnerCard> = {}
): FudabaOwnerCard {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName: `名片 ${cardNumber}`,
    exchangeMode: "auto",
    ...overrides,
  })
}

/** A 自动交换、B 手动交换、C 还是草稿（只读）。 */
const CARDS = [
  card(1, { producerName: "名片 A" }),
  card(2, { producerName: "名片 B", exchangeMode: "manual" }),
  card(3, { producerName: "名片 C", publicationStatus: "draft" }),
]

const LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1, 2, 3],
  limit: 20,
})

const SAVED_LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1, 2, 3],
  quickCardNumbers: [1, 2],
  limit: 20,
})

function managerProps(
  overrides: Partial<ComponentProps<typeof CardManager>> = {}
): ComponentProps<typeof CardManager> {
  return {
    cards: CARDS,
    layout: LAYOUT,
    accountId: "platform-1",
    selectedCardId: null,
    readOnly: false,
    shareHandle: "tester",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onLayoutSaved: vi.fn(),
    ...overrides,
  }
}

function renderManager(
  overrides: Partial<ComponentProps<typeof CardManager>> = {}
) {
  const props = managerProps(overrides)
  render(<CardManager {...props} />)
  return props
}

async function enterEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "编辑模式" }))
}

function quickBadgeCount() {
  return screen.queryAllByTitle("在快速交换清单里").length
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  apiMocks.putCardLayout.mockReset()
  apiMocks.toast.mockReset()
  apiMocks.toastSuccess.mockReset()
  apiMocks.toastError.mockReset()
})

describe("CardManager editing mode", () => {
  it("only publishes checkboxes for published cards and keeps the others read-only", async () => {
    const user = userEvent.setup()
    const { onSelect } = renderManager()

    await enterEditing(user)

    // 只有 published 的卡是可勾选的复选框；草稿卡是禁用的只读瓦片。
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /名片 C/ })).toBeNull()
    const draftTile = screen.getByRole("button", { name: /名片 C/ })
    // 只读瓦片不能用真 `disabled`（那样不可聚焦、title 也播报不稳）：改成
    // `aria-disabled` + sr-only 说明，点击处理里自己忽略。
    expect(draftTile).toHaveAttribute("aria-disabled", "true")
    expect(draftTile).not.toBeDisabled()
    expect(
      document.getElementById(
        draftTile.getAttribute("aria-describedby") ?? ""
      )
    ).toHaveTextContent("只有已发布的名片可以批量调整")

    // 编辑模式点只读瓦片：不切换勾选。
    await user.click(draftTile)
    expect(screen.getByText("已选 0 张")).toBeVisible()

    // 编辑模式点击瓦片只切换勾选，不再打开编辑器。
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("still opens the editor on a plain click outside editing mode", async () => {
    const user = userEvent.setup()
    const { onSelect } = renderManager()

    await user.click(screen.getByRole("button", { name: /名片 C/ }))

    expect(onSelect).toHaveBeenCalledWith("card-3")
  })

  it("selects only the selectable cards with 全选 and clears them with 取消", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))

    expect(screen.getByText("已选 2 张")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "取消" }))

    expect(screen.getByText("已选 0 张")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).not.toBeChecked()
  })

  it("disables 全选 when no card can be selected", async () => {
    const user = userEvent.setup()
    renderManager({
      cards: [card(1, { producerName: "名片 A", publicationStatus: "draft" })],
      layout: makeNamecardCardLayout({ defaultCardNumbers: [1], limit: 20 }),
    })

    await enterEditing(user)

    expect(screen.getByRole("button", { name: "全选" })).toBeDisabled()
  })

  it("blocks creating a card while the editing session is open", async () => {
    const user = userEvent.setup()
    const { onCreate } = renderManager()

    expect(screen.getByRole("button", { name: "新建名片" })).toBeEnabled()

    await enterEditing(user)

    // 会话里新建的卡不进这次草稿，默认分组里的落点会整体错位，所以先禁掉。
    const create = screen.getByRole("button", { name: "新建名片" })
    expect(create).toBeDisabled()
    expect(create).toHaveAttribute("title", "保存或退出编辑后再新建")
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("keeps the selected count neutral and marks only the quick list red", async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, index) => card(index + 1))
    renderManager({
      cards: many,
      layout: makeNamecardCardLayout({
        defaultCardNumbers: many.map((item) => item.cardNumber),
        quickCardNumbers: many.slice(0, 21).map((item) => item.cardNumber),
        limit: 20,
      }),
    })

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))

    // 上限只约束快速清单：已选张数不标红，只有超出上限的清单计数才标红。
    // （「全选」勾上全部 25 张可勾选的卡，没有任何数量上限。）
    expect(screen.getByText("已选 25 张")).toHaveClass("text-muted-foreground")
    expect(screen.getByText("已选 25 张")).not.toHaveClass("text-destructive")
    // 计数带对象：`快速交换清单 X/20`，不再用裸的「总计」；读屏口径把上限写清。
    const quick = screen.getByText("快速交换清单 21/20")
    expect(quick).toHaveClass("text-destructive")
    expect(quick).toHaveAttribute(
      "aria-label",
      "快速交换清单 21/20 张，上限 20"
    )
  })

  it("shows the batch changes on the tiles before anything is saved", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.click(screen.getByRole("button", { name: "手动确认" }))

    expect(screen.getAllByTitle("在用户主页和名片墙不可见")).toHaveLength(2)
    expect(screen.getAllByText("手动交换")).toHaveLength(2)
    expect(apiMocks.putCardLayout).not.toHaveBeenCalled()
  })
})

describe("CardManager quick exchange list", () => {
  it("asks before switching manual cards to auto, and a cancel changes nothing", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    await user.click(screen.getByRole("button", { name: "加入" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "先改成自动确认？",
    })
    expect(dialog).toHaveTextContent(
      "已选名片中有 1 张不是自动交换，加入快速交换清单前会把它们改为自动确认。"
    )

    await user.click(within(dialog).getByRole("button", { name: "取消" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    // 整批不加入：计数与草稿都没变，保存仍然没有内容可写。
    expect(screen.getByText("快速交换清单 0/20")).toBeVisible()
    expect(quickBadgeCount()).toBe(0)
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("switches them to auto and adds the whole batch after confirming", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    const { onLayoutSaved } = renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    await user.click(screen.getByRole("button", { name: "加入" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "先改成自动确认？",
    })
    await user.click(within(dialog).getByRole("button", { name: "确认加入" }))

    expect(screen.getByText("快速交换清单 2/20")).toBeVisible()
    expect(quickBadgeCount()).toBe(2)

    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.putCardLayout).toHaveBeenCalledTimes(1)
    )
    expect(apiMocks.putCardLayout).toHaveBeenCalledWith({
      groups: [],
      defaultCardNumbers: [1, 2, 3],
      quickCardNumbers: [1, 2],
      cardSettings: [{ cardId: "card-2", exchangeMode: "auto" }],
    })
    // 保存成功后立刻退出编辑模式，并把响应写回上层。
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑模式" })).toBeVisible()
    )
    expect(onLayoutSaved).toHaveBeenCalledWith(SAVED_LAYOUT, {
      // 布局响应不带批量字段：只把这次写下的差异交给上层合并。
      "card-2": { exchangeMode: "auto" },
    })
    expect(apiMocks.toastSuccess).toHaveBeenCalledWith("名片布局已保存")
  })

  it("blocks the save while the list is over the limit and sends nothing", async () => {
    const user = userEvent.setup()
    renderManager({
      cards: [
        card(1, { producerName: "名片 A" }),
        card(2, { producerName: "名片 B" }),
        // 草稿卡不可勾选，所以这里只有两张可选的卡。
        card(3, { producerName: "名片 C", publicationStatus: "draft" }),
      ],
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2, 3],
        quickCardNumbers: [1],
        limit: 1,
      }),
    })

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("button", { name: "加入" }))

    expect(screen.getByText("快速交换清单 2/1")).toHaveClass("text-destructive")

    await user.click(screen.getByRole("button", { name: "保存" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "快速交换最多 1 张",
    })
    expect(dialog).toHaveTextContent("当前 2 张，请先移出一些名片再保存。")
    expect(apiMocks.putCardLayout).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("button", { name: "返回调整" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    // 草稿保留：还在编辑模式里，改动还在。
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  })
})

describe("CardManager saving", () => {
  it("keeps the draft when the save fails", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockRejectedValue(new Error("offline"))
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => expect(apiMocks.toastError).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
    expect(screen.getByText("已选 1 张")).toBeVisible()
  })

  it("announces the save result and hands the focus back to the toolbar", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    renderManager()

    // 播报区常驻（内容随状态变化）才播得稳：进编辑模式时它已经在 DOM 里且是空的。
    const status = screen.getByTestId("card-manager-save-status")
    expect(status).toHaveAttribute("role", "status")
    expect(status).toBeEmptyDOMElement()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("button", { name: "加入" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "先改成自动确认？",
    })
    await user.click(within(dialog).getByRole("button", { name: "确认加入" }))
    await user.click(screen.getByRole("button", { name: "保存" }))

    // 结果 + 这次提交了多少张 / 多少处：`toast` 之外还要有一份读屏能读到的东西（§11）。
    await waitFor(() =>
      expect(status).toHaveTextContent(
        "名片布局已保存：快速交换清单 1 张，批量字段改动 1 处。"
      )
    )

    // 保存后退出编辑模式，焦点回工具栏的「编辑模式」按钮（§11）。
    const editButton = screen.getByRole("button", { name: "编辑模式" })
    await waitFor(() => expect(editButton).toHaveFocus())
  })

  it("announces a failed save with the changes that were kept back", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockRejectedValue(new Error("offline"))
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(screen.getByTestId("card-manager-save-status")).toHaveTextContent(
        "名片布局保存失败：本次快速交换清单 0 张、批量字段改动 1 处未保存，请重试。"
      )
    )
    // 失败时草稿原样保留，焦点不搬走（还得让用户接着改）。
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  })

  it("skips group cards in the visibility and exchange mode batches", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(
      makeNamecardCardLayout({ defaultCardNumbers: [1, 2], limit: 20 })
    )
    renderManager({
      cards: [
        card(1, { producerName: "名片 A" }),
        card(2, { producerName: "团体名片", isGroupCard: true }),
      ],
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2],
        limit: 20,
      }),
    })

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))

    expect(
      screen.getByText(
        "已跳过 1 张团体名片：团体名片固定为自动交换且始终展示。"
      )
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.putCardLayout).toHaveBeenCalledWith({
        groups: [],
        defaultCardNumbers: [1, 2],
        quickCardNumbers: [],
        cardSettings: [{ cardId: "card-1", visible: false }],
      })
    )
  })

  it("hands only the changed card fields back so the tiles cannot snap back", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    const { onLayoutSaved } = renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.click(screen.getByRole("button", { name: "保存" }))

    // 布局响应里没有卡片字段，所以保存成功后把这次写下的差异交给上层合并；
    // 没动的卡不进 patches，上层也就不会拿快照覆盖它。
    await waitFor(() =>
      expect(onLayoutSaved).toHaveBeenCalledWith(SAVED_LAYOUT, {
        "card-1": { visible: false },
      })
    )
  })

  it("sends the loaded layout untouched", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    const layout = makeNamecardCardLayout({
      groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
      defaultCardNumbers: [1, 3],
      limit: 20,
    })
    renderManager({ layout })

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.putCardLayout).toHaveBeenCalledWith({
        groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
        defaultCardNumbers: [1, 3],
        quickCardNumbers: [],
        cardSettings: [{ cardId: "card-1", visible: false }],
      })
    )
  })
})

describe("CardManager leaving the draft", () => {
  it("confirms before dropping unsaved changes on exit", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "加入" }))
    await user.click(screen.getByRole("button", { name: "退出编辑" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "放弃未保存的改动？",
    })
    await user.click(within(dialog).getByRole("button", { name: "继续编辑" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "退出编辑" }))
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "放弃未保存的改动？",
        })
      ).getByRole("button", { name: "放弃改动" })
    )

    // 草稿被丢掉：退出编辑模式，快速清单回到布局里的样子。
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑模式" })).toBeVisible()
    )
    expect(quickBadgeCount()).toBe(0)
  })

  it("exits without a confirmation when there is nothing to lose", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "退出编辑" }))

    expect(screen.getByRole("button", { name: "编辑模式" })).toBeVisible()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("exits the editing mode on Escape, keeping the dirty confirmation", async () => {
    const user = userEvent.setup()
    renderManager()

    // 没有改动：Esc 直接退出，不需要确认。
    await enterEditing(user)
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑模式" })).toBeVisible()
    )
    expect(screen.queryByRole("alertdialog")).toBeNull()

    // 有脏改动：Esc 走现有的确认框，不静默丢弃。
    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("button", { name: "隐藏" }))
    await user.keyboard("{Escape}")

    const dialog = await screen.findByRole("alertdialog", {
      name: "放弃未保存的改动？",
    })
    await user.click(within(dialog).getByRole("button", { name: "继续编辑" }))

    // 继续编辑：草稿还在，保存仍然有内容可写。
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  })
})
