import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import { CardManager } from "~/pages/account/me/namecards/card-manager"

function card(cardNumber: number, producerName: string) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
  })
}

const CARDS = [card(1, "名片 A"), card(2, "名片 B"), card(3, "名片 C")]

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
    onSelect: vi.fn(),
    onCreate: vi.fn(),
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
  it("switches to the classic list without group headers, keeping the order", async () => {
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
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])

    await user.click(screen.getByRole("button", { name: "分组" }))

    expect(screen.getByRole("heading", { name: "常用" })).toBeVisible()
    expect(tileNames()).toEqual(["名片 C", "名片 A", "名片 B"])
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

describe("CardManager empty state", () => {
  it("creates the first card from the empty state", async () => {
    const user = userEvent.setup()
    const { onCreate } = renderManager({ cards: [], layout: null })

    expect(screen.getByText("还没有交换名片")).toBeVisible()
    await user.click(screen.getAllByRole("button", { name: "新建名片" })[0]!)

    expect(onCreate).toHaveBeenCalledOnce()
  })
})
