import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import { CardManager } from "~/pages/account/me/namecards/card-manager"

/** jsdom 的 `matchMedia` 只认查询串，这里按账号工作区的断点给出结果（≥1024px 才算桌面）。 */
function stubMatchMedia(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          matches: query.includes("(min-width: 1024px)") ? desktop : false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as unknown as MediaQueryList
    )
  )
}

function card(cardNumber: number, producerName: string, createdAt: string) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
    // 经典模式按名片自己的创建时间降序（与分组顺序刻意不同，才分得清两条路）。
    createdAt,
    // 快速清单只收 `published + auto`（服务端读侧同口径），所以夹具用自动交换。
    exchangeMode: "auto",
  })
}

const CARDS = [
  card(1, "名片 A", "2026-01-01T00:00:00+08:00"),
  card(2, "名片 B", "2026-01-03T00:00:00+08:00"),
  card(3, "名片 C", "2026-01-02T00:00:00+08:00"),
]

/** 布局：1 在默认分组、2 在「常用」；3 是布局里没出现的新卡。 */
const LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1],
  groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
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

/** 瓦片的可见顺序：制作人名的文本节点顺序就是瓦片顺序。 */
function tileNames() {
  return screen.getAllByText(/^名片 [A-Z]$/).map((node) => node.textContent)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe("CardManager grouping", () => {
  it("renders the untitled default group before the named groups", () => {
    renderManager()

    // 两种模式都要能靠同一个无障碍名称找到整个清单（e2e 依赖它）。
    expect(
      screen.getByRole("navigation", { name: "我的名片清单" })
    ).toBeVisible()
    // 默认分组不渲染组头（用户口径）：没有标题区域，只有带无障碍名的 section。
    expect(screen.queryByRole("heading", { name: "默认分组" })).toBeNull()
    const defaultGroup = screen.getByRole("region", { name: "默认分组" })
    const groupHeading = screen.getByRole("heading", { name: "常用" })
    expect(groupHeading).toBeVisible()
    expect(
      defaultGroup.compareDocumentPosition(groupHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("follows the group order and the order inside each group", () => {
    renderManager({
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [3, 1],
        groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
      }),
    })

    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])
  })

  it("puts cards missing from the layout at the front of the default group", () => {
    renderManager()

    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])
  })

  it("shows the lightning badge only for the quick exchange cards", () => {
    renderManager({
      layout: makeNamecardCardLayout({
        defaultCardNumbers: [1, 2],
        quickCardNumbers: [2],
      }),
    })

    const badges = screen.getAllByTitle("在快速交换清单里")
    expect(badges).toHaveLength(1)
    expect(badges[0]?.closest("button")?.textContent).toContain("名片 B")
  })
})

