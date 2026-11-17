import { afterEach, describe, expect, it, vi } from "vitest"

import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makeNamecardCardLayout } from "@/mocks/data/namecards"
import type { FudabaOwnerCard } from "~/lib/api"
import {
  applyLayout,
  buildCardGroups,
  buildCardLayoutRequest,
  buildDraftCardGroups,
  CARD_GROUP_TITLE_MAX_LENGTH,
  canCreateCardGroup,
  cardGroupDropId,
  cardGroupHeading,
  cardGroupKey,
  cardGroupKeyFromDropId,
  cardGroupKeyFromSortableId,
  cardGroupSortableId,
  cardGroupViewTransitionName,
  cardSettingsToPatches,
  cardViewTransitionName,
  collectCardSettings,
  createCardGroup,
  createCardLayoutDraft,
  DEFAULT_CARD_GROUP_KEY,
  dropEmptyGroups,
  effectiveQuickCardNumbers,
  flattenCardGroups,
  isCardManagerDraftDirty,
  isCardQuickEligible,
  moveCards,
  quickCardIdSet,
  removeCardGroup,
  renameCardGroup,
  reorderCardGroups,
  sameCardLayoutDraft,
  selectableCardIds,
  type CardManagerGroup,
  type CardManagerLayoutDraft,
} from "~/pages/account/me/namecards/card-manager-model"

function card(cardNumber: number, overrides: Partial<FudabaOwnerCard> = {}) {
  return makeFudabaOwnerCard({
    id: `card-${cardNumber}`,
    cardNumber,
    producerName: `名片 ${cardNumber}`,
    ...overrides,
  })
}

function numbers(cards: readonly { cardNumber: number }[]) {
  return cards.map((item) => item.cardNumber)
}

/** 草稿里的一个命名分组；默认 `id` 跟 `key` 一样（模拟服务端已经分配过的分组）。 */
function group(
  key: string,
  title: string,
  cardNumbers: number[],
  id: string | null = key
): CardManagerGroup {
  return { key, id, title, cardNumbers }
}

