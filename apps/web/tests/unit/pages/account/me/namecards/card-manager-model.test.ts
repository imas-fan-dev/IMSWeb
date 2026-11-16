import { afterEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import {
  applyLayout,
  buildCardGroups,
  cardGroupHeading,
  cardGroupKey,
  cardGroupViewTransitionName,
  cardViewTransitionName,
  flattenCardGroups,
  quickCardIdSet,
} from "~/pages/account/me/namecards/card-manager-model"

function card(cardNumber: number) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName: `名片 ${cardNumber}`,
  })
}

function numbers(cards: readonly { cardNumber: number }[]) {
  return cards.map((item) => item.cardNumber)
}

describe("buildCardGroups", () => {
  it("puts the default group first with no title", () => {
    const groups = buildCardGroups(
      [card(1), card(2), card(3)],
      makeNamecardCardLayout({
        defaultCardNumbers: [1, 3],
        groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
      })
    )

    expect(groups.map((group) => group.id)).toEqual([null, "g-1"])
    expect(groups.map((group) => group.title)).toEqual([null, "常用"])
    expect(groups.map((group) => numbers(group.cards))).toEqual([[1, 3], [2]])
    expect(cardGroupKey(groups[0]!)).toBe("default")
    expect(cardGroupKey(groups[1]!)).toBe("g-1")
  })

  it("keeps the order of the groups and of the cards inside each one", () => {
    const groups = buildCardGroups(
      [card(1), card(2), card(3), card(4)],
      makeNamecardCardLayout({
        defaultCardNumbers: [4],
        groups: [
          { id: "g-2", title: "第二组", cardNumbers: [2] },
          { id: "g-1", title: "第一组", cardNumbers: [3, 1] },
        ],
      })
    )

    expect(groups.map((group) => group.title)).toEqual([
      null,
      "第二组",
      "第一组",
    ])
    expect(groups.map((group) => numbers(group.cards))).toEqual([
      [4],
      [2],
      [3, 1],
    ])
  })

  it("drops layout numbers the owner no longer has, and groups left empty", () => {
    const groups = buildCardGroups(
      [card(1), card(2)],
      makeNamecardCardLayout({
        defaultCardNumbers: [1],
        groups: [
          { id: "g-empty", title: "只剩别人的卡", cardNumbers: [9] },
          { id: "g-1", title: "常用", cardNumbers: [2] },
        ],
      })
    )

    expect(groups.map((group) => group.title)).toEqual([null, "常用"])
    expect(groups.map((group) => numbers(group.cards))).toEqual([[1], [2]])
  })

  it("puts cards missing from the layout at the front of the default group", () => {
    const groups = buildCardGroups(
      [card(1), card(2), card(3)],
      makeNamecardCardLayout({
        defaultCardNumbers: [1],
        groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
      })
    )

    // 3 是保存布局之后新建的卡：不丢，补在默认分组**最前**（与服务端归一 same 口径），
    // 既不抢分组里的 2，也不落在末尾等下次刷新才跳上去。
    expect(groups.map((group) => numbers(group.cards))).toEqual([[3, 1], [2]])
    expect(numbers(flattenCardGroups(groups))).toEqual([3, 1, 2])
  })

  it("lets the named group claim a shared number first, like the server does", () => {
    const groups = buildCardGroups(
      [card(1), card(2)],
      makeNamecardCardLayout({
        defaultCardNumbers: [1],
        groups: [{ id: "g-1", title: "常用", cardNumbers: [1, 2] }],
      })
    )

    // 与服务端 `normalizeCardLayout` 同序：分组先认领编号 1；默认分组没有卡就不渲染。
    expect(groups.map((group) => group.title)).toEqual(["常用"])
    expect(groups.map((group) => numbers(group.cards))).toEqual([[1, 2]])
  })

  it("keeps every owned card even when two of them share a number", () => {
    const groups = buildCardGroups(
      [card(1), { ...card(1), id: "card-1-b" }],
      makeNamecardCardLayout({ defaultCardNumbers: [1] })
    )

    // 编号撞车（异常数据）时，先让默认分组认领编号 1 的卡，另一张作为「布局里没有」
    // 补到默认分组最前——任何一张手上的卡都不能消失，顺序按缺卡规则统一。
    expect(groups[0]?.cards.map((item) => item.id)).toEqual([
      "card-1-b",
      "card-1",
    ])
  })

  it("falls back to one default group holding every card when there is no layout", () => {
    const groups = buildCardGroups([card(2), card(1)], null)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.title).toBeNull()
    expect(groups[0]?.id).toBeNull()
    // 卡片顺序沿用服务端给的列表顺序（新卡在前），不再自己排一次。
    expect(numbers(groups[0]!.cards)).toEqual([2, 1])
  })

  it("trims group titles and falls back for blank ones", () => {
    const groups = buildCardGroups(
      [card(1), card(2), card(3)],
      makeNamecardCardLayout({
        groups: [
          { id: "g-1", title: "  常用  ", cardNumbers: [1] },
          { id: "g-2", title: "   ", cardNumbers: [2] },
          { id: "g-3", title: "他组", cardNumbers: [3] },
        ],
      })
    )

    // 三张卡都在命名分组里 → 默认分组没有卡，不渲染（用户口径：它也不需要组头）。
    expect(groups.map(cardGroupHeading)).toEqual([
      "常用",
      "未命名分组",
      "他组",
    ])
  })
})

