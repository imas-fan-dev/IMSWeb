import { render, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  cardFlipTransition,
  isCardFlipTransition,
} from "~/pages/account/me/namecards/card-grid-animation"
import { useCardGridFlip } from "~/pages/account/me/namecards/hooks/use-card-grid-flip"

/** jsdom 没有布局：瓦片的视口坐标、容器坐标与滚动只能这样喂进去。 */
type FakeRect = { left?: number; top: number; width?: number; height?: number }

const tileRects = new Map<string, FakeRect>()
let gridRect: FakeRect = { left: 0, top: 0, width: 200, height: 150 }

beforeEach(() => {
  tileRects.clear()
  gridRect = { left: 0, top: 0, width: 200, height: 150 }
})

function toDOMRect(rect: FakeRect): DOMRect {
  const left = rect.left ?? 0
  const width = rect.width ?? 200
  const height = rect.height ?? 150
  return {
    x: left,
    y: rect.top,
    left,
    top: rect.top,
    right: left + width,
    bottom: rect.top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

/** 只喂位置：ghost 插到前面时，后面的瓦片被顶下去（顶开之前它们已经在别处）。 */
function layout(rects: Record<string, FakeRect>) {
  tileRects.clear()
  for (const [cardId, rect] of Object.entries(rects)) tileRects.set(cardId, rect)
}

function stubGeometry() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const cardId = (this as HTMLElement).dataset?.cardId
      return toDOMRect(cardId ? (tileRects.get(cardId) ?? { top: 0 }) : gridRect)
    }
  )
}

/** 容器的滚动量（`measureTiles` 要把它加回到相对坐标里）。 */
function scrollGrid(left: number, top: number) {
  const root = gridRoot()
  Object.defineProperty(root, "scrollLeft", { value: left, configurable: true })
  Object.defineProperty(root, "scrollTop", { value: top, configurable: true })
}

function Harness({
  items,
  active,
  enabled = true,
}: {
  items: string[]
  active: boolean
  enabled?: boolean
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  useCardGridFlip({ rootRef, enabled, active })
  return (
    <div ref={rootRef} data-testid="grid-root">
      {items.map((cardId) => (
        <div
          key={cardId}
          data-testid="sortable-card-tile"
          data-card-id={cardId}
        />
      ))}
    </div>
  )
}

function tiles(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="sortable-card-tile"]'
    ),
  ]
}

function gridRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-testid="grid-root"]')
  if (!root) throw new Error("missing grid root")
  return root
}

function tile(cardId: string): HTMLElement {
  const found = tiles().find((node) => node.dataset.cardId === cardId)
  if (!found) throw new Error(`missing tile ${cardId}`)
  return found
}

/**
 * 过渡中途的位移：jsdom 量不出布局，`getComputedStyle().transform` 只会把内联值原样返回，
 * 所以「走到一半的插值」只能这样喂进去（浏览器里它就是那一刻渲染用的值）。
 */
function stubComputedTranslate(byCardId: Record<string, string>) {
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    ((element: Element) => {
      const cardId = (element as HTMLElement).dataset?.cardId
      return {
        transform: (cardId ? byCardId[cardId] : undefined) ?? "none",
      } as CSSStyleDeclaration
    }) as typeof window.getComputedStyle
  )
}

