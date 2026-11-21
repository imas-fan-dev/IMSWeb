import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import type { FudabaOwnerCard } from "~/lib/api"
import { CardManager } from "~/pages/account/me/namecards/card-manager"

function card(
  cardNumber: number,
  producerName: string,
  overrides: Partial<FudabaOwnerCard> = {}
) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName,
    exchangeMode: "auto",
    ...overrides,
  })
}

/** A、B 已发布（可勾选），C 还是草稿（框选也不该收进来）。 */
const CARDS = [
  card(1, "名片 A"),
  card(2, "名片 B"),
  card(3, "名片 C", { publicationStatus: "draft" }),
]

const LAYOUT = makeNamecardCardLayout({
  defaultCardNumbers: [1, 2, 3],
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

/**
 * jsdom 里所有 rect 都是 0，所以给瓦片铺一套按 DOM 顺序排下去的假几何：
 * 每张 100×100、纵向相隔 100px（A 在 0、B 在 100、C 在 200）。
 * 其余节点量成零尺寸——框选只与瓦片求交。
 */
function stubTileGeometry() {
  return vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (this.getAttribute("data-testid") !== "sortable-card-tile") {
        return makeRect(0, 0, 0, 0)
      }
      const tiles = [
        ...document.querySelectorAll('[data-testid="sortable-card-tile"]'),
      ]
      return makeRect(0, tiles.indexOf(this) * 100, 100, 100)
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

type PointerName = "pointerdown" | "pointermove" | "pointerup"

/**
 * jsdom 没有真指针：框选走的是 `window` 上的 `pointermove`/`pointerup` 与 React 的
 * `onPointerDown`，所以这里只需要指针事件本身（`pointerType` 决定它是不是鼠标/笔）。
 */
function pointerEvent(
  type: PointerName,
  clientX: number,
  clientY: number,
  options: { pointerType?: string; shiftKey?: boolean } = {}
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
    shiftKey: options.shiftKey ?? false,
  })
  for (const [key, value] of Object.entries({
    pointerType: options.pointerType ?? "mouse",
    pointerId: 1,
    isPrimary: true,
  })) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

/** 列表容器（框选的起点必须落在它里面的空白处）。 */
function listSurface() {
  return screen.getByRole("navigation", { name: "我的名片清单" })
}

/**
 * 在列表空白处按下 → 拖到终点 → 抬手。`target` 默认就是列表容器本身（纯空白）。
 */
async function marqueeDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { target?: EventTarget; pointerType?: string; shiftKey?: boolean } = {}
) {
  await act(async () => {
    const pointerOptions = {
      pointerType: options.pointerType,
      shiftKey: options.shiftKey,
    }
    ;(options.target ?? listSurface()).dispatchEvent(
      pointerEvent("pointerdown", from.x, from.y, pointerOptions)
    )
    window.dispatchEvent(pointerEvent("pointermove", to.x, to.y, pointerOptions))
    window.dispatchEvent(pointerEvent("pointerup", to.x, to.y, pointerOptions))
  })
}

/** 只按下抬手、不移动：这就是「点一下空白」。 */
async function clickBlank() {
  await act(async () => {
    listSurface().dispatchEvent(pointerEvent("pointerdown", 300, 300))
    window.dispatchEvent(pointerEvent("pointerup", 300, 300))
  })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  document.body.style.userSelect = ""
  vi.restoreAllMocks()
})