describe("flattenCardGroups", () => {
  it("flattens the default group before the named groups", () => {
    const groups = buildCardGroups(
      [card(1), card(2), card(3), card(4)],
      makeNamecardCardLayout({
        defaultCardNumbers: [4, 1],
        groups: [
          { id: "g-1", title: "常用", cardNumbers: [2] },
          { id: "g-2", title: "备用", cardNumbers: [3] },
        ],
      })
    )

    expect(numbers(flattenCardGroups(groups))).toEqual([4, 1, 2, 3])
  })
})

describe("quickCardIdSet", () => {
  it("maps the quick list numbers onto card ids", () => {
    const cards = [card(1), card(2)]
    const quickCardIds = quickCardIdSet(
      cards,
      makeNamecardCardLayout({ quickCardNumbers: [2, 9] })
    )

    expect([...quickCardIds]).toEqual(["card-2"])
  })
})

describe("view transition names", () => {
  it("cleans a card id into a CSS ident", () => {
    expect(cardViewTransitionName("9f3c-1")).toMatch(/^card-9f3c-1-[a-z0-9]+$/)
    expect(cardViewTransitionName("owner card?#")).toMatch(
      /^card-owner-card-[a-z0-9]+$/
    )
    expect(cardViewTransitionName("card-a")).toMatch(/^[A-Za-z_-][\w-]*$/)
    // 清洗后同形的两个 id 也不能撞名：重复的 view-transition-name 会被浏览器忽略。
    expect(cardViewTransitionName("a:b")).not.toBe(
      cardViewTransitionName("a-b")
    )
  })

  it("names group headers apart from the default group", () => {
    expect(cardGroupViewTransitionName({ id: null })).toMatch(
      /^group-default-[a-z0-9]+$/
    )
    expect(cardGroupViewTransitionName({ id: "g-1" })).toMatch(
      /^group-g-1-[a-z0-9]+$/
    )
  })
})

describe("applyLayout", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition")
  })

  it("mutates synchronously when view transitions are unavailable", () => {
    const mutate = vi.fn()

    expect(() => applyLayout(mutate)).not.toThrow()
    expect(mutate).toHaveBeenCalledOnce()
  })

  it("wraps the mutation in a view transition when the browser supports it", () => {
    const mutate = vi.fn()
    const startViewTransition = vi.fn((update: () => void) => {
      update()
      return { finished: Promise.resolve() }
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })

    applyLayout(mutate)

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledOnce()
  })

  it("skips the transition when the user asked for reduced motion", () => {
    const mutate = vi.fn()
    const startViewTransition = vi.fn()
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    )

    applyLayout(mutate)

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledOnce()
  })
})
