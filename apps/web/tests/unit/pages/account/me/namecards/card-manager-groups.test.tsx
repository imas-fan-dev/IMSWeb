import { act, render, screen, waitFor, within } from "@testing-library/react"
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

/** 一个分组放置区（`id="card-group-cards-…"`）：直接数它下面的可拖瓦片。 */
function gridOf(title: string) {
  return screen
    .getByRole("region", { name: title })
    .querySelector('[id^="card-group-cards-"]') as HTMLElement
}

/**
 * jsdom 里没有真指针，dnd-kit 的 `PointerSensor` 要的是 `pointerdown`/`pointermove`。
 * 用 `MouseEvent` 加挂指针字段就够了（传感器只读 `isPrimary`/`button`/`clientX`/`clientY`）。
 */
function pointerLike(type: string, clientX: number, clientY: number): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  })
  const extra = { isPrimary: true, pointerId: 1, pointerType: "mouse" }
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

async function flush() {
  await act(async () => {})
}

/**
 * 用指针抓起一个瓦片：按下之后移动超过 6px 才算开始拖（`POINTER_ACTIVATION_DISTANCE_PX`）。
 *
 * jsdom 里拖拽层量出来是 0 尺寸，落点矩形就落在**原点**上（实测：换指针坐标，落点不变），
 * 于是落点永远是「离原点最近的那个 droppable」——通常是默认分组的第一张瓦片。要挑别的落点
 * 得靠改渲染结构（批次移出后再看第一张是谁），见「lands a same-group multi-select reorder…」。
 */
async function grabWithPointer(
  element: HTMLElement,
  to: { x: number; y: number }
) {
  element.dispatchEvent(pointerLike("pointerdown", 100, 100))
  await flush()
  document.dispatchEvent(pointerLike("pointermove", to.x, to.y))
  await flush()
  await flush()
}

/** 拖动中的落点 ghost：`data-variant` 区分「合集」与「展开后的每个格子」。 */
function ghostNodes() {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-testid="card-drag-ghost"]'),
  ]
}

/** 展开态（每个选中卡一个缩略图 ghost）与合集态（一摞，占 1 格）分开断言。 */
function expandedGhosts() {
  return ghostNodes().filter(
    (node) => node.getAttribute("data-variant") === "slots"
  )
}

function stackGhost() {
  return ghostNodes().find(
    (node) => node.getAttribute("data-variant") === "stack"
  )
}

/** 落点 ghost 在它所在网格里的下标：ghost 插在哪儿，松手就落在哪儿。 */
function ghostIndex(node: HTMLElement) {
  const grid = node.parentElement
  return grid ? [...grid.children].indexOf(node) : -1
}

