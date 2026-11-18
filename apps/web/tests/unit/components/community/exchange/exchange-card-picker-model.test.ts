import { describe, expect, it } from "vitest"

import {
  autoSelectPickerCards,
  canStartScanShare,
  DEFAULT_PICKER_GROUP_KEY,
  groupPickerCards,
  isPickerCandidateAvailable,
  needsEmptyGiveConfirm,
  pickerCountLabel,
  togglePickerCard,
  type PickerCandidate,
  type PickerGroup,
} from "~/components/community/exchange/exchange-card-picker-model"
import { makeCardPage, makeNamecardCardLayout } from "@/mocks/data/namecards"

function candidate(
  cardNumber: number,
  overrides: Partial<PickerCandidate> = {}
): PickerCandidate {
  return {
    cardNumber,
    pages: [makeCardPage({ role: "front", order: 1 })],
    exchangeMode: "manual",
    selected: false,
    ...overrides,
  }
}

/** 断言用：把分组投影成标题与编号两层，测试只看顺序与归属。 */
function titles(groups: readonly PickerGroup[]): Array<string | null> {
  return groups.map((group) => group.title)
}

function numbers(groups: readonly PickerGroup[]): number[][] {
  return groups.map((group) => group.cards.map((card) => card.cardNumber))
}

describe("isPickerCandidateAvailable", () => {
  it("treats a missing targetOwns as available and a hit as unavailable", () => {
    expect(isPickerCandidateAvailable(candidate(1))).toBe(true)
    expect(isPickerCandidateAvailable(candidate(2, { targetOwns: false }))).toBe(
      true
    )
    expect(isPickerCandidateAvailable(candidate(3, { targetOwns: true }))).toBe(
      false
    )
  })
})

describe("groupPickerCards", () => {
  it("puts the untitled default group first and keeps the layout order inside it", () => {
    const layout = makeNamecardCardLayout({
      defaultCardNumbers: [3, 1],
      groups: [{ id: "g1", title: "线下活动", cardNumbers: [2] }],
    })

    const groups = groupPickerCards(
      [candidate(1), candidate(2), candidate(3)],
      layout
    )

    expect(titles(groups)).toEqual([null, "线下活动"])
    expect(numbers(groups)).toEqual([
      [3, 1],
      [2],
    ])
    expect(groups[0]?.key).toBe(DEFAULT_PICKER_GROUP_KEY)
    expect(groups[1]?.key).toBe("g1")
  })

  it("appends cards that are missing from the layout to the end of the default group", () => {
    const layout = makeNamecardCardLayout({
      defaultCardNumbers: [2],
      groups: [{ id: "g1", title: "线下活动", cardNumbers: [1] }],
    })

    // 5 与 4 是保存布局之后新建的卡：候选里有、布局里没有，必须留在默认分组末尾。
    const groups = groupPickerCards(
      [candidate(5), candidate(4), candidate(2), candidate(1)],
      layout
    )

    expect(numbers(groups)).toEqual([
      [2, 5, 4],
      [1],
    ])
  })

  it("drops groups whose cards are not candidates and never repeats a card", () => {
    const layout = makeNamecardCardLayout({
      defaultCardNumbers: [1, 2],
      groups: [
        { id: "empty", title: "空分组", cardNumbers: [] },
        { id: "missing", title: "只有缺失的卡", cardNumbers: [9] },
        // 同一张卡既在默认分组又在自定义分组时只算一次（服务端不会这样存，防御性去重）。
        { id: "dup", title: "重复", cardNumbers: [2] },
      ],
    })

    const groups = groupPickerCards([candidate(1), candidate(2)], layout)

    expect(titles(groups)).toEqual([null])
    expect(numbers(groups)).toEqual([[1, 2]])
  })

  it("degrades to a single default group when the layout could not be read", () => {
    const groups = groupPickerCards(
      [candidate(7), candidate(3), candidate(5)],
      null
    )

    expect(titles(groups)).toEqual([null])
    expect(numbers(groups)).toEqual([[7, 3, 5]])
  })

  it("renders nothing when there are no candidates", () => {
    expect(groupPickerCards([], makeNamecardCardLayout())).toEqual([])
  })
})

describe("autoSelectPickerCards", () => {
  it("picks only quick-list cards and skips the ones the target already owns", () => {
    const cards = [
      candidate(1, { selected: true }),
      candidate(2, { selected: true, targetOwns: true }),
      candidate(3),
      candidate(4, { selected: true }),
    ]

    expect(autoSelectPickerCards(cards, 20)).toEqual([1, 4])
  })

  it("stops at the limit", () => {
    const cards = [1, 2, 3, 4].map((cardNumber) =>
      candidate(cardNumber, { selected: true })
    )

    expect(autoSelectPickerCards(cards, 2)).toEqual([1, 2])
  })
})

describe("togglePickerCard", () => {
  it("adds and removes a card", () => {
    expect(togglePickerCard([1], 2, 20)).toEqual({
      selected: [1, 2],
      limited: false,
    })
    expect(togglePickerCard([1, 2], 1, 20)).toEqual({
      selected: [2],
      limited: false,
    })
  })

  it("keeps the selection untouched and reports the block at the limit", () => {
    const selected = [1, 2]
    const result = togglePickerCard(selected, 3, 2)

    expect(result.limited).toBe(true)
    expect(result.selected).toBe(selected)
  })
})

describe("pickerCountLabel", () => {
  it("reads as X/limit", () => {
    expect(pickerCountLabel([], 20)).toBe("0/20")
    expect(pickerCountLabel([1, 2, 3], 20)).toBe("3/20")
    expect(pickerCountLabel([1, 2], 5)).toBe("2/5")
  })
})

describe("needsEmptyGiveConfirm", () => {
  it("only asks when nothing is selected and the target still misses cards", () => {
    expect(needsEmptyGiveConfirm([], 3)).toBe(true)
    expect(needsEmptyGiveConfirm([1], 3)).toBe(false)
    expect(needsEmptyGiveConfirm([], 0)).toBe(false)
  })
})

describe("canStartScanShare", () => {
  it("keeps 确定 always available and 分享 gated on one card", () => {
    expect(canStartScanShare("confirm", [])).toBe(true)
    expect(canStartScanShare("confirm", [1])).toBe(true)
    expect(canStartScanShare("scan-share", [])).toBe(false)
    expect(canStartScanShare("scan-share", [1])).toBe(true)
  })
})
