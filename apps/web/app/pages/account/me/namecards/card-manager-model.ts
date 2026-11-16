import { flushSync } from "react-dom"

import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"

/**
 * 默认分组没有服务端 id，也不显示标题；折叠状态与 DOM id 需要一个稳定键，
 * 所以给它一个保留键（分组 id 由服务端分配，不会撞上它）。
 */
export const DEFAULT_CARD_GROUP_KEY = "default"

/** 分组模式里默认分组不渲染可见标题，只保留无障碍名称。 */
export const DEFAULT_CARD_GROUP_LABEL = "默认分组"

/** 布局里的标题只有空白时的展示兜底（S2 只读，不回写数据）。 */
export const UNNAMED_CARD_GROUP_TITLE = "未命名分组"

/** 渲染用的一个分组：`id === null` 即默认分组（永远第一、无标题、不可拖拽）。 */
export type CardGroup = {
  id: string | null
  /** 已去掉首尾空白；默认分组为 `null`。 */
  title: string | null
  /** 只包含本次真的拥有的卡。 */
  cards: FudabaOwnerCard[]
}

/** 折叠状态与 `view-transition-name` 共用的稳定键。 */
export function cardGroupKey(group: Pick<CardGroup, "id">): string {
  return group.id ?? DEFAULT_CARD_GROUP_KEY
}

/**
 * 分组头可见的标题：默认分组没有标题（返回 `null`）；标题只有空白时兜底
 * 「未命名分组」，因为服务端允许 `title = " "` 这类值，而空标题头是纯噪音。
 */
export function cardGroupHeading(
  group: Pick<CardGroup, "title">
): string | null {
  if (group.title === null) return null
  return group.title.trim() || UNNAMED_CARD_GROUP_TITLE
}

/**
 * 布局 + 卡片合成渲染结构。
 *
 * - 默认分组永远第一且无标题，顺序就是 `defaultCardNumbers`；
 * - 组内只保留本次真的拥有的卡（布局里已删除、已隐藏的编号被丢弃）；
 * - 布局里没出现过的卡（刚新建、或布局读失败时的全部卡）补进默认分组**最前**，
 *   与服务端归一同一顺序，保证任何一张拥有的卡都不会从列表里消失；
 * - 只引用不在手上的卡的组直接不渲染（服务端也只保存非空分组）。
 */
export function buildCardGroups(
  cards: readonly FudabaOwnerCard[],
  layout: NamecardCardLayout | null
): CardGroup[] {
  const byNumber = new Map<number, FudabaOwnerCard>()
  for (const card of cards) {
    if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card)
  }

  // 布局用编号引用卡片，所以「同一编号被两处认领」要丢掉后一处；而卡片本身按 id
  // 记账——哪怕编号撞了，任何一张手上的卡也不能从列表里消失。
  const claimed = new Set<number>()
  const placed = new Set<string>()
  const take = (cardNumbers: readonly number[]): FudabaOwnerCard[] => {
    const taken: FudabaOwnerCard[] = []
    for (const number of cardNumbers) {
      const card = byNumber.get(number)
      if (!card || claimed.has(number)) continue
      claimed.add(number)
      placed.add(card.id)
      taken.push(card)
    }
    return taken
  }

  // 认领顺序与服务端归一一致（`layout.ts` 的 `normalizeCardLayout`）：**各分组先认领**，
  // 默认分组再认领剩下的；同一编号被两处引用时它归分组，不会在两边各出现一次。
  const groups: CardGroup[] = []
  for (const group of layout?.groups ?? []) {
    const groupCards = take(group.cardNumbers)
    if (!groupCards.length) continue
    groups.push({ id: group.id, title: group.title.trim(), cards: groupCards })
  }

  const defaultCards = take(layout?.defaultCardNumbers ?? [])

  // 布局里没出现过的卡（刚新建、或布局读失败）补进默认分组**最前**，与服务端归一
  // （`normalizeCardLayout` 的 `[...missing, ...defaultCardNumbers]`）同口径：新卡在保存
  // 前后都待在同一个位置，不会先落在末尾、刷新后又跳到最前。先让各分组认领自己的卡，
  // 否则组里的卡会被这一轮提前算进默认分组。
  const missing: FudabaOwnerCard[] = []
  for (const card of cards) {
    if (placed.has(card.id)) continue
    placed.add(card.id)
    missing.push(card)
  }

  // 默认分组没有卡片时不渲染（卡片全在命名分组里）；有卡片时永远第一。
  const defaultGroupCards = [...missing, ...defaultCards]
  return defaultGroupCards.length
    ? [{ id: null, title: null, cards: defaultGroupCards }, ...groups]
    : groups
}

/**
 * 分组模式与经典模式共用的渲染顺序：默认分组在前，然后按分组顺序。
 * 经典模式只是不渲染组头，顺序与这里完全一致。
 */
export function flattenCardGroups(
  groups: readonly CardGroup[]
): FudabaOwnerCard[] {
  return groups.flatMap((group) => group.cards)
}

/** 布局里快速清单的编号 → 卡片 id；瓦片右上角 ⚡ 只认这个集合。 */
export function quickCardIdSet(
  cards: readonly FudabaOwnerCard[],
  layout: NamecardCardLayout | null
): ReadonlySet<string> {
  const numbers = new Set(layout?.quickCardNumbers ?? [])
  const ids = new Set<string>()
  for (const card of cards) {
    if (numbers.has(card.cardNumber)) ids.add(card.id)
  }
  return ids
}

/**
 * `view-transition-name` 只能是 CSS ident：uuid 可能以数字开头，还允许别的字符。
 * 非法字符换成 `-` 之后仍然可能撞名（`a:b` 与 `a-b` 都变成 `a-b`，浏览器会忽略重复的名字、
 * 两层动画都失效），所以再附上原值的短哈希，保证一一对应。
 */
function identFrom(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  const slug =
    value
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  return `${slug}-${(hash >>> 0).toString(36)}`
}

export function cardViewTransitionName(cardId: string): string {
  return `card-${identFrom(cardId)}`
}

export function cardGroupViewTransitionName(
  group: Pick<CardGroup, "id">
): string {
  return `group-${identFrom(cardGroupKey(group))}`
}

/**
 * 一次布局变化（切换模式 / 折叠展开 / 保存布局）外面包一层 View Transition：
 * 浏览器支持且未开启 reduced motion 时用 `flushSync` 让 React 在同一帧提交，
 * 否则直接变更。jsdom 没有 `document.startViewTransition`，走同步分支，不抛错。
 */
export function applyLayout(mutate: () => void): void {
  const startViewTransition =
    typeof document === "undefined" ? undefined : document.startViewTransition
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  if (typeof startViewTransition !== "function" || reduceMotion) {
    mutate()
    return
  }
  startViewTransition.call(document, () => {
    flushSync(mutate)
  })
}