describe("useCardGridFlip", () => {
  it("inverts the shift of the tiles pushed aside and then animates them back", async () => {
    stubGeometry()
    layout({ a: { top: 0 }, b: { top: 150 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)

    // 落点 ghost 插在前面：两张瓦片各被顶下去一格。
    layout({ a: { top: 150 }, b: { top: 300 } })
    rerender(<Harness items={["a", "b"]} active={true} />)

    expect(tile("a").style.transform).toBe("translate(0px, -150px)")
    expect(tile("b").style.transform).toBe("translate(0px, -150px)")
    // 「倒着放」这一步必须没有过渡，否则动画会从原点缓慢爬过去。
    expect(tile("a").style.transition).toBe("none")

    // 下一帧切到自然位置 + 我们的过渡：位移真的动起来。
    await waitFor(() => expect(tile("a").style.transform).toBe(""))
    expect(tile("b").style.transform).toBe("")
    expect(isCardFlipTransition(tile("a").style.transition)).toBe(true)
    expect(tile("a").style.transition).toBe(cardFlipTransition())
  })

  it("uses the first frame of a drag session as the baseline, without animating it", () => {
    stubGeometry()
    layout({ a: { top: 0 }, b: { top: 150 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={false} />)

    // 会话开始的那一帧：整批名片刚离开列表、网格重排了，但这不是「插入」，不动画。
    layout({ a: { top: 150 }, b: { top: 300 } })
    rerender(<Harness items={["a", "b"]} active={true} />)

    expect(tile("a").style.transform).toBe("")
    expect(tile("a").style.transition).toBe("")
  })

  it("does not measure or animate at all when disabled", () => {
    stubGeometry()
    layout({ a: { top: 0 } })
    const { rerender } = render(
      <Harness items={["a"]} active={true} enabled={false} />
    )

    layout({ a: { top: 150 } })
    rerender(<Harness items={["a"]} active={true} enabled={false} />)

    expect(tile("a").style.transform).toBe("")
    expect(tile("a").style.transition).toBe("")
  })

  it("clears its own inline styles when the drag ends", () => {
    stubGeometry()
    layout({ a: { top: 0 }, b: { top: 150 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)
    layout({ a: { top: 150 }, b: { top: 300 } })
    rerender(<Harness items={["a", "b"]} active={true} />)
    expect(tile("a").style.transform).not.toBe("")

    rerender(<Harness items={["a", "b"]} active={false} />)

    for (const node of tiles()) {
      expect(node.style.transform).toBe("")
      expect(node.style.transition).toBe("")
    }
  })

  it("leaves dnd-kit's own settle animation alone on drag end", () => {
    stubGeometry()
    layout({ a: { top: 0 } })
    const { rerender } = render(<Harness items={["a"]} active={true} />)
    layout({ a: { top: 150 } })
    rerender(<Harness items={["a"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")

    // 落位那一刻 React 会把 dnd-kit 自己的收尾位移写回同一个元素。
    tile("a").style.transform = "translate3d(0px, -150px, 0)"
    tile("a").style.transition = "transform 200ms ease"

    rerender(<Harness items={["a"]} active={false} />)

    expect(tile("a").style.transform).toBe("translate3d(0px, -150px, 0)")
    expect(tile("a").style.transition).toBe("transform 200ms ease")
  })

  it("recovers the true natural position while a tile is mid-transition", async () => {
    stubGeometry()
    layout({ a: { top: 150 } })
    const { rerender } = render(<Harness items={["a"]} active={true} />)

    // 第二帧：被顶下一格 → 写下 -150 的位移（把瓦片倒着放回上一帧的位置）。
    layout({ a: { top: 300 } })
    rerender(<Harness items={["a"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")

    // 下一帧 rAF 放回倒放态：内联 transform 摘掉、只留 180ms 的过渡，过渡此刻走到 -75。
    // 这一刻瓦片渲染在 225（自然 300 加插值 -75），布局其实一动没动——量到的「半路位置」
    // 只有计算样式里那份插值能还原回自然位置（反解内联样式会得到 0）。
    await waitFor(() => expect(tile("a").style.transform).toBe(""))
    stubComputedTranslate({ a: "matrix(1, 0, 0, 1, 0, -75)" })
    layout({ a: { top: 225 } })
    rerender(<Harness items={["a"]} active={true} />)

    // 自然位置 225 - (-75) = 300 == 上一帧记下的 300：布局没变，不写任何位移。
    expect(tile("a").style.transform).toBe("")
  })

  it("pins a mid-transition tile to where it is painted when the layout moves again", async () => {
    stubGeometry()
    layout({ a: { top: 0 } })
    const { rerender } = render(<Harness items={["a"]} active={true} />)

    // 第二帧：落点 ghost 插到前面 → 倒放 -150（渲染位置仍是 0），随后过渡开始往回走。
    layout({ a: { top: 150 } })
    rerender(<Harness items={["a"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")
    await waitFor(() => expect(tile("a").style.transform).toBe(""))

    // 过渡走到一半（插值 -75，渲染在 75）时布局又变了：自然位置回到 0。
    stubComputedTranslate({ a: "matrix(1, 0, 0, 1, 0, -75)" })
    layout({ a: { top: -75 } })
    rerender(<Harness items={["a"]} active={true} />)

    // 倒放的位置是它**此刻渲染的地方**（75 = 布局 0 + 位移 75），不是上一个自然位置（150）：
    // 只按自然位置倒放会让它从 75 弹回 150，动画也从那儿才开始。
    expect(tile("a").style.transform).toBe("translate(0px, 75px)")
  })

  it("leaves a tile where it is when a layout change is undone within one frame", () => {
    stubGeometry()
    layout({ a: { top: 0 } })
    const { rerender } = render(<Harness items={["a"]} active={true} />)

    // ghost 插到前面：布局下移一格，瓦片被倒放回原来的位置（渲染仍在 0，还没开始过渡）。
    layout({ a: { top: 150 } })
    rerender(<Harness items={["a"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")

    // 同一帧里 ghost 又挪走（指针一帧里越过两次边界）：布局回到 0，而瓦片此刻渲染在
    // 0（布局 0 + 已经写下的 -150）。位移该收成 0——它一直就在那儿，不该再挪一格。
    layout({ a: { top: -150 } })
    rerender(<Harness items={["a"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, 0px)")
  })

  it("skips zero-size tiles without writing offsets or joining the baseline", () => {
    stubGeometry()
    layout({ a: { top: 0, width: 0, height: 0 }, b: { top: 150 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)

    // a 量不到有效盒子（折叠/隐藏/还没布局）：不写位移、也不进基线。
    layout({ a: { top: 150, width: 0, height: 0 }, b: { top: 300 } })
    rerender(<Harness items={["a", "b"]} active={true} />)

    expect(tile("a").style.transform).toBe("")
    expect(tile("a").style.transition).toBe("")
    expect(tile("b").style.transform).toBe("translate(0px, -150px)")
  })

  it("drops a whole frame that exceeds the container, then rebaselines it", () => {
    stubGeometry()
    layout({ a: { top: 0 }, b: { top: 150 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)

    // 一次提交里位移超过容器两倍高（150 × 2 = 300）：几乎一定是量错了，整批不写。
    layout({ a: { top: 1000 }, b: { top: 1150 } })
    rerender(<Harness items={["a", "b"]} active={true} />)
    expect(tile("a").style.transform).toBe("")
    expect(tile("b").style.transform).toBe("")

    // 被拦下的那一帧当成新基线：下一帧再动一格，量出来的就是正常的一格位移。
    layout({ a: { top: 1150 }, b: { top: 1300 } })
    rerender(<Harness items={["a", "b"]} active={true} />)
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")
  })

  it("compensates the container's own scroll instead of reading it as a layout change", () => {
    stubGeometry()
    gridRect = { left: 100, top: 50, width: 200, height: 150 }
    layout({ a: { left: 110, top: 60 }, b: { left: 110, top: 210 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)

    // 用户滚了一屏（或 dnd-kit 自动滚动）：视口坐标整体上移 200，但相对容器没动。
    scrollGrid(0, 200)
    layout({ a: { left: 110, top: -140 }, b: { left: 110, top: 10 } })
    rerender(<Harness items={["a", "b"]} active={true} />)

    // 滚动不是布局变化：相对容器位置没变，一张也不该被位移。
    expect(tile("a").style.transform).toBe("")
    expect(tile("b").style.transform).toBe("")
  })

  it("moves tiles by the real delta even when the container is scrolled", () => {
    stubGeometry()
    gridRect = { left: 100, top: 50, width: 200, height: 150 }
    layout({ a: { left: 110, top: 60 }, b: { left: 110, top: 210 } })
    const { rerender } = render(<Harness items={["a", "b"]} active={true} />)

    // 同时发生两件事：容器滚了 200（视口坐标上移），ghost 把瓦片往下顶了一格。
    scrollGrid(0, 200)
    layout({ a: { left: 110, top: 10 }, b: { left: 110, top: 160 } })
    rerender(<Harness items={["a", "b"]} active={true} />)

    // 位移只算**真实**的一格 150；把滚动也算进去的话会变成 350。
    expect(tile("a").style.transform).toBe("translate(0px, -150px)")
    expect(tile("b").style.transform).toBe("translate(0px, -150px)")
  })
})