describe("CardManager view modes", () => {
  it("switches to the classic list without group headers, ordered by createdAt desc", async () => {
    const user = userEvent.setup()
    renderManager()

    // jsdom 没有 View Transitions：切换必须直接生效、不抛错。
    expect(document.startViewTransition).toBeUndefined()
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])

    await user.click(screen.getByRole("button", { name: "经典" }))

    expect(screen.queryByRole("heading", { name: "默认分组" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "常用" })).toBeNull()
    expect(
      screen.getByRole("navigation", { name: "我的名片清单" })
    ).toBeVisible()
    // 经典 = 按创建时间降序（B 01-03 > C 01-02 > A 01-01），与分组顺序无关。
    expect(tileNames()).toEqual(["名片 B", "名片 C", "名片 A"])

    await user.click(screen.getByRole("button", { name: "分组" }))

    // 切回分组模式：分组顺序与组内顺序原样还在（经典模式不写任何用户排序）。
    expect(screen.getByRole("heading", { name: "常用" })).toBeVisible()
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])
  })

  it("hides the mode toggle while the editing session is open", async () => {
    const user = userEvent.setup()
    renderManager()

    expect(screen.getByRole("button", { name: "经典" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "编辑模式" }))

    // 编辑只发生在分组视图里：toggle 是**隐藏**，不是禁用（编辑模式下没有它）。
    expect(screen.queryByRole("button", { name: "经典" })).toBeNull()
    expect(screen.queryByRole("button", { name: "分组" })).toBeNull()
    // 分组视图回来了：编辑模式里组头是标题输入框。
    expect(screen.getByDisplayValue("常用")).toBeVisible()
  })

  it("switches back to the grouped view when editing starts from the classic view", async () => {
    const user = userEvent.setup()
    renderManager()

    await user.click(screen.getByRole("button", { name: "经典" }))
    expect(screen.queryByRole("heading", { name: "常用" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "编辑模式" }))

    // 一次交互完成：进编辑就等于回到分组视图（组头、勾选框都回来了）。
    expect(screen.getByDisplayValue("常用")).toBeVisible()
    expect(screen.getAllByRole("checkbox")).toHaveLength(3)
    expect(screen.getByText("已选 0 张")).toBeVisible()
    // 切换只是视图状态，不能顺手把会话标脏。
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("puts the mode toggle in the title row on mobile and in the controls on desktop", () => {
    const { unmount } = render(<CardManager {...managerProps()} />)

    // jsdom 没有 `matchMedia` 的桌面匹配：默认走移动端那一支。
    const mobileTitleRow = screen.getByTestId("card-manager-title-row")
    expect(
      within(mobileTitleRow).getByRole("button", { name: "经典" })
    ).toBeVisible()
    expect(
      within(screen.getByTestId("card-manager-controls")).queryByRole("button", {
        name: "经典",
      })
    ).toBeNull()
    unmount()

    stubMatchMedia(true)
    renderManager()

    const desktopControls = screen.getByTestId("card-manager-controls")
    expect(
      within(desktopControls).getByRole("button", { name: "经典" })
    ).toBeVisible()
    expect(
      within(screen.getByTestId("card-manager-title-row")).queryByRole(
        "button",
        { name: "经典" }
      )
    ).toBeNull()
  })

  it("sticks the toolbar and bulk area but not the title row", () => {
    const { unmount } = render(<CardManager {...managerProps()} />)

    // 标题行照常滚走；工具栏 + 批量区自己吸顶（网页端偏移是站点页头的高度）。
    expect(screen.getByTestId("card-manager-title-row").className).not.toContain(
      "sticky"
    )
    const controls = screen.getByTestId("card-manager-controls")
    expect(controls.className).toContain("sticky")
    expect(controls.className).toContain("top-16")
    unmount()
  })
})

describe("CardManager collapsing", () => {
  it("keeps the group header and remembers the collapsed group per account", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CardManager {...managerProps()} />)

    await user.click(screen.getByRole("button", { name: "折叠常用" }))

    // 折叠只收起瓦片；组头（标题、计数、展开按钮）仍然在。
    expect(screen.queryByText("名片 B")).toBeNull()
    expect(screen.getByRole("heading", { name: "常用" })).toBeVisible()
    expect(screen.getByText("1 张")).toBeVisible()
    unmount()

    render(<CardManager {...managerProps()} />)
    expect(screen.queryByText("名片 B")).toBeNull()
    expect(screen.getByText("名片 A")).toBeVisible()

    unmount()
    render(<CardManager {...managerProps({ accountId: "platform-2" })} />)
    expect(screen.getByText("名片 B")).toBeVisible()
  })
})

describe("CardManager without a layout", () => {
  it("locks editing mode when the layout could not be loaded", async () => {
    const user = userEvent.setup()
    // 布局读失败：保存会整份覆盖成空 groups / defaultCardNumbers，必须挡住入口。
    renderManager({ layout: null })

    const editButton = screen.getByRole("button", { name: "编辑模式" })
    expect(editButton).toBeDisabled()
    expect(editButton).toHaveAttribute(
      "title",
      "读不到名片布局，刷新页面后再试。"
    )
    expect(
      document.getElementById(editButton.getAttribute("aria-describedby") ?? "")
    ).toHaveTextContent("读不到名片布局，刷新页面后再试。")

    await user.click(editButton)

    // 进不去编辑模式：没有批量操作区、没有复选框，连保存按钮都不在。
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull()
    expect(editButton).toBeVisible()
  })
})

describe("CardManager empty state", () => {
  it("creates the first card from the empty state", async () => {
    const user = userEvent.setup()
    const { onCreate } = renderManager({ cards: [], layout: null })

    expect(screen.getByText("还没有交换名片")).toBeVisible()
    await user.click(screen.getAllByRole("button", { name: "新建名片" })[0]!)

    expect(onCreate).toHaveBeenCalledOnce()
  })
})
