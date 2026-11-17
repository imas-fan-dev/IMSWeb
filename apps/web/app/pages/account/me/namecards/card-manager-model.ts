import type { NamecardCardLayoutRequest } from "@imsweb/contracts/namecards"
import { NAMECARD_PROFILE_GROUP_LIMIT } from "@imsweb/contracts/namecards/runtime"
import { flushSync } from "react-dom"

import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import { cardFlipOffsetFromComputedStyle } from "./card-grid-animation"

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

/**
 * 渲染一个分组所需的最小形状：只读结构（`CardGroup`）、草稿结构（`DraftCardGroup`）都满足它。
 * 组件只认这个形状，两种模式因此能共用同一套分组组件。
 */
export type CardGroupView = {
  id: string | null
  /** 草稿结构才有：新建分组没有服务端 id，只能靠它做身份。 */
  key?: string
  title: string | null
  cards: readonly FudabaOwnerCard[]
}

/**
 * 分组的身份：服务端 id，外加草稿渲染结构（`DraftCardGroup`）才有的本地 `key`。
 * 只读结构（`CardGroup`）没有 `key`，默认分组也没有 id，两者都落到 `DEFAULT_CARD_GROUP_KEY`。
 */
export type CardGroupIdentity = Pick<CardGroupView, "id" | "key">

/** 折叠状态、dnd id 与 `view-transition-name` 共用的稳定键。 */
export function cardGroupKey(group: CardGroupIdentity): string {
  return group.key ?? group.id ?? DEFAULT_CARD_GROUP_KEY
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
 * 「布局里的编号 → 手上的卡」的认领器：命名分组先认领、默认分组再认领剩下的，
 * 任何一张手上的卡都不能从列表里消失。只读渲染（`buildCardGroups`）与编辑草稿
 * （`buildDraftCardGroups`）共用它，保证两条渲染路径同口径。
 */
function createCardClaimer(cards: readonly FudabaOwnerCard[]) {
  const byNumber = new Map<number, FudabaOwnerCard>()
  for (const card of cards) {
    if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card)
  }

  // 布局用编号引用卡片，所以「同一编号被两处认领」要丢掉后一处；而卡片本身按 id
  // 记账——哪怕编号撞了，任何一张手上的卡也不能从列表里消失。
  const claimed = new Set<number>()
  const placed = new Set<string>()
  return {
    take(cardNumbers: readonly number[]): FudabaOwnerCard[] {
      const taken: FudabaOwnerCard[] = []
      for (const number of cardNumbers) {
        const card = byNumber.get(number)
        if (!card || claimed.has(number)) continue
        claimed.add(number)
        placed.add(card.id)
        taken.push(card)
      }
      return taken
    },
    /**
     * 布局里没出现过的卡（刚新建、或布局读失败）：补进默认分组**最前**，与服务端归一
     * （`normalizeCardLayout` 的 `[...missing, ...defaultCardNumbers]`）同口径——新卡在保存
     * 前后都待在同一个位置，不会先落在末尾、刷新后又跳到最前。
     */
    remaining(): FudabaOwnerCard[] {
      const missing: FudabaOwnerCard[] = []
      for (const card of cards) {
        if (placed.has(card.id)) continue
        placed.add(card.id)
        missing.push(card)
      }
      return missing
    },
  }
}

/**
 * 布局 + 卡片合成渲染结构（只读模式）。
 *
 * - 默认分组永远第一且无标题，顺序就是 `defaultCardNumbers`；
 * - 组内只保留本次真的拥有的卡（布局里已删除、已隐藏的编号被丢弃）；
 * - 布局里没出现过的卡补进默认分组**最前**（见 `createCardClaimer.remaining`）；
 * - 只引用不在手上的卡的组直接不渲染（服务端也只保存非空分组）。
 */