/** 以默认分组 `defaultCardNumbers` + 命名分组拼一份布局草稿。 */
function draft(
  defaultCardNumbers: number[],
  groups: CardManagerGroup[]
): CardManagerLayoutDraft {
  return { groups, defaultCardNumbers }
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
    expect(groups.map(cardGroupHeading)).toEqual(["常用", "未命名分组", "他组"])
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
    const quickCardIds = quickCardIdSet(cards, [2, 9])

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

describe("selectableCardIds", () => {
  it("only lets published cards be picked, in list order", () => {
    const cards = [
      card(1),
      card(2, { publicationStatus: "draft" }),
      card(3, { publicationStatus: "pending" }),
      card(4, { publicationStatus: "published", reviewStatus: "pending" }),
      card(5, { publicationStatus: "rejected" }),
      card(6, { publicationStatus: "hidden" }),
    ]

    // `pending` 只是「已发布卡暂存了修订」，线上照旧展示，所以仍然可勾选。
    expect(selectableCardIds(cards)).toEqual(["card-1", "card-4"])
  })
})

describe("effectiveQuickCardNumbers", () => {
  it("keeps order, drops duplicates and cards that no longer qualify", () => {
    const cards = [
      card(1, { exchangeMode: "auto" }),
      card(2, { exchangeMode: "manual" }),
      card(3, { exchangeMode: "auto", publicationStatus: "draft" }),
    ]

    expect(effectiveQuickCardNumbers([1, 2, 3, 1, 9], cards, {})).toEqual([1])
  })

  it("follows the draft exchange mode over the live value", () => {
    const cards = [card(2, { exchangeMode: "manual" })]

    expect(effectiveQuickCardNumbers([2], cards, {})).toEqual([])
    expect(
      effectiveQuickCardNumbers([2], cards, {
        "card-2": { exchangeMode: "auto" },
      })
    ).toEqual([2])
  })

  it("drops a published auto card that has no live page", () => {
    // 服务端写入侧要求有线上页；客户端不同口径的话，这张卡一进清单整份保存必 400。
    const cards = [card(1, { exchangeMode: "auto", pages: [] })]

    expect(isCardQuickEligible(cards[0]!, "auto")).toBe(false)
    expect(effectiveQuickCardNumbers([1], cards, {})).toEqual([])
    // 勾选资格不受「有线上页」约束：它没有线上页也仍然可以批量调整。
    expect(selectableCardIds(cards)).toEqual(["card-1"])
  })
})

describe("isCardQuickEligible", () => {
  it("requires published, auto and at least one live page", () => {
    expect(isCardQuickEligible(card(1, { pages: [] }), "auto")).toBe(false)
    expect(isCardQuickEligible(card(1), "manual")).toBe(false)
    expect(isCardQuickEligible(card(1), "none")).toBe(false)
    expect(
      isCardQuickEligible(card(1, { publicationStatus: "draft" }), "auto")
    ).toBe(false)
    expect(isCardQuickEligible(card(1), "auto")).toBe(true)
  })
})

describe("collectCardSettings", () => {
  it("keeps only the fields that differ from the live card", () => {
    const cards = [card(1, { visible: true, exchangeMode: "manual" })]

    expect(collectCardSettings(cards, { "card-1": { visible: true } })).toEqual(
      []
    )
    expect(
      collectCardSettings(cards, {
        "card-1": { visible: false, exchangeMode: "manual" },
      })
    ).toEqual([{ cardId: "card-1", visible: false }])
    expect(
      collectCardSettings(cards, {
        "card-1": { visible: false, exchangeMode: "auto" },
      })
    ).toEqual([{ cardId: "card-1", visible: false, exchangeMode: "auto" }])
  })

  it("skips group cards and cards that are no longer in the list", () => {
    const cards = [card(1, { isGroupCard: true }), card(2)]

    expect(
      collectCardSettings(cards, {
        "card-1": { visible: false },
        "card-9": { visible: false },
        "card-2": { exchangeMode: "none" },
      })
    ).toEqual([{ cardId: "card-2", exchangeMode: "none" }])
  })
})

describe("cardSettingsToPatches", () => {
  it("turns the request settings into one patch per card", () => {
    expect(
      cardSettingsToPatches([
        { cardId: "card-1", visible: false },
        { cardId: "card-2", exchangeMode: "auto" },
      ])
    ).toEqual({
      "card-1": { visible: false },
      "card-2": { exchangeMode: "auto" },
    })
  })

  it("merges two entries for the same card and keeps an empty request empty", () => {
    expect(
      cardSettingsToPatches([
        { cardId: "card-1", visible: false },
        { cardId: "card-1", exchangeMode: "manual" },
      ])
    ).toEqual({ "card-1": { visible: false, exchangeMode: "manual" } })
    expect(cardSettingsToPatches([])).toEqual({})
  })
})

describe("isCardManagerDraftDirty", () => {
  const cards = [card(1, { exchangeMode: "auto" }), card(2)]
  const layout = makeNamecardCardLayout({
    defaultCardNumbers: [1, 2],
    quickCardNumbers: [1],
  })

  it("is clean while the quick list and the settings match the layout", () => {
    expect(
      isCardManagerDraftDirty({
        cards,
        layout,
        quickCardNumbers: [1],
        cardSettings: {},
      })
    ).toBe(false)
    expect(
      isCardManagerDraftDirty({
        cards,
        layout,
        quickCardNumbers: [1],
        cardSettings: { "card-2": { visible: true } },
      })
    ).toBe(false)
  })

  it("tracks quick list membership and real field changes", () => {
    expect(
      isCardManagerDraftDirty({
        cards,
        layout,
        quickCardNumbers: [1, 2],
        cardSettings: { "card-2": { exchangeMode: "auto" } },
      })
    ).toBe(true)
    expect(
      isCardManagerDraftDirty({
        cards,
        layout,
        quickCardNumbers: [1],
        cardSettings: { "card-2": { visible: false } },
      })
    ).toBe(true)
  })
})

describe("buildCardLayoutRequest", () => {
  const layout = makeNamecardCardLayout({
    groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
    defaultCardNumbers: [1, 3],
    quickCardNumbers: [1],
  })

  it("sends the loaded layout as-is, the whole quick list, and only changed cards", () => {
    const cards = [
      card(1, { exchangeMode: "auto" }),
      card(2),
      card(3, { exchangeMode: "auto" }),
    ]

    expect(
      buildCardLayoutRequest({
        cards,
        layout,
        quickCardNumbers: [1, 3],
        cardSettings: { "card-2": { visible: false }, "card-3": {} },
      })
    ).toEqual({
      groups: [{ id: "g-1", title: "常用", cardNumbers: [2] }],
      defaultCardNumbers: [1, 3],
      quickCardNumbers: [1, 3],
      cardSettings: [{ cardId: "card-2", visible: false }],
    })
  })

  it("falls back to an empty layout when the layout read failed", () => {
    const cards = [card(1, { exchangeMode: "auto" })]

    expect(
      buildCardLayoutRequest({
        cards,
        layout: null,
        quickCardNumbers: [1],
        cardSettings: {},
      })
    ).toEqual({
      groups: [],
      defaultCardNumbers: [],
      quickCardNumbers: [1],
      cardSettings: [],
    })
  })

  it("sends the draft layout: new groups with id null, empty groups dropped", () => {
    const cards = [
      card(1, { exchangeMode: "auto" }),
      card(2),
      card(3, { exchangeMode: "auto" }),
      card(4),
    ]

    expect(
      buildCardLayoutRequest({
        cards,
        layout,
        quickCardNumbers: [1],
        cardSettings: {},
        layoutDraft: draft(
          [4, 1],
          [
            group("local:1", "  新分组  ", [2], null),
            group("g-2", "空的分组", []),
            group("g-1", "常用", [3]),
          ]
        ),
      })
    ).toEqual({
      // 新建分组发 `id: null`，标题去首尾空白；空分组整条丢掉。
      groups: [
        { id: null, title: "新分组", cardNumbers: [2] },
        { id: "g-1", title: "常用", cardNumbers: [3] },
      ],
      defaultCardNumbers: [4, 1],
      quickCardNumbers: [1],
      cardSettings: [],
    })
  })
})

describe("createCardLayoutDraft", () => {
  it("materializes the rendered structure, missing cards first in the default group", () => {
    const layoutDraft = createCardLayoutDraft(
      [card(1), card(2), card(3)],
      makeNamecardCardLayout({
        defaultCardNumbers: [1],
        groups: [{ id: "g-1", title: "  常用  ", cardNumbers: [2] }],
      })
    )

    // 3 是布局里还没出现过的卡：草稿把它显式写进默认分组最前，落点下标才能与渲染一致。
    expect(layoutDraft).toEqual({
      groups: [{ key: "g-1", id: "g-1", title: "常用", cardNumbers: [2] }],
      defaultCardNumbers: [3, 1],
    })
  })

  it("keeps the display fallback for a blank stored title", () => {
    const layoutDraft = createCardLayoutDraft(
      [card(1)],
      makeNamecardCardLayout({
        groups: [{ id: "g-1", title: "   ", cardNumbers: [1] }],
      })
    )

    // 服务端允许标题只有空白；草稿按界面看到的标题写回，否则 `title: ""` 会被 400 挡下。
    expect(layoutDraft.groups[0]?.title).toBe("未命名分组")
  })

  it("falls back to one default group holding every card without a layout", () => {
    expect(createCardLayoutDraft([card(2), card(1)], null)).toEqual({
      groups: [],
      defaultCardNumbers: [2, 1],
    })
  })

  it("dedupes a shared card number so the save request cannot be rejected", () => {
    const layoutDraft = createCardLayoutDraft(
      [card(1), { ...card(1), id: "card-1-b" }],
      makeNamecardCardLayout({ defaultCardNumbers: [1] })
    )

    expect(layoutDraft.defaultCardNumbers).toEqual([1])
  })
})

describe("createCardGroup", () => {
  it("inserts below the default group with a local key and id null", () => {
    const groups = [group("g-1", "常用", [2])]

    const next = createCardGroup(groups, "  新分组  ")

    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({
      key: "local:1",
      id: null,
      title: "新分组",
      cardNumbers: [],
    })
    expect(next[1]).toBe(groups[0])
  })

  it("numbers local keys past the ones already used", () => {
    const next = createCardGroup(
      [group("local:1", "一", [1]), group("g-1", "常用", [2])],
      "二"
    )

    expect(next[0]?.key).toBe("local:2")
  })

  it("leaves the array alone for an empty, over-long or over-limit title", () => {
    const groups = [group("g-1", "常用", [2])]

    expect(createCardGroup(groups, "   ")).toBe(groups)
    expect(
      createCardGroup(groups, "x".repeat(CARD_GROUP_TITLE_MAX_LENGTH + 1))
    ).toBe(groups)
    // 上限来自契约（`NAMECARD_PROFILE_GROUP_LIMIT`），别写死数字。
    const atLimit = Array.from({ length: 20 }, (_, index) =>
      group(`g-${index}`, `组 ${index}`, [])
    )
    expect(canCreateCardGroup(atLimit)).toBe(false)
    expect(canCreateCardGroup(atLimit.slice(1))).toBe(true)
    expect(createCardGroup(atLimit, "第 21 个")).toBe(atLimit)
  })
})

describe("renameCardGroup", () => {
  it("trims the new title", () => {
    const groups = [group("g-1", "常用", [2])]

    expect(renameCardGroup(groups, "g-1", "  备用  ")[0]?.title).toBe("备用")
  })

  it("keeps the old title for an empty or over-long one, and for unknown keys", () => {
    const groups = [group("g-1", "常用", [2])]

    expect(renameCardGroup(groups, "g-1", "  ")).toBe(groups)
    expect(
      renameCardGroup(
        groups,
        "g-1",
        "x".repeat(CARD_GROUP_TITLE_MAX_LENGTH + 1)
      )
    ).toBe(groups)
    expect(renameCardGroup(groups, "g-9", "备用")).toBe(groups)
    // 改成同一个标题等于没改：返回原数组，脏标记也就不会凭空亮起来。
    expect(renameCardGroup(groups, "g-1", "常用")).toBe(groups)
  })
})

describe("removeCardGroup", () => {
  it("sends the group's cards back to the end of the default group", () => {
    const next = removeCardGroup(
      draft([1], [group("g-1", "常用", [2, 3])]),
      "g-1"
    )

    expect(next.groups).toEqual([])
    expect(next.defaultCardNumbers).toEqual([1, 2, 3])
  })

  it("ignores an unknown key", () => {
    const current = draft([1], [group("g-1", "常用", [2])])

    expect(removeCardGroup(current, "g-9")).toBe(current)
  })
})

describe("reorderCardGroups", () => {
  it("moves a group to where another group currently is", () => {
    const groups = [
      group("g-1", "第一", [1]),
      group("g-2", "第二", [2]),
      group("g-3", "第三", [3]),
    ]

    expect(
      reorderCardGroups(groups, "g-3", "g-1").map((item) => item.key)
    ).toEqual(["g-3", "g-1", "g-2"])
    expect(
      reorderCardGroups(groups, "g-1", "g-3").map((item) => item.key)
    ).toEqual(["g-2", "g-3", "g-1"])
  })

  it("ignores unknown keys and moves that do not change the order", () => {
    const groups = [group("g-1", "第一", [1]), group("g-2", "第二", [2])]

    expect(reorderCardGroups(groups, "g-9", "g-1")).toBe(groups)
    expect(reorderCardGroups(groups, "g-1", "nope")).toBe(groups)
    expect(reorderCardGroups(groups, "g-1", "g-1")).toBe(groups)
  })
})

describe("moveCards", () => {
  it("moves one card into another group at the over card's index", () => {
    const next = moveCards(draft([1, 2], [group("g-1", "常用", [3, 4])]), [1], {
      groupKey: "g-1",
      index: 1,
    })

    expect(next.defaultCardNumbers).toEqual([2])
    expect(next.groups[0]?.cardNumbers).toEqual([3, 1, 4])
  })

  it("inserts a multi-card batch as one block, keeping its order", () => {
    const next = moveCards(draft([4, 1, 2, 3], []), [1, 3], {
      groupKey: DEFAULT_CARD_GROUP_KEY,
      index: 1,
    })

    // 先整批摘掉（[4, 2]），再插到下标 1：批次内部顺序不变。
    expect(next.defaultCardNumbers).toEqual([4, 1, 3, 2])
  })

  it("keeps only one copy of a duplicated number", () => {
    const next = moveCards(
      draft([1, 2], [group("g-1", "常用", [1, 3])]),
      [1, 1],
      { groupKey: "g-1", index: 2 }
    )

    expect(next.defaultCardNumbers).toEqual([2])
    expect(next.groups[0]?.cardNumbers).toEqual([3, 1])
  })

  it("appends to the target group when no index is given", () => {
    const next = moveCards(draft([1], [group("g-1", "常用", [2])]), [1], {
      groupKey: "g-1",
    })

    expect(next.defaultCardNumbers).toEqual([])
    expect(next.groups[0]?.cardNumbers).toEqual([2, 1])
  })

  it("clamps an out-of-range index and falls back to the default group", () => {
    const next = moveCards(draft([1, 2], [group("g-1", "常用", [3])]), [3], {
      groupKey: "g-9",
      index: 99,
    })

    expect(next.groups[0]?.cardNumbers).toEqual([])
    expect(next.defaultCardNumbers).toEqual([1, 2, 3])
  })

  it("does nothing without cards to move", () => {
    const current = draft([1], [])

    expect(moveCards(current, [], { groupKey: DEFAULT_CARD_GROUP_KEY })).toBe(
      current
    )
  })
})

describe("dropEmptyGroups", () => {
  it("drops groups that hold no card", () => {
    expect(
      dropEmptyGroups([group("g-1", "空", []), group("g-2", "常用", [1])]).map(
        (item) => item.key
      )
    ).toEqual(["g-2"])
  })
})

describe("sameCardLayoutDraft", () => {
  it("compares titles and order, and ignores empty groups", () => {
    const base = draft([1, 2], [group("g-1", "常用", [3])])

    expect(sameCardLayoutDraft(base, { ...base })).toBe(true)
    expect(
      sameCardLayoutDraft(
        base,
        draft([1, 2], [group("g-1", "常用", [3]), group("local:1", "新的", [])])
      )
    ).toBe(true)
    expect(
      sameCardLayoutDraft(base, draft([2, 1], [group("g-1", "常用", [3])]))
    ).toBe(false)
    expect(
      sameCardLayoutDraft(base, draft([1, 2], [group("g-1", "备用", [3])]))
    ).toBe(false)
    expect(
      sameCardLayoutDraft(
        base,
        draft([1, 2], [group("g-1", "常用", [3]), group("g-2", "第二", [4])])
      )
    ).toBe(false)
  })
})

describe("buildDraftCardGroups", () => {
  it("always renders the default group first, plus empty named groups", () => {
    const groups = buildDraftCardGroups(
      [card(1), card(2), card(3)],
      draft([2, 1], [group("g-1", "常用", [3]), group("local:1", "新的", [])])
    )

    expect(groups.map((item) => item.key)).toEqual([
      "default",
      "g-1",
      "local:1",
    ])
    expect(groups.map((item) => numbers(item.cards))).toEqual([[2, 1], [3], []])
    // 编辑模式渲染结构里的身份：默认分组没有 id，新建分组也没有 id，只能靠 key。
    expect(groups.map(cardGroupKey)).toEqual(["default", "g-1", "local:1"])
  })

  it("renders the default group even when every card sits in a named group", () => {
    const groups = buildDraftCardGroups(
      [card(1)],
      draft([], [group("g-1", "常用", [1])])
    )

    expect(groups[0]?.cards).toEqual([])
    expect(groups[0]?.title).toBeNull()
  })
})

describe("card group dnd ids", () => {
  it("round-trips the drop area and the group sortable ids", () => {
    expect(cardGroupDropId("default")).toBe("group-drop:default")
    expect(cardGroupSortableId("local:1")).toBe("group-item:local:1")
    expect(cardGroupKeyFromDropId("group-drop:g-1")).toBe("g-1")
    expect(cardGroupKeyFromSortableId("group-item:g-1")).toBe("g-1")
    expect(cardGroupKeyFromDropId("card-1")).toBeNull()
    expect(cardGroupKeyFromSortableId("group-drop:g-1")).toBeNull()
  })

  it("names a new group's header apart from the default group", () => {
    expect(cardGroupViewTransitionName({ id: null, key: "local:1" })).toMatch(
      /^group-local-1-[a-z0-9]+$/
    )
  })
})
