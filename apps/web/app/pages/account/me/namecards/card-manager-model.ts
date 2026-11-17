import type { NamecardCardLayoutRequest } from "@imsweb/contracts/namecards"
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

/**
 * 快速清单的编号 → 卡片 id；瓦片右上角 ⚡ 只认这个集合。
 *
 * 传入的编号应当是生效后的清单（`effectiveQuickCardNumbers`）：编辑模式下的草稿也要
 * 立刻反映到角标上，所以这里不再自己读布局。
 */
export function quickCardIdSet(
  cards: readonly FudabaOwnerCard[],
  quickCardNumbers: readonly number[]
): ReadonlySet<string> {
  const numbers = new Set(quickCardNumbers)
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

/**
 * 编辑会话里的单卡字段差异（§8 的批量可见性 / 交换模式）。
 *
 * 只有与线上值不同的部分才会进保存请求；`visible`/`exchangeMode` 都是免审字段，
 * 服务端直接写 live 行，不必等审核。
 */
export type CardManagerCardSetting = {
  visible?: boolean
  exchangeMode?: FudabaOwnerCard["exchangeMode"]
}

/** 草稿里按卡片 id 记住的意图；与线上值的比较放在 `collectCardSettings` 里做。 */
export type CardManagerCardSettings = Readonly<
  Record<string, CardManagerCardSetting>
>

/**
 * 只有整卡 `published` 才可勾选、可批量操作（§8）：`draft`/`pending`/`approving`/
 * `rejected`/`hidden` 仍然显示在清单里，但整张卡是只读的。
 */
export function isCardSelectable(
  card: Pick<FudabaOwnerCard, "publicationStatus">
): boolean {
  return card.publicationStatus === "published"
}

/** 可勾选的卡片 id，按清单顺序——「全选」只选这一批。 */
export function selectableCardIds(
  cards: readonly FudabaOwnerCard[]
): string[] {
  return cards.filter(isCardSelectable).map((card) => card.id)
}

/**
 * 快速交换清单的资格（§8）：服务端写入侧要求 `published + auto` **且有线上页**
 * （否则 400「快速交换清单只收已发布且自动交换的名片」）。客户端只判 `published + auto`
 * 的话，没有线上页的卡一进清单整份保存必然失败，所以这里与服务端同口径。
 *
 * 与勾选资格（`isCardSelectable`）分开：没有线上页的已发布卡仍然可以勾选与批量改字段，
 * 只是进不了快速清单。
 */
export function isCardQuickEligible(
  card: Pick<FudabaOwnerCard, "publicationStatus" | "pages">,
  mode: FudabaOwnerCard["exchangeMode"]
): boolean {
  return (
    card.publicationStatus === "published" &&
    mode === "auto" &&
    (card.pages?.length ?? 0) > 0
  )
}

/** 生效的可见性：草稿里的改动优先于线上值。 */
export function effectiveCardVisible(
  card: FudabaOwnerCard,
  settings: CardManagerCardSettings
): boolean {
  return settings[card.id]?.visible ?? card.visible
}

/** 生效的交换模式：草稿里的改动优先于线上值。 */
export function effectiveExchangeMode(
  card: FudabaOwnerCard,
  settings: CardManagerCardSettings
): FudabaOwnerCard["exchangeMode"] {
  return settings[card.id]?.exchangeMode ?? card.exchangeMode
}

/**
 * 快速清单在 UI 与保存请求里的生效内容：只收服务端写入侧认的卡（`isCardQuickEligible`
 * = 已发布 + 生效模式 auto + 有线上页），与服务端读侧（`listQuickExchangeCards`）
 * 和写侧校验同口径。
 *
 * 于是「把清单里的卡改成手动」会自动把它从清单里摘掉：请求体里不会留下服务端必然拒绝
 * 的编号，角标与计数也立刻跟服务端一致（服务端本来就按 auto 过滤，§8）。
 */
export function effectiveQuickCardNumbers(
  quickCardNumbers: readonly number[],
  cards: readonly FudabaOwnerCard[],
  settings: CardManagerCardSettings
): number[] {
  const byNumber = new Map<number, FudabaOwnerCard>()
  for (const card of cards) {
    if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card)
  }

  const seen = new Set<number>()
  const numbers: number[] = []
  for (const number of quickCardNumbers) {
    if (seen.has(number)) continue
    const card = byNumber.get(number)
    if (!card) continue
    if (!isCardQuickEligible(card, effectiveExchangeMode(card, settings))) {
      continue
    }
    seen.add(number)
    numbers.push(number)
  }
  return numbers
}