export function buildCardGroups(
  cards: readonly FudabaOwnerCard[],
  layout: NamecardCardLayout | null
): CardGroup[] {
  const claimer = createCardClaimer(cards)

  // 认领顺序与服务端归一一致（`layout.ts` 的 `normalizeCardLayout`）：**各分组先认领**，
  // 默认分组再认领剩下的；同一编号被两处引用时它归分组，不会在两边各出现一次。
  const groups: CardGroup[] = []
  for (const group of layout?.groups ?? []) {
    const groupCards = claimer.take(group.cardNumbers)
    if (!groupCards.length) continue
    groups.push({ id: group.id, title: group.title.trim(), cards: groupCards })
  }

  const defaultCards = claimer.take(layout?.defaultCardNumbers ?? [])

  // 默认分组没有卡片时不渲染（卡片全在命名分组里）；有卡片时永远第一。
  const defaultGroupCards = [...claimer.remaining(), ...defaultCards]
  return defaultGroupCards.length
    ? [{ id: null, title: null, cards: defaultGroupCards }, ...groups]
    : groups
}

/**
 * 按分组顺序展平（默认分组在前，然后按分组顺序）：分组模式与经典模式共用的**基础**列表，
 * 也是缺创建时间时的确定性回退顺序（见 `sortCardsByCreatedAtDesc`）。
 *
 * **经典模式不是这个顺序**（2026-11-17 用户口径更正）：它按名片自己的创建时间降序排，
 * 与分组、组内顺序都无关。
 */
export function flattenCardGroups(
  groups: readonly CardGroupView[]
): FudabaOwnerCard[] {
  return groups.flatMap((group) => group.cards)
}

/**
 * 名片的创建时间（契约里的 `createdAt`，**不是**瓦片显示的 `madeOn` 制作时间）；
 * 缺失或解析不了时返回 `null`。
 */
function cardCreatedAtMs(
  card: Pick<FudabaOwnerCard, "createdAt">
): number | null {
  const value = card.createdAt
  if (!value) return null
  const ms = new Date(value).valueOf()
  return Number.isNaN(ms) ? null : ms
}

/**
 * 经典模式的展示顺序：按名片**创建时间降序**（最新在前）。
 *
 * 它是一条**派生**顺序——经典模式不渲染组头、也不写入任何用户排序（布局 JSON 里没有它的
 * 位置），分组与组内顺序在切回分组模式后原样保留。
 *
 * 回退是**确定**的：创建时间缺失/无效的卡排在最后、相互之间按传入顺序（也就是分组顺序展平
 * 之后的原下标）排；时间完全相同的也按原下标排。同一组输入永远得到同一个输出顺序。
 */
export function sortCardsByCreatedAtDesc(
  cards: readonly FudabaOwnerCard[]
): FudabaOwnerCard[] {
  return cards
    .map((card, index) => ({ card, index, createdAt: cardCreatedAtMs(card) }))
    .sort((left, right) => {
      if (left.createdAt === null || right.createdAt === null) {
        if (left.createdAt === null && right.createdAt === null) {
          return left.index - right.index
        }
        return left.createdAt === null ? 1 : -1
      }
      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt
      }
      return left.index - right.index
    })
    .map((entry) => entry.card)
}

/** 分组标题的字数上限（去首尾空白后），与服务端 `namecardCardLayoutGroupSchema` 同一口径。 */
export const CARD_GROUP_TITLE_MAX_LENGTH = 40

/** 新建分组在拿到服务端 id 之前用的本地键前缀；保存时这个分组发 `id: null`。 */
const LOCAL_CARD_GROUP_KEY_PREFIX = "local:"

/** 分组放置区（瓦片网格）的 droppable id 前缀：卡片拖到这里 = 落到该分组末尾。 */
const CARD_GROUP_DROP_ID_PREFIX = "group-drop:"

/** 分组自身的 sortable id 前缀（只有命名分组的组头可拖）。 */
const CARD_GROUP_SORTABLE_ID_PREFIX = "group-item:"

/**
 * 编辑会话里的一个命名分组（**不含**默认分组）。`id === null` 表示本次新建，
 * 保存时原样发 `null` 由服务端分配 uuid。
 */
export type CardManagerGroup = {
  /**
   * 稳定身份：既有分组 = 服务端 id，新建分组 = 本地键（`local:` 前缀）。
   * React key / 折叠键 / dnd id 都用它——新建分组还没有 id，不能拿 id 当身份。
   */
  key: string
  /** 服务端分配的分组 id；本次新建时为 `null`。 */
  id: string | null
  /** 已去首尾空白，1–40 字（`createCardGroup` / `renameCardGroup` 保证）。 */
  title: string
  /** 组内名片编号，顺序即展示顺序。 */
  cardNumbers: number[]
}

