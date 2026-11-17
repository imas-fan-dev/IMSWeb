import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import type { FudabaOwnerCard } from "~/lib/api"
import { CardManager } from "~/pages/account/me/namecards/card-manager"
import {
  cardFlipOffsetFromStyle,
  isCardFlipTransition,
} from "~/pages/account/me/namecards/card-grid-animation"
import { collapsedGroupsStorageKey } from "~/pages/account/me/namecards/hooks/use-collapsed-card-groups"

const apiMocks = vi.hoisted(() => ({
  putCardLayout: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("sonner", () => ({
  // 管理器自己会用可调用的 `toast(...)`（长按提示），不只是 `toast.success/error`。
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
  producerName: string,
  overrides: Partial<FudabaOwnerCard> = {}
): FudabaOwnerCard {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
    exchangeMode: "auto",
    ...overrides,
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
  // 移动端（jsdom 没有 1024px 的桌面匹配）批量区默认折叠；这一批用例要按批量按钮，
  // 进来先展开。「默认折叠、可展开」本身在 `card-manager-editing.test.tsx` 里覆盖。
  const bulkToggle = screen.queryByRole("button", { name: "批量操作" })
  if (bulkToggle?.getAttribute("aria-expanded") === "false") {
    await user.click(bulkToggle)
  }
}

/** 某个分组**底部**那个「新建分组」入口（每个分组各一个，靠组名分得清）。 */
function createGroupButton(label: string) {
  return within(groupSection(label)).getByRole("button", {
    name: `在「${label}」下方新建分组`,
  })
}

/**
 * 待命名分组的区域：点下入口那一刻它就是一个真的 `<section>`（组头是那个空的标题输入框），
 * 所以按它的无障碍名称查得到。
 */
function pendingGroupSection() {
  return screen.getByRole("region", { name: "未命名分组" })
}

/** 待命名分组的组头输入框（可访问名与普通组头的「分组名称」区分开）。 */
function pendingTitleInput() {
  return within(pendingGroupSection()).getByRole("textbox", {
    name: "新分组名称",
  }) as HTMLInputElement
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
function stubSortableGeometry(
  getDragged: () => Element | null,
  /**
   * 模拟滚动：`getBoundingClientRect` 是**视口**坐标，滚动就是所有 rect 一起位移。
   * 每次量的时候现取（`() => dy`），这样用例可以在拖拽中间改它再派发 `scroll`。
   */
  scrollOffsetY: () => number = () => 0
) {
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
      if (!dragged) return makeRect(0, 0, 0, 0)
      const rect = rectOf(dragged)
      const dy = scrollOffsetY()
      return dy === 0
        ? rect
        : makeRect(rect.left, rect.top + dy, rect.width, rect.height)
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

type PointerEventName = "pointerdown" | "pointermove" | "pointerup"

/** 一次指针动作在真实浏览器里**同时**产生指针事件与鼠标事件（`mousedown` 等）。 */
const MOUSE_COUNTERPART: Record<PointerEventName, string> = {
  pointerdown: "mousedown",
  pointermove: "mousemove",
  pointerup: "mouseup",
}

/**
 * jsdom 里没有真指针，而瓦片拖拽走 dnd-kit 的**鼠标**传感器（`MouseSensor` 听
 * `mousedown`/`mousemove`/`mouseup`），落点几何又读 `window` 的 `pointermove`（真实浏览器里
 * 鼠标动作两条路都有）。所以这里一次派发两条，忠实还原真实事件序列。
 */
function pointerLike(
  type: PointerEventName,
  clientX: number,
  clientY: number,
  pointerType = "mouse"
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  })
  const extra = { isPrimary: true, pointerId: 1, pointerType }
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

/**
 * 触摸事件：jsdom 没有 `TouchEvent`，dnd-kit 于是按 `clientX`/`clientY` 取坐标
 * （`isTouchEvent` 认的是 `instanceof TouchEvent`，这里为假），所以坐标字段与 `touches`
 * 都得挂上——激活判断读 `touches.length`，移动读坐标。
 */
function touchLike(
  type: "touchstart" | "touchmove" | "touchend",
  clientX: number,
  clientY: number
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const touch = { clientX, clientY, identifier: 1 }
  const extra = {
    clientX,
    clientY,
    touches: type === "touchend" ? [] : [touch],
    changedTouches: [touch],
    targetTouches: [],
  }
  for (const [key, value] of Object.entries(extra)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

function mouseLike(
  type: PointerEventName,
  clientX: number,
  clientY: number
): MouseEvent {
  return new MouseEvent(MOUSE_COUNTERPART[type], {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  })
}

/** 在同一个节点上派发「指针 + 鼠标」两条路线（见 `pointerLike`）。 */
function firePointer(
  target: EventTarget,
  type: PointerEventName,
  clientX: number,
  clientY: number
) {
  target.dispatchEvent(pointerLike(type, clientX, clientY))
  target.dispatchEvent(mouseLike(type, clientX, clientY))
}

async function flush() {
  await act(async () => {})
}

/**
 * 模拟一次窗口滚动：rect 整体位移由 `stubSortableGeometry` 的 `scrollOffsetY` 负责，这里只
 * 派发 `scroll` 并等 rAF 合并的那一帧跑完（重解析在 rAF 里，断言必须等它）。
 */
async function scrollWindow() {
  await act(async () => {
    window.dispatchEvent(new Event("scroll"))
    const { promise, resolve } = Promise.withResolvers<void>()
    window.requestAnimationFrame(() => resolve())
    await promise
  })
}

/**
 * 推进「停顿展开」的计时（假定时器下）：真等 1s 会让组件测试慢得没法看，
 * 而 `waitFor` 的默认超时（1s）也等不到它。
 */
async function advanceDwell(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

/**
 * 拖拽结束/取消后，瓦片上不该还挂着**我们写的** FLIP 位移/过渡。
 * （落位那一刻 dnd-kit 会把自己的收尾过渡 `transform 200ms ease` 挂回同一个元素，
 * 那是它的动画，不能算我们的残渣，也不该被抹掉。）
 */
function expectNoInlineTileMotion() {
  const tiles = document.querySelectorAll<HTMLElement>(
    '[data-testid="sortable-card-tile"]'
  )
  expect(tiles.length).toBeGreaterThan(0)
  for (const tile of tiles) {
    expect(cardFlipOffsetFromStyle(tile.style.transform)).toBeNull()
    expect(isCardFlipTransition(tile.style.transition)).toBe(false)
  }
}

/**
 * 用指针抓起一个瓦片：按下之后移动超过 6px 才算开始拖（`POINTER_ACTIVATION_DISTANCE_PX`）。
 *
 * 多选拖动的落点按**指针几何**算（`resolveCardDropFromPointer`），比的是 `stubSortableGeometry`
 * 铺出来的假 rects，所以 `to` 的坐标真的决定落点：每个分组各占 400px 高、放置区是组内
 * `y = 组顶 + 40` 起、320×320；瓦片在 `y = 组顶 + 60 + 110i` 处，240×100。指针落在某张瓦片的
 * 左半边（中心左边）就插在它前面、右半边（或整行更靠下）就插在它后面。
 */
async function grabWithPointer(
  element: HTMLElement,
  to: { x: number; y: number }
) {
  firePointer(element, "pointerdown", 100, 100)
  await flush()
  firePointer(document, "pointermove", to.x, to.y)
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

/**
 * 拖拽的读屏播报区：dnd-kit 自己的 `role="status"`。管理器另有一条**常驻**的保存结果播报区
 * （`data-testid="card-manager-save-status"`），两者靠这个属性分开——保存结果不该混进落点断言。
 */
function dragStatusRegion(): HTMLElement {
  const regions = screen
    .getAllByRole("status")
    .filter((node) => !node.hasAttribute("data-testid"))
  expect(regions).toHaveLength(1)
  return regions[0] as HTMLElement
}

/** 读屏播报里的落点分组名。 */
function announcedGroup() {
  const match = dragStatusRegion().textContent?.match(/落点『(.+)』/)
  return match?.[1] ?? null
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  apiMocks.putCardLayout.mockReset()
  apiMocks.toast.mockReset()
  apiMocks.toastSuccess.mockReset()
  apiMocks.toastError.mockReset()
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("CardManager group editing", () => {
  it("materializes the group area as soon as 新建分组 is pressed, with the header input focused", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("默认分组"))

    // 点下去那一刻就是完整的分组区域：section 真的在、组头是**空的**输入框（已聚焦）、
    // 下面就是空放置区提示。
    const section = pendingGroupSection()
    const input = pendingTitleInput()
    expect(input).toHaveFocus()
    expect(input).toHaveValue("")
    expect(input).toHaveAttribute("placeholder", "输入分组名称")
    expect(within(section).getByText("把名片拖到这里")).toBeVisible()

    // 它插在默认分组正下方、也在「常用」之前。
    expect(
      groupSection("默认分组").compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      section.compareDocumentPosition(groupSection("常用")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    // 空分组保存时会被丢掉，所以此刻还不算改动。
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()

    await user.type(input, "新分组{Enter}")

    // 名字落在它的组头里：同一个区域原地变成命名分组，顺序不变。
    expect(groupTitles()).toEqual(["新分组", "常用", "备用", "归置"])
    expect(screen.queryByRole("region", { name: "未命名分组" })).toBeNull()
  })

  it("inserts the new group area below the group whose button was pressed, focused and ready to name", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("常用"))

    // 区域就在「常用」下面，组头输入框立刻拿到焦点（用户直接打字即可）。
    const section = pendingGroupSection()
    expect(pendingTitleInput()).toHaveFocus()
    expect(
      groupSection("常用").compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      section.compareDocumentPosition(groupSection("备用")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    await user.type(pendingTitleInput(), "常用副组{Enter}")

    expect(groupTitles()).toEqual(["常用", "常用副组", "备用", "归置"])
  })

  it("keeps only one pending group: pressing another button drops the un-named one", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("默认分组"))
    expect(pendingGroupSection()).toBeVisible()

    await user.click(createGroupButton("备用"))

    // 仍然只有一个待命名区域（上一个没输入标题的整个丢掉），而且搬到了「备用」下面。
    expect(
      screen.getAllByRole("region", { name: "未命名分组" })
    ).toHaveLength(1)
    expect(screen.getAllByPlaceholderText("输入分组名称")).toHaveLength(1)
    expect(
      groupSection("备用").compareDocumentPosition(pendingGroupSection()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    await user.type(pendingTitleInput(), "备用副组{Enter}")

    expect(groupTitles()).toEqual(["常用", "备用", "备用副组", "归置"])
  })

  it("keeps the original full-width 新建分组 control and lands its group below the default group", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)

    // 原来那个控件照旧在：位置还是控件区与列表之间（列表容器之前）。
    const original = screen.getByRole("button", { name: "新建分组" })
    expect(original).toBeVisible()
    expect(
      original.compareDocumentPosition(
        screen.getByRole("navigation", { name: "我的名片清单" })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    await user.click(original)

    // 原先的行为：待命名分组落在默认分组下面（区域已经存在，不是一行输入占位）。
    expect(pendingTitleInput()).toHaveFocus()
    expect(
      groupSection("默认分组").compareDocumentPosition(pendingGroupSection()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // 待命名期间它自己收起（老样子）——只有分组底部的入口还在。
    expect(screen.queryByRole("button", { name: "新建分组" })).toBeNull()

    await user.type(pendingTitleInput(), "新分组{Enter}")

    expect(groupTitles()).toEqual(["新分组", "常用", "备用", "归置"])
  })

  it("shares the one-pending rule between the full-width control and the per-group buttons", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "新建分组" }))
    // 再点一个分组底部的入口：上一个还没输入标题，整个丢掉（只剩一个待命名区域）。
    await user.click(createGroupButton("归置"))

    expect(
      screen.getAllByRole("region", { name: "未命名分组" })
    ).toHaveLength(1)
    expect(
      groupSection("归置").compareDocumentPosition(pendingGroupSection()) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("returns the cards dropped into the un-named group to the default group when the title stays empty", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    // 待命名分组插在默认分组正下方：假几何里它是第 2 个 section，放置区在 y = 440…760。
    await user.click(createGroupButton("默认分组"))

    // 勾两张卡（批次 ≥ 2 走按指针几何算落点的那条路），拖进这个还没命名的区域。
    // 点卡片会让组头输入框失焦，但指针落在管理器内部：这一组不该在这一刻被丢掉。
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    expect(pendingGroupSection()).toBeVisible()

    await grabWithPointer(
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement,
      { x: 100, y: 500 }
    )
    firePointer(document, "pointerup", 100, 500)
    await flush()

    // 待命名区域也是合法落点：两张卡真的进去了。
    expect(
      gridOf("未命名分组").querySelectorAll(
        '[data-testid="sortable-card-tile"]'
      )
    ).toHaveLength(2)

    // 标题留空 + 回车：这一组整个丢掉，卡片退回默认分组末尾（纯草稿，不丢数据）。
    await user.click(pendingTitleInput())
    await user.keyboard("{Enter}")

    expect(screen.queryByRole("region", { name: "未命名分组" })).toBeNull()
    expect(groupTitles()).toEqual(["常用", "备用", "归置"])
    expect(tileNames()).toEqual(["名片 A", "名片 B", "名片 D", "名片 C"])
  })

  it("drops the pending group when the focus really leaves the manager", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("默认分组"))
    const input = pendingTitleInput()
    expect(input).toHaveFocus()

    // 纯失焦（焦点离开整块管理器、也没有新目标）：空标题 → 待命名分组整个丢掉。
    await act(async () => {
      input.blur()
    })

    expect(screen.queryByRole("region", { name: "未命名分组" })).toBeNull()
    expect(groupTitles()).toEqual(["常用", "备用", "归置"])
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("disables every 新建分组 entry with a reason once the group limit is reached", async () => {
    const user = userEvent.setup()
    // 20 个分组各有一张卡才会计入草稿（空分组在草稿结构里也在，但只读结构会丢掉，
    // 所以让每组建好时就带着一张卡最省事）。
    const cards = Array.from({ length: 21 }, (_, index) =>
      card(index + 1, `名片 ${index + 1}`)
    )
    renderManager({
      cards,
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [21],
        groups: Array.from({ length: 20 }, (_, index) => ({
          id: `g-${index}`,
          title: `组 ${index}`,
          cardNumbers: [index + 1],
        })),
        limit: 20,
      }),
    })

    await enterEditing(user)

    const button = createGroupButton("组 0")
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", "最多 20 个分组")
    // 原来的全宽控件也一起吃这条上限。
    const original = screen.getByRole("button", { name: "新建分组" })
    expect(original).toBeDisabled()
    expect(original).toHaveAttribute("title", "最多 20 个分组")
  })

  it("does not create a group for an empty or blank title", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("默认分组"))
    expect(pendingGroupSection()).toBeVisible()

    await user.type(pendingTitleInput(), "   {Enter}")

    // 待命名区域整个丢掉，也没留下任何输入区。
    expect(screen.queryByRole("region", { name: "未命名分组" })).toBeNull()
    expect(groupTitles()).toEqual(["常用", "备用", "归置"])
    expect(screen.queryByPlaceholderText("输入分组名称")).toBeNull()
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("discards the pending group on Escape without leaving the editing session", async () => {
    const user = userEvent.setup()
    renderManager()

    await enterEditing(user)
    await user.click(createGroupButton("默认分组"))
    expect(pendingGroupSection()).toBeVisible()

    await user.keyboard("{Escape}")

    // `Esc` 属于那个组头输入框：待命名区域整个丢掉，编辑会话还在（也没跳出确认框）。
    expect(screen.queryByRole("region", { name: "未命名分组" })).toBeNull()
    expect(groupTitles()).toEqual(["常用", "备用", "归置"])
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "编辑模式" })).toBeNull()
    expect(screen.queryByRole("alertdialog")).toBeNull()
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
    await user.click(createGroupButton("默认分组"))
    await user.type(pendingTitleInput(), "新分组{Enter}")

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
      expect(dragStatusRegion()).toHaveTextContent(
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
    expect(dragStatusRegion()).toHaveTextContent("落点『默认分组』")
    expect(ghostNodes()).toHaveLength(0)
    for (const title of ["默认分组", "常用", "备用", "归置"]) {
      expect(
        gridOf(title).querySelectorAll('[data-testid="sortable-card-tile"]')
      ).toHaveLength(1)
    }

    await user.keyboard(" ")

    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
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
    expectNoInlineTileMotion()
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
    // 从这里开始只推进假定时器：停顿展开必须是 1s 才发生，真等一次测试就慢 1s。
    // 落点下标在假定时器那一段量出来，松手之后（真定时器）再和最终顺序对一次。
    let landing: number | undefined
    vi.useFakeTimers()
    try {
      // 抓手在名片 A 上（批次 {A, B} 一起走），指针停在名片 A 上、没越过它的中心线。
      // 批次摘掉之后列表只剩 [C, D]，所以落点是第 0 张。
      await grabWithPointer(
        screen
          .getByText("名片 A")
          .closest('[data-testid="sortable-card-tile"]') as HTMLElement,
        { x: 120, y: 115 }
      )

      // 落点下标按「整批移出之后」的列表算：名片 C 在这份列表（[C, D]）里是第 0 张。
      // 指针还停在 A 原来的位置上，所以落点就是第 0 张。
      expect(announcedGroup()).toBe("默认分组")
      const ghost = stackGhost()
      expect(ghost).toBeDefined()
      landing = ghostIndex(ghost as HTMLElement)
      expect(landing).toBe(0)

      // 差 1ms 还是那一摞；再推 1ms 才展开成两张（ghost、ghost、C、D），且仍停在原地。
      await advanceDwell(1000 - 1)
      expect(expandedGhosts()).toHaveLength(0)
      expect(stackGhost()).toBeDefined()
      await advanceDwell(1)
      expect(expandedGhosts()).toHaveLength(2)
      expect(ghostIndex(expandedGhosts()[0] as HTMLElement)).toBe(0)
      expect(ghostIndex(expandedGhosts()[1] as HTMLElement)).toBe(1)
    } finally {
      vi.useRealTimers()
    }

    // 松手：整批就落在 ghost 占住的那个位置（ghost 插在哪儿、松手就落在哪儿）。
    firePointer(document, "pointerup", 120, 115)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual(["名片 A", "名片 B", "名片 C", "名片 D"])
    expect(tileNames().indexOf("名片 A")).toBe(landing)
    // 位移动画（FLIP）留下的内联 transform/transition 也得清干净。
    expectNoInlineTileMotion()
  })

  it("computes the landing index against the list without the batch on the activation frame", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    // 四张卡都在默认分组：批次 {A, B} 就排在落点前面，激活那一帧的下标最容易多算。
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
    // 抓手在名片 A 上；指针停在名片 C 的下半（ghost 该插在 C 之后、D 之前）。激活那一次
    // `pointermove` 里 React 还没把整批移出列表（见 `applyPointerTarget` 的说明），几何得自己
    // 摘掉本批：不摘就会多算 A、B、C 三张，ghost 落到列表末尾。
    await grabWithPointer(
      screen
        .getByText("名片 A")
        .closest('[data-testid="sortable-card-tile"]') as HTMLElement,
      { x: 60, y: 340 }
    )

    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    // 摘掉 A、B 之后列表是 [C, D]：插在 C 与 D 之间（下标 1）。
    expect(ghostIndex(ghost as HTMLElement)).toBe(1)

    // 松手：落位与 ghost 预览的位置逐字一致（C、A、B、D）。
    firePointer(document, "pointerup", 60, 340)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B", "名片 D"])
    expectNoInlineTileMotion()
  })

  it("keeps the landing spot while the pointer jitters inside the dead zone", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    // 指针停在名片 A 中心线上方 5px：落点是默认分组的第 0 张。
    await grabWithPointer(
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement,
      { x: 60, y: 115 }
    )
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)

    // 往下 3px：几何上候选已经翻到「名片 A 之后」（越过了它中心往下 6px 的判定线），但指针
    // 还没离开死区（12px）→ ghost 一动不动，播报也不重发。
    firePointer(document, "pointermove", 60, 118)
    await flush()
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)
    expect(announcedGroup()).toBe("默认分组")

    // 就这么松手：落位是 ghost 预览的位置（下标 0），不是那一刻算出来的原始候选。
    firePointer(document, "pointerup", 60, 118)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual(["名片 B", "名片 D", "名片 A", "名片 C"])
    expectNoInlineTileMotion()
  })

  it("does not swap the ghost back and forth when the pointer sits on a row endpoint", async () => {
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
      { x: 60, y: 115 }
    )

    // 压着「名片 A 中心」这条判定线两侧各 3px 来回走：每一步几何上都翻一次候选（0 ↔ 1），
    // ghost 却一次都不该跟着动——这正是用户 2026-11-17 反馈的「上下两行反复横跳」。
    for (const y of [118, 115, 118, 115, 118]) {
      firePointer(document, "pointermove", 60, y)
      await flush()
      expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)
    }

    // 真走开一格（25px）才换：指针到名片 A 中心下方 → ghost 插到它后面。
    firePointer(document, "pointermove", 60, 140)
    await flush()
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(1)

    // 收尾：取消这趟拖拽。留着一个「拖拽中」的 dnd-kit 会话，下一条用例的点击会被它挂在
    // document 上的捕获监听吞掉（组件测试里每趟拖拽都要有结局）。
    await user.keyboard("{Escape}")
    await waitFor(() => expect(ghostNodes()).toHaveLength(0))
  })

  it("measures where a tile is going, not where the FLIP is painting it", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    const grabbable = gridOf("常用").querySelector(
      '[data-testid="sortable-card-tile"]'
    ) as HTMLElement
    const tileA = screen
      .getByText("名片 A")
      .closest('[data-testid="sortable-card-tile"]') as HTMLElement

    firePointer(grabbable, "pointerdown", 100, 100)
    await flush()
    // 过渡途中：名片 A 身上挂着 -150 的位移（FLIP 把它顶下去之后正在往回走）。假几何给的是
    // 它**渲染**中的位置（60–160），所以它真正的布局位置是 210–310。这一步必须紧挨着
    // `pointermove`：React 的提交在事件之后，不会把它盖掉。
    tileA.style.transform = "translate(0px, -150px)"
    firePointer(document, "pointermove", 60, 130)
    await flush()
    await flush()

    // 落点按**布局**位置算：指针 (60, 130) 在名片 A 将要去的地方（210–310）上方 → 插在它前面
    // （下标 0）。按渲染位置算的话指针就压在它身上 → 会算成插在它后面（下标 1）。
    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    expect(ghostIndex(ghost as HTMLElement)).toBe(0)

    firePointer(document, "pointerup", 60, 130)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    // 落位就是它预览的位置：整批插在名片 A 之前。
    expect(tileNames()).toEqual(["名片 B", "名片 D", "名片 A", "名片 C"])
  })

  it("moves the collection ghost to the group under the pointer, not to dnd-kit's cached droppable", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    // 抓手在「常用」的名片 B 上，指针停在默认分组里：落点在默认分组。
    await grabWithPointer(
      gridOf("常用").querySelector(
        '[data-testid="sortable-card-tile"]'
      ) as HTMLElement,
      { x: 120, y: 115 }
    )
    expect(announcedGroup()).toBe("默认分组")
    expect(gridOf("默认分组").contains(stackGhost() as HTMLElement)).toBe(true)

    // 指针移到「备用」的放置区里（第三组，假几何里 y 840–1160；名片 C 在 860–960）。
    // jsdom 里拖拽层量出来是 0 尺寸，dnd-kit 的 `over` 只会跟着累计位移跑，靠它落点会原地不动；
    // 落点几何按指针实测 DOM，所以 ghost 必须立刻跟过去。
    firePointer(document, "pointermove", 60, 900)
    await flush()

    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    expect(gridOf("备用").contains(ghost as HTMLElement)).toBe(true)
    // 指针在名片 C 中心的左边 → 插在它前面。
    expect(ghostIndex(ghost as HTMLElement)).toBe(0)

    // 松手：整批落在 ghost 预览的位置（备用 = 名片 B、名片 D，插在名片 C 之前）。
    firePointer(document, "pointerup", 60, 900)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『备用』"
      )
    )
    expect(tileNames()).toEqual(["名片 A", "名片 B", "名片 D", "名片 C"])
    expect(ghostNodes()).toHaveLength(0)
    expectNoInlineTileMotion()
  })

  it("expands the collection ghost into one thumbnail per card after the pause, collapses it on the next move and drops it where it stood", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("checkbox", { name: /名片 B/ }))
    await user.click(screen.getByRole("checkbox", { name: /名片 D/ }))
    // 1s 的停顿只用假定时器推进，不真等。
    vi.useFakeTimers()
    try {
      await grabWithPointer(
        gridOf("常用").querySelector(
          '[data-testid="sortable-card-tile"]'
        ) as HTMLElement,
        { x: 120, y: 115 }
      )
      expect(stackGhost()?.getAttribute("data-ghost-count")).toBe("2")

      // 停顿 1s：合集在当前位置展开成每张卡一个真实缩略图 ghost（插入后的排版预览）。
      await advanceDwell(1000)
      const [firstSlot, secondSlot] = expandedGhosts()
      expect(firstSlot).toBeDefined()
      expect(secondSlot).toBeDefined()
      expect(firstSlot?.getAttribute("data-ghost-count")).toBe("2")
      expect(ghostIndex(firstSlot as HTMLElement)).toBe(0)
      expect(ghostIndex(secondSlot as HTMLElement)).toBe(1)
      expect(within(firstSlot as HTMLElement).getByText("名片 B")).toBeVisible()
      expect(within(secondSlot as HTMLElement).getByText("名片 D")).toBeVisible()

      // 再动一下（>16px）就当作在找新落点：立刻收起回合集 ghost。这里落点没变（指针仍在
      // 名片 A 那一行、在它中心左边），所以收起只能是「移动超过阈值」这条规则在起作用。
      firePointer(document, "pointermove", 60, 100)
      await flush()
      expect(ghostNodes()).toHaveLength(1)
      expect(expandedGhosts()).toHaveLength(0)
      expect(stackGhost()).toBeDefined()

      // 停住之后又会展开（计时被重新挂上），并且仍停在同一个落点上。
      await advanceDwell(1000)
      expect(expandedGhosts()).toHaveLength(2)
      expect(ghostIndex(expandedGhosts()[0] as HTMLElement)).toBe(0)
    } finally {
      vi.useRealTimers()
    }

    // 松手：落位与刚才预览的位置逐字一致（默认分组 = ghost、ghost、名片 A）。
    firePointer(document, "pointerup", 60, 100)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
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
    expectNoInlineTileMotion()
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

    // 键盘拖动没有「指针停顿」这回事：落点一确定就是展开态，不用等 1s。
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
      expect(dragStatusRegion()).toHaveTextContent(
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

  it("re-resolves the landing spot on scroll, from the last pointer position and the new layout", async () => {
    const user = userEvent.setup()
    // 滚动只改布局、不改指针：`getBoundingClientRect` 是视口坐标，所有 rect 一起位移。
    let scrollOffsetY = 0
    stubSortableGeometry(() => null, () => scrollOffsetY)
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
    // 抓手在名片 A 上，指针停在它中心线上方 5px：落点是默认分组的第 0 张。
    await grabWithPointer(
      screen
        .getByText("名片 A")
        .closest('[data-testid="sortable-card-tile"]') as HTMLElement,
      { x: 60, y: 115 }
    )
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)

    // 指针一动不动，滚 105px：瓦片整体上移，名片 A 整个跑到了指针上方——落点该跟着新几何走。
    // 死区（12px）按定义会挡掉这次修正（锚点就在指针脚下），`scroll` 这条路必须绕开它。
    scrollOffsetY = -105
    await scrollWindow()

    const ghost = stackGhost()
    expect(ghost).toBeDefined()
    // 新几何：只有名片 A 的中心在指针上方（B 与指针同一行、还在它右边）→ 落点第 1 张。
    expect(ghostIndex(ghost as HTMLElement)).toBe(1)
    expect(announcedGroup()).toBe("默认分组")

    // 松手：落位就是滚动后 ghost 预览的位置（名片 C 之后）——不是滚动前的那个下标。
    firePointer(document, "pointerup", 60, 115)
    await flush()
    await waitFor(() =>
      expect(dragStatusRegion()).toHaveTextContent(
        "已把 2 张名片移动到『默认分组』"
      )
    )
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B", "名片 D"])
    expectNoInlineTileMotion()
  })

  it("keeps the landing spot when the layout shifts but no scroll moves the pointer off its anchor", async () => {
    const user = userEvent.setup()
    let scrollOffsetY = 0
    stubSortableGeometry(() => null, () => scrollOffsetY)
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
    await grabWithPointer(
      screen
        .getByText("名片 A")
        .closest('[data-testid="sortable-card-tile"]') as HTMLElement,
      { x: 60, y: 115 }
    )
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)

    // 几何自己变了，但**没有** `scroll`：指针那条路照旧过死区。指针没动、锚点就在它脚下，
    // 所以即使同坐标的 `pointermove` 按新几何会算出别的候选，落点也不许自己改（滞回不被滥用）。
    scrollOffsetY = -105
    firePointer(document, "pointermove", 60, 115)
    await flush()
    expect(ghostIndex(stackGhost() as HTMLElement)).toBe(0)
    expect(announcedGroup()).toBe("默认分组")

    // 收尾：取消这趟拖拽（留着一个「拖拽中」的会话会吞掉下一条用例的点击）。
    await user.keyboard("{Escape}")
    await waitFor(() => expect(ghostNodes()).toHaveLength(0))
  })
})

