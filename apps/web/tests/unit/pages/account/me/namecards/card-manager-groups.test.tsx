import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import type { FudabaOwnerCard } from "~/lib/api"
import { CardManager } from "~/pages/account/me/namecards/card-manager"
import { collapsedGroupsStorageKey } from "~/pages/account/me/namecards/hooks/use-collapsed-card-groups"

const apiMocks = vi.hoisted(() => ({
  putCardLayout: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: apiMocks.toastSuccess, error: apiMocks.toastError },
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return { ...actual, putCardLayout: apiMocks.putCardLayout }
})

function card(cardNumber: number, producerName: string): FudabaOwnerCard {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
    exchangeMode: "auto",
  })
}

/** 四张已发布且自动交换的卡：默认分组一张，三个命名分组各一张。 */
const CARDS = [
  card(1, "名片 A"),
  card(2, "名片 B"),
  card(3, "名片 C"),
  card(4, "名片 D"),
]

const LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1],
  groups: [
    { id: "g-common", title: "常用", cardNumbers: [2] },
    { id: "g-spare", title: "备用", cardNumbers: [3] },
    { id: "g-archive", title: "归置", cardNumbers: [4] },
  ],
  limit: 20,
})

const SAVED_LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1],
  groups: [
    { id: "g-common", title: "常用", cardNumbers: [2] },
    { id: "g-spare", title: "备用", cardNumbers: [3] },
    { id: "g-archive", title: "归置", cardNumbers: [4] },
  ],
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

/** 编辑模式下的分组顺序：组头就是一个标题输入框。 */
function groupTitles() {
  return screen
    .getAllByRole("textbox", { name: "分组名称" })
    .map((input) => (input as HTMLInputElement).value)
}

/** 清单位置：制作人名的文本节点顺序就是瓦片顺序（拖拽结束后再断言）。 */
function tileNames() {
  return screen.getAllByText(/^名片 [A-Z]$/).map((node) => node.textContent)
}

/** 一个命名分组的 `<section>`（dnd-kit 量它来排分组顺序）。 */
function groupSection(title: string): HTMLElement {
  return screen.getByRole("region", { name: title }) as HTMLElement
}

/**
 * jsdom 里每个节点的 rect 都是 0，dnd-kit 的键盘坐标算不出任何移动，所以给分组、放置区与
 * 瓦片铺一套按 DOM 顺序排布的假几何：分组各占 400px 高，瓦片在组内依次排下去。
 *
 * dnd-kit 在拖拽期间拿**拖拽层**（`position: fixed` 的那个节点）当「正在拖的节点」来量，
 * 所以 `getDragged` 要告诉它此刻拖的是谁——否则拖拽层量出来是 0，键盘方向键就没有参照。
 */
function stubSortableGeometry(getDragged: () => Element | null) {
  const GROUP_HEIGHT = 400
  const sections = () => [
    ...document.querySelectorAll('[data-testid="card-group"]'),
  ]
  const groupTop = (section: Element | null) =>
    section ? sections().indexOf(section) * GROUP_HEIGHT : 0

  function rectOf(element: Element): DOMRect {
    if (element.getAttribute("data-testid") === "card-group") {
      return makeRect(0, groupTop(element), 320, GROUP_HEIGHT)
    }
    if (element.id.startsWith("card-group-cards-")) {
      const section = element.closest('[data-testid="card-group"]')
      return makeRect(0, groupTop(section) + 40, 320, GROUP_HEIGHT - 80)
    }
    if (element.getAttribute("data-testid") === "sortable-card-tile") {
      const section = element.closest('[data-testid="card-group"]')
      const tiles = section
        ? [...section.querySelectorAll('[data-testid="sortable-card-tile"]')]
        : []
      return makeRect(
        0,
        groupTop(section) + 60 + tiles.indexOf(element) * 110,
        240,
        100
      )
    }
    // 其余节点量成零尺寸，不会成为落点候选。
    return makeRect(0, 0, 0, 0)
  }

  return vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const isDragOverlay = (this as HTMLElement).style?.position === "fixed"
      const dragged = isDragOverlay ? getDragged() : this
      return dragged ? rectOf(dragged) : makeRect(0, 0, 0, 0)
    })
}

function makeRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

/** `KeyboardSensor` 的 document 级监听是 `setTimeout(0)` 挂上的，方向键要等它挂好。 */
async function settleKeyboardSensor() {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  await act(() => promise)
}

/** 用键盘抓起某个可拖拽节点（空格），后续方向键与空格由调用方补。 */
async function grabWithKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement
) {
  element.focus()
  await user.keyboard(" ")
  await settleKeyboardSensor()
}