/**
 * 布局草稿：与 `PUT /me/cards/layout` 的 `groups` + `defaultCardNumbers` 同结构。
 * 编辑模式下的拖动只改它，点保存才整份提交（§12）。
 */
export type CardManagerLayoutDraft = {
  /** 命名分组；默认分组永远排在它们之前，所以不在这个数组里。 */
  groups: CardManagerGroup[]
  /** 默认分组（无标题、永远第一）的顺序。 */
  defaultCardNumbers: number[]
}

/**
 * 一次移动的落点：默认分组用 `DEFAULT_CARD_GROUP_KEY`，命名分组用它的 `key`。
 *
 * `index` 是**摘掉被搬走的卡之后**目标列表里的下标（与 `arrayMove` 同一套语义）：
 * 落在「被压住的那张卡现在的下标」上就对了——向下拖落在那张卡后面，向上拖落在它前面。
 */
export type CardMoveTarget = {
  groupKey: string
  index?: number
}

/**
 * 由「服务端归一后的布局 + 手上的卡」生成布局草稿：结构与只读渲染（`buildCardGroups`）
 * 逐字一致，也就是把「布局里还没出现过的卡」显式写进默认分组最前。
 *
 * 这样拖拽落点的下标在草稿与渲染之间一一对应；保存时又是整份写回，服务端不必再兜底一次
 * （否则「补进默认分组最前」的卡会让下标错位，用户拖到的位置与保存结果不一致）。
 */
export function createCardLayoutDraft(
  cards: readonly FudabaOwnerCard[],
  layout: NamecardCardLayout | null
): CardManagerLayoutDraft {
  const groups: CardManagerGroup[] = []
  let defaultCardNumbers: number[] = []
  for (const group of buildCardGroups(cards, layout)) {
    if (group.id === null) {
      defaultCardNumbers = cardNumbersOf(group.cards)
      continue
    }
    groups.push({
      key: group.id,
      id: group.id,
      // 服务端允许标题只有空白；展示兜底成「未命名分组」，保存时也按看到的标题写回。
      title: cardGroupHeading(group) ?? "",
      cardNumbers: cardNumbersOf(group.cards),
    })
  }
  return { groups, defaultCardNumbers }
}

/** 组内卡片 → 编号；同一编号只留一处，编号撞车的异常数据也不会让保存请求 400。 */
function cardNumbersOf(cards: readonly FudabaOwnerCard[]): number[] {
  const numbers: number[] = []
  const seen = new Set<number>()
  for (const card of cards) {
    if (seen.has(card.cardNumber)) continue
    seen.add(card.cardNumber)
    numbers.push(card.cardNumber)
  }
  return numbers
}

/** 还能不能新建分组（上限来自契约，别写死）。 */
export function canCreateCardGroup(
  groups: readonly CardManagerGroup[]
): boolean {
  return groups.length < NAMECARD_PROFILE_GROUP_LIMIT
}

/**
 * 待命名分组（§7.2「一步新建」）：点【新建分组】那一刻就往草稿里插一个**真实存在**的分组，
 * 标题为空、`id: null`（沿用 `local:N` key），于是它的区域（组头输入框 + 空放置区）**立刻**
 * 渲染出来、也立刻是合法落点；标题在组头里回车/失焦才落地（见 `settleCardGroupTitle`）。
 *
 * 插到 `afterKey` 那个分组**正下方**；`afterKey` 省略、是默认分组（`DEFAULT_CARD_GROUP_KEY`）
 * 或已经不存在时插到命名分组首位（按分组顺序看那正是默认分组下方）。
 *
 * 已达分组上限时返回 `null`（调用方的按钮那时本来就是禁用的）。
 */
export function addPendingCardGroup(
  groups: CardManagerGroup[],
  afterKey?: string
): { groups: CardManagerGroup[]; key: string } | null {
  if (!canCreateCardGroup(groups)) return null
  const created: CardManagerGroup = {
    key: nextLocalCardGroupKey(groups),
    id: null,
    title: "",
    cardNumbers: [],
  }
  return {
    groups: insertCardGroupAfter(groups, created, afterKey),
    key: created.key,
  }
}

