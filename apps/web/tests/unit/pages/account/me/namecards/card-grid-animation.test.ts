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
  isNegligibleCardFlipOffset,
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

  it("rounds each component so the value never comes out in exponential notation", () => {
    // 量测噪声与过渡半路的浮点尾巴会让分量变成 4.0547e-07 这种极小值，而 CSSOM 把它们序列化
    // 成指数写法（`9.04e-05`）——收尾时反解认不出来，位移就永久残留在瓦片上。取整后写出去的
    // 永远是整数像素（FLIP 的起点差半个像素看不出来，终点本来就是 `transform: none`）。
    expect(cardFlipTransform({ dx: 4.0547e-7, dy: -311 })).toBe(
      "translate(0px, -311px)"
    )
    // 写出来的分量永远是整数像素（旧版会写出 `4.0547e-07px` 这类指数零件）。
    expect(cardFlipTransform({ dx: 4.0547e-7, dy: -311 })).toMatch(
      /^translate\(-?\d+px, -?\d+px\)$/
    )
    expect(cardFlipTransform({ dx: 235.4, dy: -150.6 })).toBe(
      "translate(235px, -151px)"
    )
    // `-0` 得写成 `0`：`translate(-0px, 0px)` 谁也不认识。
    expect(cardFlipTransform({ dx: -0.4, dy: -0 })).toBe("translate(0px, 0px)")
  })

  it("does not claim dnd-kit's own transforms or an empty value", () => {
    // dnd-kit 写的是 `translate3d(x, y, 0) scale…`；两者混起来清理就会互相抹掉。
    expect(cardFlipOffsetFromStyle("translate3d(12px, 30px, 0)")).toBeNull()
    expect(cardFlipOffsetFromStyle("translate(12px, 30px) scaleX(1)")).toBeNull()
    expect(cardFlipOffsetFromStyle("matrix(1, 0, 0, 1, 12, 30)")).toBeNull()
    expect(cardFlipOffsetFromStyle("")).toBeNull()
    expect(cardFlipOffsetFromStyle(null)).toBeNull()
  })

  it("reads back the exponential notation the CSSOM produces for tiny components", () => {
    // 现场残留就是这两类写法（`translate(235px, 9.04e-05px)`）；普通小数与指数都得认，
    // 否则收尾时判不出「这串是我们写的」、账本被丢掉、位移留在 DOM 上。
    expect(cardFlipOffsetFromStyle("translate(235px, 9.04e-05px)")).toEqual({
      dx: 235,
      dy: 9.04e-5,
    })
    expect(cardFlipOffsetFromStyle("translate(4.0547e-07px, -311px)")).toEqual({
      dx: 4.0547e-7,
      dy: -311,
    })
    expect(cardFlipOffsetFromStyle("translate(1.5E+2px, -311px)")).toEqual({
      dx: 150,
      dy: -311,
    })
  })
})

describe("isNegligibleCardFlipOffset", () => {
  it("flags the sub-pixel noise that must not be written", () => {
    // 用户现场同网格里那 4 张瓦片上的残渣就是这一类（视觉上等于没动）。
    expect(isNegligibleCardFlipOffset({ dx: -7.97e-5, dy: 4.46e-5 })).toBe(true)
    expect(isNegligibleCardFlipOffset({ dx: 0, dy: 0 })).toBe(true)
    expect(isNegligibleCardFlipOffset({ dx: 0.49, dy: -0.49 })).toBe(true)
  })

  it("keeps anything that survives the pixel rounding", () => {
    // 取整到整像素，边界就是半个像素：|分量| >= 0.5 会写成非零像素，必须照写。
    expect(isNegligibleCardFlipOffset({ dx: 0.5, dy: 0 })).toBe(false)
    expect(isNegligibleCardFlipOffset({ dx: 0, dy: -311 })).toBe(false)
    expect(isNegligibleCardFlipOffset({ dx: 311, dy: -150 })).toBe(false)
  })

  it("takes an explicit epsilon", () => {
    expect(isNegligibleCardFlipOffset({ dx: 2, dy: 2 }, 3)).toBe(true)
    expect(isNegligibleCardFlipOffset({ dx: 2, dy: -4 }, 3)).toBe(false)
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
    // 旧版写下的指数形态也会经 `getComputedStyle` 回到量测里（那时内联那串还没被序列化回原文）。
    expect(
      cardFlipOffsetFromComputedStyle("translate(4.0547e-07px, -311px)")
    ).toEqual({
      dx: 4.0547e-7,
      dy: -311,
    })
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