/** 两个编号列表是否是同一份集合（顺序不影响脏判定）。 */
function sameCardNumbers(
  left: readonly number[],
  right: readonly number[]
): boolean {
  if (left.length !== right.length) return false
  const set = new Set(right)
  return left.every((number) => set.has(number))
}

/**
 * 保存请求里的 `cardSettings`：只保留真的变了的部分。
 *
 * - 与线上值相同的字段丢掉（改了又改回来 = 没改）；
 * - 团体名片整体跳过：服务端固定 `auto + visible`，带上它反而会 400（§8）；
 * - 已不在清单里的卡（被删除/隐藏）也跳过——它连布局都进不去。
 */
export function collectCardSettings(
  cards: readonly FudabaOwnerCard[],
  settings: CardManagerCardSettings
): NamecardCardLayoutRequest["cardSettings"] {
  const collected: NamecardCardLayoutRequest["cardSettings"] = []
  for (const card of cards) {
    const patch = settings[card.id]
    if (!patch || card.isGroupCard) continue
    const setting: NamecardCardLayoutRequest["cardSettings"][number] = {
      cardId: card.id,
    }
    if (patch.visible !== undefined && patch.visible !== card.visible) {
      setting.visible = patch.visible
    }
    if (
      patch.exchangeMode !== undefined &&
      patch.exchangeMode !== card.exchangeMode
    ) {
      setting.exchangeMode = patch.exchangeMode
    }
    if (setting.visible !== undefined || setting.exchangeMode !== undefined) {
      collected.push(setting)
    }
  }
  return collected
}

/**
 * 保存后要回写给上层的字段差异：`{ [cardId]: { visible?, exchangeMode? } }`。
 *
 * 上层用它做函数式合并（`cards.map(...)`），而不是拿一份快照整份覆盖列表——保存请求
 * 在飞期间新建/删除的卡就不会从本地清单里消失。`PUT /me/cards/layout` 的响应只有布局
 * （和快速清单），批量写下的 `visible`/`exchangeMode` 不会跟着回来，所以要这样补回本地。
 */
export type CardManagerCardPatches = Readonly<
  Record<string, CardManagerCardSetting>
>

/** 把保存请求里的 `cardSettings`（只含有变化的卡）反解成按卡片 id 的 patches。 */
export function cardSettingsToPatches(
  cardSettings: NamecardCardLayoutRequest["cardSettings"]
): CardManagerCardPatches {
  const patches: Record<string, CardManagerCardSetting> = {}
  for (const setting of cardSettings) {
    const patch: CardManagerCardSetting = {}
    if (setting.visible !== undefined) patch.visible = setting.visible
    if (setting.exchangeMode !== undefined) {
      patch.exchangeMode = setting.exchangeMode
    }
    patches[setting.cardId] = { ...patches[setting.cardId], ...patch }
  }
  return patches
}

/** 草稿里是否真的有改动：决定保存按钮、退出确认与 `beforeunload`。 */
export function isCardManagerDraftDirty({
  cards,
  layout,
  quickCardNumbers,
  cardSettings,
}: {
  cards: readonly FudabaOwnerCard[]
  layout: NamecardCardLayout | null
  quickCardNumbers: readonly number[]
  cardSettings: CardManagerCardSettings
}): boolean {
  if (collectCardSettings(cards, cardSettings).length > 0) return true
  return !sameCardNumbers(
    effectiveQuickCardNumbers(quickCardNumbers, cards, cardSettings),
    layout?.quickCardNumbers ?? []
  )
}

/**
 * 组装整份保存请求（§4.2）。
 *
 * 这一片（S3）不改布局结构，所以 `groups`/`defaultCardNumbers` 用**已加载的布局原样**
 * 回传；`quickCardNumbers` 整份覆盖；`cardSettings` 只放改动过的卡。
 */
export function buildCardLayoutRequest({
  cards,
  layout,
  quickCardNumbers,
  cardSettings,
}: {
  cards: readonly FudabaOwnerCard[]
  layout: NamecardCardLayout | null
  quickCardNumbers: readonly number[]
  cardSettings: CardManagerCardSettings
}): NamecardCardLayoutRequest {
  return {
    groups: (layout?.groups ?? []).map((group) => ({
      id: group.id,
      title: group.title,
      cardNumbers: [...group.cardNumbers],
    })),
    defaultCardNumbers: [...(layout?.defaultCardNumbers ?? [])],
    quickCardNumbers: effectiveQuickCardNumbers(
      quickCardNumbers,
      cards,
      cardSettings
    ),
    cardSettings: collectCardSettings(cards, cardSettings),
  }
}