/** 把新分组插到 `afterKey` 正下方；锚点不在（默认分组/已删/未给）时插到命名分组首位。 */
function insertCardGroupAfter(
  groups: CardManagerGroup[],
  created: CardManagerGroup,
  afterKey?: string
): CardManagerGroup[] {
  const afterIndex = afterKey
    ? groups.findIndex((group) => group.key === afterKey)
    : -1
  if (afterIndex < 0) return [created, ...groups]
  return [
    ...groups.slice(0, afterIndex + 1),
    created,
    ...groups.slice(afterIndex + 1),
  ]
}

/**
 * 待命名分组的标题落地（回车 / 失焦 / `Esc`）：非空标题就是给它命名；**空标题等于丢弃这一组**
 * ——组内名片退回默认分组末尾（与删除分组同一条路，纯草稿、不丢数据）。
 */
export function settleCardGroupTitle(
  draft: CardManagerLayoutDraft,
  key: string,
  title: string
): CardManagerLayoutDraft {
  if (!draft.groups.some((group) => group.key === key)) return draft
  const trimmed = title.trim()
  if (!trimmed) return removeCardGroup(draft, key)
  return { ...draft, groups: renameCardGroup(draft.groups, key, trimmed) }
}

/** 本地键取「已有的 `local:N` 里没被用过的下一个」，拖动排序不会改变它。 */
function nextLocalCardGroupKey(groups: readonly CardManagerGroup[]): string {
  let max = 0
  for (const group of groups) {
    if (!group.key.startsWith(LOCAL_CARD_GROUP_KEY_PREFIX)) continue
    const value = Number.parseInt(
      group.key.slice(LOCAL_CARD_GROUP_KEY_PREFIX.length),
      10
    )
    if (Number.isFinite(value) && value > max) max = value
  }
  return `${LOCAL_CARD_GROUP_KEY_PREFIX}${max + 1}`
}

/** 重命名分组：标题去首尾空白；空标题、超长标题或没有实际变化时原样返回。 */
export function renameCardGroup(
  groups: CardManagerGroup[],
  key: string,
  title: string
): CardManagerGroup[] {
  const trimmed = title.trim()
  if (!trimmed || trimmed.length > CARD_GROUP_TITLE_MAX_LENGTH) return groups
  const target = groups.find((group) => group.key === key)
  if (!target || target.title === trimmed) return groups
  return groups.map((group) =>
    group.key === key ? { ...group, title: trimmed } : group
  )
}

/**
 * 删除分组：组内名片**退回默认分组末尾**（按组内顺序追加），不会跟着分组一起消失。
 * 未知 key 原样返回。
 */
export function removeCardGroup(
  draft: CardManagerLayoutDraft,
  key: string
): CardManagerLayoutDraft {
  const target = draft.groups.find((group) => group.key === key)
  if (!target) return draft
  return {
    groups: draft.groups.filter((group) => group.key !== key),
    defaultCardNumbers: appendMissingNumbers(
      draft.defaultCardNumbers,
      target.cardNumbers
    ),
  }
}

function appendMissingNumbers(
  current: readonly number[],
  incoming: readonly number[]
): number[] {
  const present = new Set(current)
  const next = [...current]
  for (const number of incoming) {
    if (present.has(number)) continue
    present.add(number)
    next.push(number)
  }
  return next
}

/**
 * 命名分组之间的排序。默认分组永远第一、不参与排序；未知 key 或原地不动时原样返回。
 */