beforeEach(() => {
  window.localStorage.clear()
  apiMocks.putCardLayout.mockReset()
  apiMocks.toastSuccess.mockReset()
  apiMocks.toastError.mockReset()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("CardManager group editing", () => {
  it("creates a group below the default group and leaves it out of the draft until it holds a card", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "新建分组" }))
    await user.type(
      screen.getByPlaceholderText("输入分组名称"),
      "新分组{Enter}"
    )

    // 新组排在默认分组正下方（组头就是那个标题输入框）。
    expect(groupTitles()).toEqual(["新分组", "常用", "备用", "归置"])
    const defaultGroup = screen.getByRole("region", { name: "默认分组" })
    expect(
      defaultGroup.compareDocumentPosition(screen.getByDisplayValue("新分组")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.queryByPlaceholderText("输入分组名称")).toBeNull()

    // 空分组保存时会被丢掉，所以此刻还不算改动。
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("does not create a group for an empty or blank title", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "新建分组" }))
    await user.type(screen.getByPlaceholderText("输入分组名称"), "   {Enter}")

    expect(groupTitles()).toEqual(["常用", "备用", "归置"])
    expect(screen.queryByPlaceholderText("输入分组名称")).toBeNull()
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("does not fold a new group just because a previous session left the same local key", async () => {
    const user = userEvent.setup()
    // `local:N` 每会话都从 1 重号：上一会话折叠过的新建分组若留在本地存储里，
    // 这一会话一建出来就会是折叠的。进编辑会话时按服务端分组收窄折叠态。
    window.localStorage.setItem(
      collapsedGroupsStorageKey("platform-1"),
      JSON.stringify(["local:1"])
    )
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "新建分组" }))
    await user.type(
      screen.getByPlaceholderText("输入分组名称"),
      "新分组{Enter}"
    )

    expect(screen.getByRole("button", { name: "折叠新分组" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "展开新分组" })).toBeNull()
    // 残渣也真的从存储里清掉了，不只是这次渲染没读到。
    expect(
      window.localStorage.getItem(collapsedGroupsStorageKey("platform-1"))
    ).toBe("[]")
  })

  it("renames a group through its header input", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    const title = screen.getAllByRole("textbox", { name: "分组名称" })[0]!
    await user.clear(title)
    await user.type(title, " 主推 {Enter}")

    expect(groupTitles()).toEqual(["主推", "备用", "归置"])
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  })

  it("removes a group and sends its cards back to the default group", async () => {
    const user = userEvent.setup()
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "删除分组：备用" }))

    expect(groupTitles()).toEqual(["常用", "归置"])
    expect(tileNames()).toEqual(["名片 A", "名片 C", "名片 B", "名片 D"])

    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.putCardLayout).toHaveBeenCalledWith({
        groups: [
          { id: "g-common", title: "常用", cardNumbers: [2] },
          { id: "g-archive", title: "归置", cardNumbers: [4] },
        ],
        defaultCardNumbers: [1, 3],
        quickCardNumbers: [],
        cardSettings: [],
      })
    )
  })
})

describe("CardManager dragging", () => {
  it("reorders groups with the header handle, announces the move and saves the new order", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => groupSection("归置"))
    apiMocks.putCardLayout.mockResolvedValue(SAVED_LAYOUT)
    renderManager()

    await enterEditing(user)
    await grabWithKeyboard(
      user,
      screen.getByRole("button", { name: "拖动排序：归置" })
    )
    await user.keyboard("{ArrowUp}")
    await user.keyboard(" ")

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "已把分组『归置』移动到『备用』"
      )
    )
    expect(groupTitles()).toEqual(["常用", "归置", "备用"])

    // 拖出来的顺序必须进保存请求（布局改动参与保存，不是只有批量字段）。
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.putCardLayout).toHaveBeenCalledWith({
        groups: [
          { id: "g-common", title: "常用", cardNumbers: [2] },
          { id: "g-archive", title: "归置", cardNumbers: [4] },
          { id: "g-spare", title: "备用", cardNumbers: [3] },
        ],
        defaultCardNumbers: [1],
        quickCardNumbers: [],
        cardSettings: [],
      })
    )
  })

  it("keeps the sortable list to the real tiles while a card drag is in flight", async () => {
    const user = userEvent.setup()
    /** 分组放置区（`id="card-group-cards-…"`）：直接数它下面的可拖瓦片。 */
    const gridOf = (title: string) =>
      screen
        .getByRole("region", { name: title })
        .querySelector('[id^="card-group-cards-"]') as HTMLElement
    stubSortableGeometry(() => groupSection("归置"))
    renderManager()

    await enterEditing(user)
    await grabWithKeyboard(user, gridOf("常用").children[0] as HTMLElement)

    // 拖动进行中、落点已解析——旧的 ghost 预置正是在这一刻把虚线占位块插进
    // `SortableContext` 的 children，网格因此真的多出一格。
    expect(screen.getByRole("status")).toHaveTextContent("落点『默认分组』")
    expect(
      document.querySelectorAll('[data-testid="card-drag-ghost"]')
    ).toHaveLength(0)
    // 每个分组里**只有**自己的瓦片：占位完全交给 dnd-kit 的排序位移。
    for (const title of ["默认分组", "常用", "备用", "归置"]) {
      expect(
        gridOf(title).querySelectorAll('[data-testid="sortable-card-tile"]')
      ).toHaveLength(1)
    }

    await user.keyboard(" ")

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "已把 1 张名片移动到『默认分组』"
      )
    )
    // 落位写进草稿：落点是默认分组的第 0 张（名片 A），名片 B 插到它前面。
    expect(
      gridOf("默认分组").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(2)
    expect(
      gridOf("常用").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(0)
    expect(tileNames()).toEqual(["名片 B", "名片 A", "名片 C", "名片 D"])
  })

  it("keeps the drop out of a collapsed group", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    // 折叠「常用」：它的放置区不再渲染，也就没有可命中的落点。
    await user.click(screen.getByRole("button", { name: "折叠常用" }))

    const section = screen.getByRole("region", { name: "常用" })
    expect(section.querySelector('[id^="card-group-cards-"]')).toBeNull()

    await user.click(screen.getByRole("button", { name: "展开常用" }))
    expect(section.querySelector('[id^="card-group-cards-"]')).not.toBeNull()
  })
})
