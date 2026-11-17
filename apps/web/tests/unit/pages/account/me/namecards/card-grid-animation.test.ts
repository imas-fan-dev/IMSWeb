import { describe, expect, it } from "vitest"

import {
  CARD_FLIP_EASING,
  CARD_FLIP_INVERT_TRANSITION,
  cardFlipOffsetFromComputedStyle,
  cardFlipOffsetFromStyle,
  cardFlipTransition,
  cardFlipTransform,
  exceedsCardFlipOffsetLimit,
  flipOffsets,
  ghostEnterDelayMs,
  GHOST_ENTER_STAGGER_LIMIT,
  GHOST_ENTER_STAGGER_MS,
  isCardFlipTransition,
  type CardFlipRect,
} from "~/pages/account/me/namecards/card-grid-animation"

function rect(left: number, top: number, size = 200): CardFlipRect {
  return { left, top, width: size, height: size * 0.75 }
}

function rectangles(entries: Record<string, CardFlipRect>) {
  return new Map(Object.entries(entries))
}

describe("flipOffsets", () => {
  it("returns nothing for cards that did not move", () => {
    const before = rectangles({ a: rect(0, 0), b: rect(200, 0) })

    expect(flipOffsets(before, rectangles({ a: rect(0, 0), b: rect(200, 0) }))).toEqual(
      new Map()
    )
  })

  it("inverts the movement of each card on both axes", () => {
    const before = rectangles({
      right: rect(200, 0),
      down: rect(0, 110),
      diagonal: rect(200, 110),
    })
    const after = rectangles({
      right: rect(0, 0),
      down: rect(0, 220),
      diagonal: rect(400, 330),
    })

    expect(flipOffsets(before, after)).toEqual(
      new Map([
        ["right", { dx: 200, dy: 0 }],
        ["down", { dx: 0, dy: -110 }],
        ["diagonal", { dx: -200, dy: -220 }],
      ])
    )
  })

  it("ignores cards missing from one of the two frames", () => {
    const before = rectangles({ kept: rect(0, 0), left: rect(0, 110) })

    // 拖动中整批名片离开了列表：新一帧量不到它们，不能靠这一点算出「位移」。
    expect(flipOffsets(before, rectangles({ kept: rect(0, 220) }))).toEqual(
      new Map([["kept", { dx: 0, dy: -220 }]])
    )
  })

  it("treats a size change at the same position as no movement", () => {
    const before = rectangles({ a: rect(0, 0, 200) })

    expect(
      flipOffsets(before, rectangles({ a: rect(0, 0, 260) }))
    ).toEqual(new Map())
  })
})

describe("cardFlipTransform", () => {
  it("writes a plain translation and reads it back", () => {
    expect(cardFlipTransform({ dx: 12, dy: -30 })).toBe("translate(12px, -30px)")
    expect(cardFlipOffsetFromStyle("translate(12px, -30px)")).toEqual({
      dx: 12,
      dy: -30,
    })
  })

  it("does not claim dnd-kit's own transforms or an empty value", () => {
    // dnd-kit 写的是 `translate3d(x, y, 0) scale…`；两者混起来清理就会互相抹掉。
    expect(cardFlipOffsetFromStyle("translate3d(12px, 30px, 0)")).toBeNull()
    expect(cardFlipOffsetFromStyle("translate(12px, 30px) scaleX(1)")).toBeNull()
    expect(cardFlipOffsetFromStyle("")).toBeNull()
    expect(cardFlipOffsetFromStyle(null)).toBeNull()
  })
})