export function reorderCardGroups(
  groups: CardManagerGroup[],
  fromKey: string,
  toKey: string
): CardManagerGroup[] {
  const from = groups.findIndex((group) => group.key === fromKey)
  const to = groups.findIndex((group) => group.key === toKey)
  if (from < 0 || to < 0 || from === to) return groups
  const next = [...groups]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/**
 * 把一批编号整体搬到目标位置：先把它从所有分组里摘掉（同一张名片只留一处），再按批次顺序
 * 插到目标分组的 `index` 处（省略即末尾）。
 *
 * - 批次内部的相对顺序保持不变；
 * - 重复编号只保留一处（摘的时候按编号摘，插的时候按去重后的批次插）；
 * - 目标分组不存在（例如刚好被删掉）时退回默认分组末尾，宁可落回默认分组也不静默丢掉这次移动。
 */
export function moveCards(
  draft: CardManagerLayoutDraft,
  cardNumbers: readonly number[],
  target: CardMoveTarget
): CardManagerLayoutDraft {
  const moving = [...new Set(cardNumbers)]
  if (!moving.length) return draft
  const movingSet = new Set(moving)

  const groups = draft.groups.map((group) => ({
    ...group,
    cardNumbers: group.cardNumbers.filter((number) => !movingSet.has(number)),
  }))
  const defaultCardNumbers = draft.defaultCardNumbers.filter(
    (number) => !movingSet.has(number)
  )

  const targetGroup =
    target.groupKey === DEFAULT_CARD_GROUP_KEY
      ? null
      : (groups.find((group) => group.key === target.groupKey) ?? null)

  if (!targetGroup) {
    return {
      groups,
      defaultCardNumbers: insertCards(defaultCardNumbers, target.index, moving),
    }
  }
  const nextNumbers = insertCards(targetGroup.cardNumbers, target.index, moving)
  return {
    groups: groups.map((group) =>
      group.key === targetGroup.key
        ? { ...group, cardNumbers: nextNumbers }
        : group
    ),
    defaultCardNumbers,
  }
}

function insertCards(
  list: readonly number[],
  index: number | undefined,
  moving: readonly number[]
): number[] {
  const at = Math.max(0, Math.min(index ?? list.length, list.length))
  return [...list.slice(0, at), ...moving, ...list.slice(at)]
}

/** 落点几何用的矩形：只取 `getBoundingClientRect` 的四个边（视口坐标）。 */
export type CardDropRect = {
  left: number
  top: number
  right: number
  bottom: number
}

/** 落点几何里的一张瓦片：卡 id（单测与调试时指认是哪一张）与它此刻的矩形（计算只用矩形）。 */
export type CardDropPointerTile = {
  cardId: string
  rect: CardDropRect
}

/** 落点几何里的一个分组：放置区矩形 + 区内**此刻真的渲染出来**的瓦片。 */
export type CardDropPointerGroup = {
  key: string
  rect: CardDropRect
  tiles: readonly CardDropPointerTile[]
}

/** 行主序判定里「同一行」的容差：瓦片中心整整高出这么多才算上一行，否则按横向位置比。 */
const CARD_DROP_ROW_TOLERANCE_PX = 6

function rectCenterOf(rect: CardDropRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
}

function rectContainsPoint(
  rect: CardDropRect,
  point: { x: number; y: number }
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}

/** 点到矩形的最短距离（在矩形内为 0）。 */
function rectDistanceToPoint(
  rect: CardDropRect,
  point: { x: number; y: number }
): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
  return Math.hypot(dx, dy)
}

/**
 * 渲染中的矩形 → **布局**矩形：减掉元素自己此刻的位移。
 *
 * 拖动中瓦片常常正在跑 FLIP 的 180ms 过渡（落点 ghost 插入/展开把它们顶开），
 * `getBoundingClientRect()` 量到的是**半路上**的渲染位置；按它算落点，指针一动不动、落点也会
 * 跟着动画抖，ghost 于是插在「马上就要消失」的位置上（用户 2026-11-17 反馈「合集拖拽展开
 * 过程中偶发错位」）。减掉位移之后量到的是它**将要去的地方**——也就是 ghost 插好之后的真实
 * 排版，动画与滚动都不再干扰落点。
 *
 * 只减平移：那一刻瓦片上只可能有我们写的 `translate`（dnd-kit 的排序位移被
 * `NO_SHIFT_SORTING_STRATEGY` 关掉了），缩放/旋转不参与落点。
 */