describe("CardManager marquee selection", () => {
  it("replaces the selection with the intersecting selectable cards", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    expect(screen.getByText("已选 2 张")).toBeVisible()

    // 只框住第一张：矩形的语义是**替换**，没被框到的 B 退出选择集。
    await marqueeDrag({ x: 10, y: 10 }, { x: 90, y: 60 })

    expect(screen.getByText("已选 1 张")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).not.toBeChecked()
    // 抬手后矩形消失、文本选择恢复。
    expect(screen.queryByTestId("card-marquee")).toBeNull()
    expect(document.body.style.userSelect).toBe("")
  })

  it("appends to the selection while Shift is held", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)

    await marqueeDrag({ x: 10, y: 10 }, { x: 90, y: 60 })
    expect(screen.getByText("已选 1 张")).toBeVisible()

    await marqueeDrag(
      { x: 10, y: 110 },
      { x: 90, y: 160 },
      { shiftKey: true }
    )

    expect(screen.getByText("已选 2 张")).toBeVisible()
    expect(screen.getByRole("checkbox", { name: /名片 A/ })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /名片 B/ })).toBeChecked()
  })

  it("only picks up cards that can be checked", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)

    // 矩形罩住三张，但 C 是草稿卡：它没有复选框，也从不进选择集。
    await marqueeDrag({ x: 10, y: 10 }, { x: 90, y: 250 })

    expect(screen.getByText("已选 2 张")).toBeVisible()
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.queryByRole("checkbox", { name: /名片 C/ })).toBeNull()
  })

  it("draws the rectangle while dragging and blocks text selection meanwhile", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)

    await act(async () => {
      listSurface().dispatchEvent(pointerEvent("pointerdown", 10, 10))
      window.dispatchEvent(pointerEvent("pointermove", 90, 60))
    })

    const marquee = screen.getByTestId("card-marquee")
    expect(marquee).toHaveStyle({
      left: "10px",
      top: "10px",
      width: "80px",
      height: "50px",
    })
    expect(marquee.className).toContain("pointer-events-none")
    expect(marquee).toHaveAttribute("aria-hidden", "true")
    // 拖动期间不进入文本选择。
    expect(document.body.style.userSelect).toBe("none")

    await act(async () => {
      window.dispatchEvent(pointerEvent("pointerup", 90, 60))
    })

    expect(document.body.style.userSelect).toBe("")
  })

  it("clears the selection when the blank area is clicked without dragging", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))
    expect(screen.getByText("已选 2 张")).toBeVisible()

    await clickBlank()

    expect(screen.getByText("已选 0 张")).toBeVisible()
    expect(screen.queryByTestId("card-marquee")).toBeNull()
  })

  it("never starts from a tile press", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)
    const tile = screen.getByRole("checkbox", { name: /名片 A/ })

    await marqueeDrag({ x: 10, y: 10 }, { x: 90, y: 250 }, { target: tile })

    // 在瓦片上按下是「勾选/拖拽」，不是框选：既没有矩形，也没有整片替换。
    expect(screen.queryByTestId("card-marquee")).toBeNull()
    expect(screen.getByText("已选 0 张")).toBeVisible()
  })

  it("is disabled for touch pointers", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    renderManager()

    await enterEditing(user)
    await user.click(screen.getByRole("button", { name: "全选" }))

    await marqueeDrag(
      { x: 10, y: 10 },
      { x: 90, y: 250 },
      { pointerType: "touch" }
    )

    // 移动端完全不启用：选择集原样不动。
    expect(screen.getByText("已选 2 张")).toBeVisible()
    expect(screen.queryByTestId("card-marquee")).toBeNull()
  })

  it("stays out of the read-only view", async () => {
    stubTileGeometry()
    renderManager()

    await marqueeDrag({ x: 10, y: 10 }, { x: 90, y: 250 })

    expect(screen.queryByTestId("card-marquee")).toBeNull()
    expect(screen.queryByText(/已选/)).toBeNull()
  })

  it("hides the rectangle again when the editing session ends mid-drag", async () => {
    const user = userEvent.setup()
    stubTileGeometry()
    const { unmount } = render(<CardManager {...managerProps()} />)

    await enterEditing(user)
    await act(async () => {
      listSurface().dispatchEvent(pointerEvent("pointerdown", 10, 10))
      window.dispatchEvent(pointerEvent("pointermove", 90, 60))
    })
    expect(screen.getByTestId("card-marquee")).toBeVisible()

    unmount()

    expect(document.body.style.userSelect).toBe("")
  })
})