describe("cardFlipOffsetFromComputedStyle", () => {
  it("reads the translation out of the browser's matrix forms", () => {
    // 浏览器把计算值序列化成一个矩阵：平移是最后的 tx/ty（matrix）、第 13、14 个数（matrix3d）。
    expect(cardFlipOffsetFromComputedStyle("matrix(1, 0, 0, 1, 12, -30)")).toEqual({
      dx: 12,
      dy: -30,
    })
    expect(
      cardFlipOffsetFromComputedStyle(
        "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12, -30, 0, 1)"
      )
    ).toEqual({ dx: 12, dy: -30 })
  })

  it("reads the author-written forms jsdom hands back", () => {
    // jsdom 没有布局，计算样式就是作者写的那串（还可能跟着 dnd-kit 的缩放）。
    expect(cardFlipOffsetFromComputedStyle("translate(0px, -150px)")).toEqual({
      dx: 0,
      dy: -150,
    })
    expect(
      cardFlipOffsetFromComputedStyle(
        "translate3d(10px, -150px, 0) scaleX(1) scaleY(1)"
      )
    ).toEqual({ dx: 10, dy: -150 })
  })

  it("treats anything it cannot read as no movement", () => {
    expect(cardFlipOffsetFromComputedStyle("none")).toEqual({ dx: 0, dy: 0 })
    expect(cardFlipOffsetFromComputedStyle("")).toEqual({ dx: 0, dy: 0 })
    expect(cardFlipOffsetFromComputedStyle(null)).toEqual({ dx: 0, dy: 0 })
    expect(cardFlipOffsetFromComputedStyle("rotate(30deg)")).toEqual({
      dx: 0,
      dy: 0,
    })
    // 参数读不出数字时也不能把 NaN 传出去（它会污染整条坐标计算）。
    expect(cardFlipOffsetFromComputedStyle("matrix(1, 0, 0, 1, x, y)")).toEqual({
      dx: 0,
      dy: 0,
    })
  })
})

describe("cardFlipTransition", () => {
  it("marks its own transition by easing, not by duration", () => {
    // 浏览器会把 `180ms` 序列化成 `0.18s`，只有缓动是我们独有的标记。
    expect(isCardFlipTransition(cardFlipTransition())).toBe(true)
    expect(isCardFlipTransition("transform 0.18s cubic-bezier(0.2, 0, 0, 1)")).toBe(
      true
    )
    // 倒放那一步写的是 `none`，也是我们写的，收尾时要一起还回去。
    expect(isCardFlipTransition(CARD_FLIP_INVERT_TRANSITION)).toBe(true)
    expect(isCardFlipTransition("transform 200ms ease")).toBe(false)
    expect(isCardFlipTransition(CARD_FLIP_EASING)).toBe(true)
  })
})

describe("exceedsCardFlipOffsetLimit", () => {
  it("passes offsets that fit inside twice the container", () => {
    const offsets = new Map([
      ["a", { dx: 300, dy: -300 }],
      ["b", { dx: 0, dy: 300 }],
    ])

    // 边界上是「不大于」：2 × 200 / 2 × 150 正好等于上限，放行。
    expect(exceedsCardFlipOffsetLimit(offsets, 200, 150)).toBe(false)
  })

  it("flags the whole batch when any single tile overshoots either axis", () => {
    expect(
      exceedsCardFlipOffsetLimit(new Map([["a", { dx: 401, dy: 0 }]]), 200, 150)
    ).toBe(true)
    expect(
      exceedsCardFlipOffsetLimit(new Map([["a", { dx: 0, dy: -301 }]]), 200, 150)
    ).toBe(true)
    expect(
      exceedsCardFlipOffsetLimit(
        new Map([
          ["a", { dx: 10, dy: 10 }],
          ["b", { dx: -51141, dy: 0 }],
        ]),
        200,
        150
      )
    ).toBe(true)
  })

  it("treats every non-zero offset as too large for a zero-size container", () => {
    expect(exceedsCardFlipOffsetLimit(new Map(), 0, 0)).toBe(false)
    expect(
      exceedsCardFlipOffsetLimit(new Map([["a", { dx: 1, dy: 0 }]]), 0, 0)
    ).toBe(true)
  })
})

describe("ghostEnterDelayMs", () => {
  it("stagger by step and stop at the stagger limit", () => {
    expect(ghostEnterDelayMs(0)).toBe(0)
    expect(ghostEnterDelayMs(1)).toBe(GHOST_ENTER_STAGGER_MS)
    expect(ghostEnterDelayMs(GHOST_ENTER_STAGGER_LIMIT - 1)).toBe(
      (GHOST_ENTER_STAGGER_LIMIT - 1) * GHOST_ENTER_STAGGER_MS
    )
    // 20 张也只错 6 档，拖尾不至于长到看不完。
    expect(ghostEnterDelayMs(20)).toBe(
      (GHOST_ENTER_STAGGER_LIMIT - 1) * GHOST_ENTER_STAGGER_MS
    )
    expect(ghostEnterDelayMs(-3)).toBe(0)
  })
})