export function layoutRectFromRenderedRect(
  rect: CardDropRect,
  computedTransform: string | null | undefined
): CardDropRect {
  const offset = cardFlipOffsetFromComputedStyle(computedTransform)
  return {
    left: rect.left - offset.dx,
    top: rect.top - offset.dy,
    right: rect.right - offset.dx,
    bottom: rect.bottom - offset.dy,
  }
}

/**
 * 指针几何直接算落点：**不看 dnd-kit 的 `over`**。
 *
 * `over` 依赖 dnd-kit 缓存的 droppable rects（哪怕 `strategy: Always`，也只在拖拽开始与
 * droppable 增删时重量），而落点 ghost 一插进网格就真的改变了布局——于是它总比指针晚一拍，
 * 多选拖动（ghost 是那一刻唯一的位移来源）的落点因此不如单张准（2026-11-17 用户反馈）。
 *
 * 这里改成本次指针位置直接对着**当前 DOM 实测的矩形**比：
 * - 先取指针**所在**的分组（分组放置区命中优先），都不命中时取最近的一个
 *   （与 `closestCenter` 一样不会返回 null：指针拖到列表外面也总有个落点）；
 * - 组内用行主序数「排在指针前面的瓦片」：中心整整高出 `CARD_DROP_ROW_TOLERANCE_PX` 的算
 *   上一行；与指针同一行（垂直方向还有重叠）的按中心横向位置比；
 * - 空组是 0；指针在整组之上是 0、之下就是整组张数。
 *
 * 调用方传进来的 `tiles` 是**已经摘掉本批**的实时列表（多选拖动中整批已经不在 DOM 里），
 * 所以下标与 `CardMoveTarget.index` 同口径：ghost 插在哪儿、松手就落在哪儿。矩形得是
 * **布局**矩形（`layoutRectFromRenderedRect`），不然过渡中途量到的是半路位置。
 */
export function resolveCardDropFromPointer({
  pointer,
  groups,
}: {
  pointer: { x: number; y: number }
  groups: readonly CardDropPointerGroup[]
}): { groupKey: string; index: number } | null {
  const hit = groups.find((group) => rectContainsPoint(group.rect, pointer))
  const group = hit ?? nearestCardDropGroup(groups, pointer)
  if (!group) return null
  return {
    groupKey: group.key,
    index: cardDropIndexAtPointer(group.tiles, pointer),
  }
}

/** 都不命中时取最近的分组：指针拖到列表外面（工具栏、页脚）也总有一个落点。 */
function nearestCardDropGroup(
  groups: readonly CardDropPointerGroup[],
  pointer: { x: number; y: number }
): CardDropPointerGroup | null {
  let nearest: { group: CardDropPointerGroup; distance: number } | null = null
  for (const group of groups) {
    const distance = rectDistanceToPoint(group.rect, pointer)
    if (!nearest || distance < nearest.distance) {
      nearest = { group, distance }
    }
  }
  return nearest?.group ?? null
}

/** 组内插入下标 = 「排在指针前面」的瓦片数（行主序）。 */
function cardDropIndexAtPointer(
  tiles: readonly CardDropPointerTile[],
  pointer: { x: number; y: number }
): number {
  let index = 0
  for (const tile of tiles) {
    const center = rectCenterOf(tile.rect)
    // 上一行的瓦片：整整一行都在指针上方，横向位置无关紧要。
    if (center.y < pointer.y - CARD_DROP_ROW_TOLERANCE_PX) {
      index += 1
      continue
    }
    // 同一行：瓦片在垂直方向上还与指针重叠时，中心落在指针左边的算前面。
    const halfHeight = (tile.rect.bottom - tile.rect.top) / 2
    if (Math.abs(center.y - pointer.y) <= halfHeight && center.x < pointer.x) {
      index += 1
    }
  }
  return index
}

/**
 * 保存前的空分组丢弃：新建后一张卡都没放进去的分组等于没建，服务端的 `saveCardLayout`
 * 也是同一口径（它还会再过滤一次），这里先丢掉是为了让脏标记与保存结果一致。
 */
export function dropEmptyGroups(
  groups: readonly CardManagerGroup[]
): CardManagerGroup[] {
  return groups.filter((group) => group.cardNumbers.length > 0)
}