/** 读屏播报里的落点分组名。 */
function announcedGroup() {
  const match = screen
    .getByRole("status")
    .textContent?.match(/落点『(.+)』/)
  return match?.[1] ?? null
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

  it("keeps a single-card drag on dnd-kit's own shift and inserts no ghost", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await grabWithKeyboard(
      user,
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement
    )

    // 单张拖动（批次 = 1）沿用上一轮的观感：原瓦片留在原位，让位交给 dnd-kit 的排序位移。
    expect(screen.getByRole("status")).toHaveTextContent("落点『默认分组』")
    expect(ghostNodes()).toHaveLength(0)
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

  it("takes the whole selection out of every list and puts the collection ghost at the landing spot", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    await grabWithPointer(
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement,
      // 指针停在名片 A 上：落点就是默认分组的第 0 张。
      { x: 120, y: 115 }
    )

    expect(announcedGroup()).toBe("默认分组")
    // 批次里的每一张都离开了原来的列表（不是只有被抓手的那一张）。
    expect(
      gridOf("常用").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(0)
    expect(
      gridOf("归置").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(0)
    // 没被选中的卡一动不动。
    expect(
      gridOf("默认分组").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(1)
    expect(
      gridOf("备用").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(1)
    // 走空的组靠空提示撑住放置区，否则它的 droppable 量不出尺寸。
    expect(within(gridOf("常用")).getByText("把名片拖到这里")).toBeVisible()

    // 落点处 1 个「合集 ghost」：一摞真实缩略图，右下角报这一摞的总张数。
    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    expect(ghost?.getAttribute("data-ghost-count")).toBe("2")
    expect(expandedGhosts()).toHaveLength(0)
    expect(ghostIndex(ghost as HTMLElement)).toBe(0)
    expect(within(ghost as HTMLElement).getByText("名片 B")).toBeVisible()
    // 合集里第一张在最上面（index 0 的 z-index 最高）。
    const stacked = (ghost as HTMLElement).querySelectorAll(":scope > div")
    expect(stacked).toHaveLength(2)
    expect((stacked[0] as HTMLElement).style.zIndex).toBe("2")
    expect((stacked[1] as HTMLElement).style.zIndex).toBe("1")

    // 拖拽期间整批都不在列表里，所以也找不到它们的复选框。
    expect(screen.queryByRole("checkbox", { name: /名片 B/ })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: /名片 D/ })).toBeNull()

    // 取消拖动：整批回到原来的分组，ghost 也消失。
    await user.keyboard("{Escape}")
    await waitFor(() => expect(ghostNodes()).toHaveLength(0))
    expect(
      gridOf("常用").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(1)
    expect(
      gridOf("归置").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(1)
  })

  it("lands a same-group multi-select reorder where the ghost previewed it", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    // 四张卡都在默认分组：批次与落点落在**同一个**列表里，落点下标最容易算错。
    renderManager({
      cards: CARDS,
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2, 3, 4],
        limit: 20,
      }),
    })

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 A/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    // 抓手在名片 A 上（批次 {A, B} 一起走）。jsdom 里拖拽层量出来是 0 尺寸，落点矩形就是
    // 原点 → 落点永远是离原点最近的那张瓦片：批次摘掉之后列表只剩 [C, D]，所以是名片 C。
    await grabWithPointer(
      screen
        .getByText("名片 A")
        .closest('[data-testid="sortable-card-tile"]') as HTMLElement,
      { x: 120, y: 115 }
    )

    // 落点下标按「整批移出之后」的列表算：名片 C 在这份列表（[C, D]）里是第 0 张。
    // 用完整列表算会得 2，ghost 与落位就都跑到末尾去了。
    expect(announcedGroup()).toBe("默认分组")
    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    const landing = ghostIndex(ghost as HTMLElement)
    expect(landing).toBe(0)

    // 停顿展开后仍停在原地：ghost、ghost、C、D。
    await waitFor(() => expect(expandedGhosts()).toHaveLength(2))
    expect(ghostIndex(expandedGhosts()[0] as HTMLElement)).toBe(0)
    expect(ghostIndex(expandedGhosts()[1] as HTMLElement)).toBe(1)

    // 松手：整批就落在 ghost 占住的那个位置（ghost 插在哪儿、松手就落在哪儿）。
    document.dispatchEvent(pointerLike("pointerup", 120, 115))
    await flush()
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual(["名片 A", "名片 B", "名片 C", "名片 D"])
    expect(tileNames().indexOf("名片 A")).toBe(landing)
  })

  it("expands the collection ghost into one thumbnail per card after the pause, collapses it on the next move and drops it where it stood", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    await grabWithPointer(
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement,
      { x: 120, y: 115 }
    )
    expect(stackGhost()?.getAttribute("data-ghost-count")).toBe("2")

    // 停顿 180ms：合集在当前位置展开成每张卡一个真实缩略图 ghost（插入后的排版预览）。
    await waitFor(() => expect(expandedGhosts()).toHaveLength(2))
    const [firstSlot, secondSlot] = expandedGhosts()
    expect(firstSlot?.getAttribute("data-ghost-count")).toBe("2")
    expect(ghostIndex(firstSlot as HTMLElement)).toBe(0)
    expect(ghostIndex(secondSlot as HTMLElement)).toBe(1)
    expect(within(firstSlot as HTMLElement).getByText("名片 B")).toBeVisible()
    expect(within(secondSlot as HTMLElement).getByText("名片 D")).toBeVisible()

    // 再动一下（>16px）就当作在找新落点：立刻收起回合集 ghost。这里落点没变（仍在名片 A 上），
    // 所以收起只能是「移动超过阈值」这条规则在起作用。
    document.dispatchEvent(pointerLike("pointermove", 160, 180))
    await flush()
    expect(ghostNodes()).toHaveLength(1)
    expect(expandedGhosts()).toHaveLength(0)
    expect(stackGhost()).toBeDefined()

    // 停住之后又会展开（计时被重新挂上），并且仍停在同一个落点上。
    await waitFor(() => expect(expandedGhosts()).toHaveLength(2))
    expect(ghostIndex(expandedGhosts()[0] as HTMLElement)).toBe(0)

    // 松手：落位与刚才预览的位置逐字一致（默认分组 = ghost、ghost、名片 A）。
    document.dispatchEvent(pointerLike("pointerup", 160, 180))
    await flush()
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual([
      "名片 B",
      "名片 D",
      "名片 A",
      "名片 C",
    ])
    expect(ghostNodes()).toHaveLength(0)
  })

  it("renders the expanded ghosts straight away for a keyboard drag", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    await grabWithKeyboard(
      user,
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement
    )

    // 键盘拖动没有「指针停顿」这回事：落点一确定就是展开态，不用等 180ms。
    expect(expandedGhosts()).toHaveLength(2)
    expect(ghostNodes()).toHaveLength(2)
    expect(
      gridOf("常用").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(0)
    expect(
      gridOf("归置").querySelectorAll('[data-testid="sortable-card-tile"]')
    ).toHaveLength(0)

    await user.keyboard(" ")

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    // 键盘拖拽的落点由坐标 getter 决定：默认分组第一张（名片 A）之前。
    expect(tileNames()).toEqual([
      "名片 B",
      "名片 D",
      "名片 A",
      "名片 C",
    ])
  })

  it("shows the batch size on the drag stack, not a +N badge", async () => {
    const user = userEvent.setup()
    const many = [card(1, "名片 A"), card(2, "名片 B"), card(3, "名片 C"), card(4, "名片 D")]
    stubSortableGeometry(() => null)
    renderManager({
      cards: many,
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2, 3, 4],
        limit: 20,
      }),
    })

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    await grabWithKeyboard(
      user,
      gridOf("默认分组").querySelectorAll(
        '[data-testid="sortable-card-tile"]'
      )[0] as HTMLElement
    )

    // 堆叠仍只露 3 张，但角标报的是整批张数（不是露不下的 +1）。
    expect(
      document.querySelectorAll('[data-testid="card-drag-layer"] button')
    ).toHaveLength(3)
    expect(screen.getByTestId("card-drag-count")).toHaveTextContent("4")
    expect(screen.queryByText("+1")).toBeNull()
    // 展开的 ghost 一个也不少：4 张就有 4 个格子。
    expect(expandedGhosts()).toHaveLength(4)
    expect(expandedGhosts()[3]?.getAttribute("data-ghost-count")).toBe("4")
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
