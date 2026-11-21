import type { NamecardCardLayout, NamecardQuickSettings } from "~/lib/api"

/** 候选：自己全部 `published` 名片的选卡投影；`selected` 表示它在快速交换清单里。 */
export type PickerCandidate = NamecardQuickSettings["cards"][number]

/** 窗口右侧控件的形态：默认【确定】，App 出示二维码场合是【扫码】【分享】，主页送片是【取消】【确定】。 */
export type ExchangeCardPickerVariant = "confirm" | "scan-share" | "gift"

/** 默认分组的稳定 key（自定义分组用布局里的组 id）。 */
export const DEFAULT_PICKER_GROUP_KEY = "default"

export interface PickerGroup {
  /** 稳定 key：默认分组固定 `default`，自定义分组用布局里的组 id。 */
  key: string
  /** 默认分组没有标题，不渲染组头。 */
  title: string | null
  cards: PickerCandidate[]
}

/** 不可点瓦片的原因；可访问名与 tooltip 共用同一句文案。 */
export const PICKER_TARGET_OWNS_REASON = "对方已经有这张名片"

/**
 * 对方名片册里已有这张卡时不可勾选（`targetOwns` 只在命中时出现）。
 *
 * 没有目标（App 出示二维码之前）时字段整份省略，这里一律视为可用。
 */
export function isPickerCandidateAvailable(card: PickerCandidate): boolean {
  return card.targetOwns !== true
}

/**
 * 按名片管理的布局分组排序：默认分组在前（无标题）、自定义分组按布局顺序，
 * 组内按各自的 `cardNumbers`；布局之外的新卡追加到默认分组末尾，不能丢。
 *
 * 空分组不渲染；`layout` 为 null（读取失败）时退化成只有一个默认分组。
 */
export function groupPickerCards(
  candidates: readonly PickerCandidate[],
  layout: NamecardCardLayout | null
): PickerGroup[] {
  const byNumber = new Map<number, PickerCandidate>()
  for (const card of candidates) byNumber.set(card.cardNumber, card)

  const placed = new Set<number>()
  const take = (cardNumbers: readonly number[]): PickerCandidate[] => {
    const cards: PickerCandidate[] = []
    for (const cardNumber of cardNumbers) {
      const card = byNumber.get(cardNumber)
      if (!card || placed.has(cardNumber)) continue
      placed.add(cardNumber)
      cards.push(card)
    }
    return cards
  }

  const defaultCards = take(layout?.defaultCardNumbers ?? [])
  // 先占住布局里的所有槽位，再把布局之外的新卡追加到默认分组末尾，否则自定义分组
  // 里的卡会被当成「新卡」提前挪进默认分组。
  const layoutGroups = (layout?.groups ?? []).map((group) => ({
    group,
    cards: take(group.cardNumbers),
  }))
  for (const card of candidates) {
    if (placed.has(card.cardNumber)) continue
    defaultCards.push(card)
  }

  const groups: PickerGroup[] = []
  if (defaultCards.length > 0) {
    groups.push({
      key: DEFAULT_PICKER_GROUP_KEY,
      title: null,
      cards: defaultCards,
    })
  }
  for (const { group, cards } of layoutGroups) {
    if (cards.length === 0) continue
    groups.push({ key: group.id, title: group.title, cards })
  }
  return groups
}

/** 初始勾选 = 快速清单 ∩ 可用，上限内取前 N 张（清单本身已有上限）。 */
export function autoSelectPickerCards(
  candidates: readonly PickerCandidate[],
  limit: number
): number[] {
  const selected: number[] = []
  for (const card of candidates) {
    if (selected.length >= limit) break
    if (card.selected === true && isPickerCandidateAvailable(card)) {
      selected.push(card.cardNumber)
    }
  }
  return selected
}

export interface PickerToggleResult {
  selected: readonly number[]
  /** 已到上限，这次点击没有改变选择。 */
  limited: boolean
}

/** 点击瓦片切换勾选；到 `limit` 时保持原状并回报 `limited`。 */
export function togglePickerCard(
  selected: readonly number[],
  cardNumber: number,
  limit: number
): PickerToggleResult {
  if (selected.includes(cardNumber)) {
    return {
      selected: selected.filter((value) => value !== cardNumber),
      limited: false,
    }
  }
  if (selected.length >= limit) return { selected, limited: true }
  return { selected: [...selected, cardNumber], limited: false }
}

/** 计数文案：`X/20`（上限一律读接口的 `limit`，不写死）。 */
export function pickerCountLabel(
  selected: readonly number[],
  limit: number
): string {
  return `${selected.length}/${limit}`
}

/** 一张没选、对方还缺卡时要先二次确认，避免把「一张都不给」按出意外。 */
export function needsEmptyGiveConfirm(
  selected: readonly number[],
  targetMissingCount: number
): boolean {
  return selected.length === 0 && targetMissingCount > 0
}

/** 【确定】的可点条件：默认交换 0 张也合法；送片与【分享】都要求至少 1 张。 */
export function canConfirmPicker(
  variant: ExchangeCardPickerVariant,
  selected: readonly number[]
): boolean {
  return variant === "confirm" ? true : selected.length > 0
}