/**
 * 保存前把**还没命名的分组**（标题为空）收掉：服务端要求标题 1–40 字，空标题的分组不进请求体；
 * 组内名片退回默认分组末尾——与会话里那一组被丢弃（`settleCardGroupTitle(key, "")`）逐字一致。
 */
export function settleUnnamedCardGroups(
  draft: CardManagerLayoutDraft
): CardManagerLayoutDraft {
  let next = draft
  for (const group of draft.groups) {
    if (group.title.trim()) continue
    next = removeCardGroup(next, group.key)
  }
  return next
}

/** 两份布局草稿保存后的结果是否一致（空分组不参与，它们保存时会被丢掉）。 */
export function sameCardLayoutDraft(
  left: CardManagerLayoutDraft,
  right: CardManagerLayoutDraft
): boolean {
  const leftGroups = dropEmptyGroups(left.groups)
  const rightGroups = dropEmptyGroups(right.groups)
  if (leftGroups.length !== rightGroups.length) return false
  for (let index = 0; index < leftGroups.length; index += 1) {
    const a = leftGroups[index]!
    const b = rightGroups[index]!
    if (a.id !== b.id || a.title !== b.title) return false
    if (!sameCardNumberOrder(a.cardNumbers, b.cardNumbers)) return false
  }
  return sameCardNumberOrder(left.defaultCardNumbers, right.defaultCardNumbers)
}

/** 顺序敏感的比较：用户拖出来的顺序就是他要的顺序。 */
function sameCardNumberOrder(
  left: readonly number[],
  right: readonly number[]
): boolean {
  return (
    left.length === right.length &&
    left.every((number, index) => number === right[index])
  )
}

/**
 * 编辑模式渲染用一个分组：默认分组的 `key` 是 `DEFAULT_CARD_GROUP_KEY`，新建分组用本地键。
 * 只读模式用 `CardGroup`（`id === null` 即默认分组），两者靠 `cardGroupKey` 统一。
 */
export type DraftCardGroup = {
  key: string
  id: string | null
  title: string | null
  cards: FudabaOwnerCard[]
}

/**
 * 编辑模式的渲染结构：默认分组**永远渲染**（空着也要留出放置区，卡片要能拖回去），
 * 命名分组同样哪怕空着也渲染（刚建好还没放卡，或者卡片被全部拖走）。
 * 只读模式走 `buildCardGroups`：空分组不渲染（服务端也只保存非空分组）。
 */
export function buildDraftCardGroups(
  cards: readonly FudabaOwnerCard[],
  draft: CardManagerLayoutDraft
): DraftCardGroup[] {
  const claimer = createCardClaimer(cards)
  const groups: DraftCardGroup[] = draft.groups.map((group) => ({
    key: group.key,
    id: group.id,
    title: group.title.trim(),
    cards: claimer.take(group.cardNumbers),
  }))
  const defaultCards = claimer.take(draft.defaultCardNumbers)
  return [
    {
      key: DEFAULT_CARD_GROUP_KEY,
      id: null,
      title: null,
      cards: [...claimer.remaining(), ...defaultCards],
    },
    ...groups,
  ]
}

/** 分组放置区的 droppable id。 */
export function cardGroupDropId(key: string): string {
  return `${CARD_GROUP_DROP_ID_PREFIX}${key}`
}

/** 分组自身的 sortable id（只有命名分组的组头挂它）。 */
export function cardGroupSortableId(key: string): string {
  return `${CARD_GROUP_SORTABLE_ID_PREFIX}${key}`
}

export function isCardGroupDropId(id: string): boolean {
  return id.startsWith(CARD_GROUP_DROP_ID_PREFIX)
}

export function isCardGroupSortableId(id: string): boolean {
  return id.startsWith(CARD_GROUP_SORTABLE_ID_PREFIX)
}

/** 放置区 id → 分组键；不是放置区时返回 `null`。 */
export function cardGroupKeyFromDropId(id: string): string | null {
  return isCardGroupDropId(id)
    ? id.slice(CARD_GROUP_DROP_ID_PREFIX.length)
    : null
}