/** 拖动中的浮层：它一出现就说明这一趟拖拽真的开始了。 */
function dragLayer() {
  return document.querySelector('[data-testid="card-drag-layer"]')
}

/** 某个分组里第一张瓦片的外层节点（长按/触摸事件的落点）。 */
function firstTile(title: string) {
  return gridOf(title).querySelector(
    '[data-testid="sortable-card-tile"]'
  ) as HTMLElement
}

/** 瓦片本体（外层节点里的那个按钮）：真实手指落在这上面。 */
function tileButton(tile: HTMLElement) {
  return tile.querySelector("button") as HTMLElement
}

/** 管理器进没进编辑模式：工具栏那一支换成了编辑中的按钮。 */
function editingMode() {
  return screen.queryByRole("button", { name: "退出编辑" }) !== null
}

/** 触屏长按要推进假定时器：到点（450ms）才算触发。 */
async function holdLongPress(target: HTMLElement, pointerType = "touch") {
  target.dispatchEvent(pointerLike("pointerdown", 100, 100, pointerType))
  await advanceDwell(450)
}

describe("CardManager touch", () => {
  it("enters editing on a touch long press, selects the pressed tile and hints once", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()
    const pressed = tileButton(firstTile("常用"))

    vi.useFakeTimers()
    try {
      await holdLongPress(pressed)
      await flush()
      expect(apiMocks.toast).toHaveBeenCalledWith("长按拖动可调整顺序")

      // 浏览器随后给这次长按补一个 click：它不能落成一次勾选（默认勾选已经做过，再点就是取消）。
      tileButton(firstTile("常用")).dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
      )
      await flush()
    } finally {
      vi.useRealTimers()
    }

    // 进了编辑模式，并且默认勾选**触发这次长按的那张瓦片**（用户 2026-11-17 追加）。
    expect(screen.getByRole("button", { name: "退出编辑" })).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).toBeChecked()
    expect(screen.getByText("已选 1 张")).toBeVisible()

    // 提示一个会话只出一次：退出编辑再长按一次，不再弹。
    await user.click(screen.getByRole("button", { name: "退出编辑" }))
    vi.useFakeTimers()
    try {
      await holdLongPress(tileButton(firstTile("常用")))
      await flush()
    } finally {
      vi.useRealTimers()
    }
    expect(apiMocks.toast).toHaveBeenCalledTimes(1)
  })

  it("enters editing without selecting a tile that cannot be selected", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    // 名片 C 还是草稿：可以进编辑模式，但它不可勾选（R3），所以长按它不勾任何东西。
    renderManager({
      cards: [
        card(1, "名片 A"),
        card(2, "名片 B"),
        card(3, "名片 C", { publicationStatus: "draft" }),
      ],
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2, 3],
        limit: 20,
      }),
    })

    vi.useFakeTimers()
    try {
      // 长按落在草稿卡（名片 C）上：它本来就不可勾选，所以只进编辑模式。
      const draftTile = screen
        .getByText("名片 C")
        .closest('[data-testid="sortable-card-tile"]') as HTMLElement
      await holdLongPress(tileButton(draftTile))
      await flush()
    } finally {
      vi.useRealTimers()
    }

    expect(screen.getByRole("button", { name: "退出编辑" })).toBeVisible()
    expect(screen.getByText("已选 0 张")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).not.toBeChecked()

    // 收尾：退出这次会话（草稿没改，直接退）。
    await user.click(screen.getByRole("button", { name: "退出编辑" }))
  })

  it("does not enter editing for a mouse hold, a move past the tolerance or an early lift", async () => {
    stubSortableGeometry(() => null)
    renderManager()
    const tile = firstTile("常用")

    vi.useFakeTimers()
    try {
      // 桌面端有工具栏按钮：鼠标按住 450ms 不进编辑。
      await holdLongPress(tileButton(tile), "mouse")
      await flush()
      expect(editingMode()).toBe(false)

      // 手指移动超过 8px：那是滚动/拖动，不是长按。
      tileButton(tile).dispatchEvent(pointerLike("pointerdown", 100, 100, "touch"))
      tileButton(tile).dispatchEvent(pointerLike("pointermove", 112, 100, "touch"))
      await advanceDwell(450)
      await flush()
      expect(editingMode()).toBe(false)

      // 没满 450ms 就抬手：这是一次轻点。
      tileButton(tile).dispatchEvent(pointerLike("pointerdown", 100, 100, "touch"))
      await advanceDwell(400)
      tileButton(tile).dispatchEvent(pointerLike("pointerup", 100, 100, "touch"))
      await advanceDwell(200)
      await flush()
    } finally {
      vi.useRealTimers()
    }

    expect(editingMode()).toBe(false)
    expect(apiMocks.toast).not.toHaveBeenCalled()
  })

  it("starts a touch drag only after the 250ms hold", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    const tile = firstTile("常用")

    vi.useFakeTimers()
    try {
      tile.dispatchEvent(touchLike("touchstart", 100, 100))
      await flush()
      // 250ms 之前：手指在容差内动一下也不算「拖起来了」。
      tile.dispatchEvent(touchLike("touchmove", 104, 100))
      await flush()
      expect(dragLayer()).toBeNull()
      expect(dragStatusRegion()).not.toHaveTextContent("已抓起")

      // 按住满 250ms 才激活（不需要移动）：拖动浮层出现，落点播报也跟着指针走。
      await advanceDwell(250)
      await flush()
      expect(dragLayer()).not.toBeNull()

      // 激活之后手指移动就把瓦片带走。
      tile.dispatchEvent(touchLike("touchmove", 160, 140))
      await flush()
      expect(dragLayer()).not.toBeNull()

      // 抬手：这一趟干净地结束。
      tile.dispatchEvent(touchLike("touchend", 160, 140))
      await flush()
      expect(dragLayer()).toBeNull()

      // dnd-kit 是在拖拽结束时用 `setTimeout(…, 50)` 摘掉它挂在 `document` 上的捕获监听
      // （激活后它会吞掉 click，以免拖动被当成点击）的，所以要**趁假定时器还在**把它推完：
      // 留在那儿的话，下一条用例的点击会被这个陈旧会话吞掉（本文件其它用例都踩过这个坑）。
      await advanceDwell(60)
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a touch lift before the delay as a selection, not a drag", async () => {
    const user = userEvent.setup()
    stubSortableGeometry(() => null)
    renderManager()

    await enterEditing(user)
    const tile = firstTile("常用")

    // 按住不到 250ms 就抬手：这不是拖动（不需要假定时器，抬手会把待激活的计时清掉）。
    tile.dispatchEvent(touchLike("touchstart", 100, 100))
    await flush()
    tile.dispatchEvent(touchLike("touchend", 100, 100))
    await flush()
    expect(dragLayer()).toBeNull()

    // 浏览器随后给这次轻点补一整套事件（jsdom 不会自己合成）：按下 → 抬手 → click。
    // 新的一次按下会作废上一趟长按留下的「吞一次 click」窗口，所以这一下必须照常勾上。
    await user.click(tileButton(tile))
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).toBeChecked()
  })
})