/** 分组 sortable id → 分组键；不是分组 sortable 时返回 `null`。 */
export function cardGroupKeyFromSortableId(id: string): string | null {
  return isCardGroupSortableId(id)
    ? id.slice(CARD_GROUP_SORTABLE_ID_PREFIX.length)
    : null
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

export function cardGroupViewTransitionName(group: CardGroupIdentity): string {
  return `group-${identFrom(cardGroupKey(group))}`
}

/**
 * 减少动态效果的首选项查询。View Transition（`applyLayout`）与拖拽期的动画
 * （`useCardGridFlip`、落点 ghost）共用同一套判据，避免「这里动、那里不动」。
 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** jsdom 没有 `matchMedia`（仓库测试环境即如此），读不到时按「不减少」处理。 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.(REDUCED_MOTION_QUERY).matches === true
  )
}

/**
 * 一次布局变化（切换模式 / 折叠展开 / 保存布局）外面包一层 View Transition：
 * 浏览器支持且未开启 reduced motion 时用 `flushSync` 让 React 在同一帧提交，
 * 否则直接变更。jsdom 没有 `document.startViewTransition`，走同步分支，不抛错。
 */
export function applyLayout(mutate: () => void): void {
  const startViewTransition =
    typeof document === "undefined" ? undefined : document.startViewTransition
  if (typeof startViewTransition !== "function" || prefersReducedMotion()) {
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
export function selectableCardIds(cards: readonly FudabaOwnerCard[]): string[] {
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
  layoutChanged = false,
}: {
  cards: readonly FudabaOwnerCard[]
  layout: NamecardCardLayout | null
  quickCardNumbers: readonly number[]
  cardSettings: CardManagerCardSettings
  /**
   * 布局草稿相对**会话开始时**的差异（`sameCardLayoutDraft` 判定）。不拿它跟服务端布局比：
   * 草稿会把「布局里还没出现过的卡」显式写进默认分组最前，一进编辑模式就跟服务端布局不同。
   */
  layoutChanged?: boolean
}): boolean {
  if (layoutChanged) return true
  if (collectCardSettings(cards, cardSettings).length > 0) return true
  return !sameCardNumbers(
    effectiveQuickCardNumbers(quickCardNumbers, cards, cardSettings),
    layout?.quickCardNumbers ?? []
  )
}

/**
 * 组装整份保存请求（§4.2）。
 *
 * 布局用**草稿里的分组结构**：空分组丢弃，新建分组发 `id: null`（服务端分配 uuid），
 * 组内编号顺序即用户拖出来的顺序。`layoutDraft` 省略时退回「已加载的布局原样」，
 * 给只改快速清单的调用留一条不动布局的安全路径。
 * `quickCardNumbers` 整份覆盖；`cardSettings` 只放改动过的卡。
 */
export function buildCardLayoutRequest({
  cards,
  layout,
  quickCardNumbers,
  cardSettings,
  layoutDraft = null,
}: {
  cards: readonly FudabaOwnerCard[]
  layout: NamecardCardLayout | null
  quickCardNumbers: readonly number[]
  cardSettings: CardManagerCardSettings
  /** 编辑会话里的布局草稿；为空时用已加载的布局原样回传。 */
  layoutDraft?: CardManagerLayoutDraft | null
}): NamecardCardLayoutRequest {
  // 会话里可能还挂着一个「点了新建分组但没填名字」的分组：它不进请求体，卡片退回默认分组
  // 末尾（与服务端「标题 1–40 字」的校验同口径，也和那一组被丢弃时逐字一致）。
  const draft = layoutDraft ? settleUnnamedCardGroups(layoutDraft) : null
  return {
    groups: draft
      ? dropEmptyGroups(draft.groups).map((group) => ({
          id: group.id,
          title: group.title.trim(),
          cardNumbers: [...group.cardNumbers],
        }))
      : (layout?.groups ?? []).map((group) => ({
          id: group.id,
          title: group.title,
          cardNumbers: [...group.cardNumbers],
        })),
    defaultCardNumbers: [
      ...(draft?.defaultCardNumbers ?? layout?.defaultCardNumbers ?? []),
    ],
    quickCardNumbers: effectiveQuickCardNumbers(
      quickCardNumbers,
      cards,
      cardSettings
    ),
    cardSettings: collectCardSettings(cards, cardSettings),
  }
}
