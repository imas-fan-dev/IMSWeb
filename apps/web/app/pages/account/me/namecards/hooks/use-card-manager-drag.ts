import {
  closestCenter,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DndContextProps,
  type KeyboardCoordinateGetter,
  type MeasuringConfiguration,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { FudabaOwnerCard } from "~/lib/api"
import {
  cardGroupKeyFromDropId,
  cardGroupKeyFromSortableId,
  DEFAULT_CARD_GROUP_KEY,
  DEFAULT_CARD_GROUP_LABEL,
  isCardGroupSortableId,
  layoutRectFromRenderedRect,
  resolveCardDropFromPointer,
  type CardDropPointerGroup,
  type CardDropRect,
  type CardMoveTarget,
  type DraftCardGroup,
} from "../card-manager-model"

/** 指针移动多远才算「真的在拖」（与 tier-list 的 6px 一致）：再小就当点击/勾选。 */
const POINTER_ACTIVATION_DISTANCE_PX = 6

/**
 * 触屏拖拽的按住时长（设计 §11）：手指按住 250ms 才算「要拖」，短于此的抬手是勾选。
 * 与「长按进编辑」的 450ms（`lib/use-long-press.ts`）是两件事：那一个是编辑模式**之外**
 * 的入口，这一个只在编辑模式里工作，两者不叠加。
 */
const TOUCH_ACTIVATION_DELAY_MS = 250

/** 等待这 250ms 期间手指允许的抖动：超过它就不是「按住」了（设计 §11）。 */
const TOUCH_ACTIVATION_TOLERANCE_PX = 8

/**
 * 落点候选稳定这么久之后，合集 ghost 展开成 N 个缩略图 ghost（用户 2026-11-17 定：
 * 原来的 180ms 太短，还没来得及看清落点就展开了；2.5s 实测又等太久，改成 1s）。
 */
const CARD_DROP_GHOST_DWELL_MS = 1000

/**
 * 展开之后再移动超过这么多像素，就当作「用户在找新的落点」：立刻收起回合集 ghost
 * 并重新开始 1s 计时（用户 2026-11-17 定：原来的 12px 太容易误触）。
 */
const GHOST_COLLAPSE_DISTANCE_PX = 16

/**
 * 落点候选的死区：指针离「上次采纳候选时的位置」不到这么远时，即使几何上算出来的候选变了也
 * 不换 ghost。行端点那点抖动（上一行的末尾与下一行的开头只差几像素）因此不会让落点在两行之间
 * 反复横跳——ghost 是那一刻唯一的位移来源，它一换布局就变、指针又可能算回原候选，没有死区
 * 就是 60Hz 来回切（用户 2026-11-17 反馈）。
 *
 * 与 `GHOST_COLLAPSE_DISTANCE_PX`（16）同量级：横向/纵向跨过一格都远大于它，所以正常拖动
 * 感觉不到延迟。
 */
const DROP_TARGET_HYSTERESIS_PX = 12

/**
 * 卡片的落点已经不走 dnd-kit 的 `over` 了（改成按指针几何实测 DOM，见 `applyPointerTarget`），
 * 所以不再需要「拖动中每 100ms 按位移重测」的 `frequency`。
 *
 * 留下 `strategy: Always` 是给还在用 `over` 的两条路：**键盘拖拽**的落点与**分组排序**。
 * 它们都要求 droppable 增删之后 rects 重新量一遍（多选拖动一开始整批移出列表就是一次增删），
 * 否则缓存 rects 与真实 DOM 差一格、`over` 指到错位的容器上（2026-11-17 实测）。
 */
const MEASURING: MeasuringConfiguration = {
  droppable: { strategy: MeasuringStrategy.Always },
}

/** 分组放置区的 DOM 契约：`CardGroupSection` 在放置区上挂 `data-card-group-key={key}`。 */
const CARD_GROUP_AREA_SELECTOR = "[data-card-group-key]"

/**
 * 瓦片身份的 DOM 契约：`SortableCardTile` 的 `data-card-id`。落点 ghost 与它展开的格子都没有
 * 这个属性，所以它们天然不算一格——落点下标因此自动是「本批移出之后」的口径。
 */
const CARD_TILE_SELECTOR = "[data-card-id]"

function dropRectOf(node: Element): CardDropRect {
  const rect = node.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

/**
 * 这一刻的落点几何：每个分组放置区一个矩形 + 区内**真的渲染出来**的瓦片矩形。
 * 折叠的分组不渲染放置区，因此天然不在候选里（也就落不进去）。
 *
 * 瓦片量的是**布局**矩形（`layoutRectFromRenderedRect`）：拖动中它们常常正在跑 FLIP 的过渡，
 * 量渲染中的位置会让落点跟着动画一起抖。放置区自己没有任何动画，直接量。
 */
function readDropPointerGroups(): CardDropPointerGroup[] {
  const groups: CardDropPointerGroup[] = []
  for (const area of document.querySelectorAll<HTMLElement>(
    CARD_GROUP_AREA_SELECTOR
  )) {
    const key = area.dataset.cardGroupKey
    if (!key) continue
    groups.push({
      key,
      rect: dropRectOf(area),
      tiles: [
        ...area.querySelectorAll<HTMLElement>(CARD_TILE_SELECTOR),
      ].map((tile) => ({
        cardId: tile.dataset.cardId ?? "",
        rect: layoutRectFromRenderedRect(
          dropRectOf(tile),
          window.getComputedStyle(tile).transform
        ),
      })),
    })
  }
  return groups
}

/**
 * 拖动中落点处的 ghost：`index` 是插入位置，口径与 `CardMoveTarget.index` 一致（**摘掉整批
 * 之后**目标列表里的下标），所以它插在哪儿、松手后就落在哪儿。
 *
 * 未展开时是一摞合集（占 1 格）；落点稳定 `CARD_DROP_GHOST_DWELL_MS` 之后 `expanded`
 * 换成 N 个缩略图 ghost（N = 批次张数，也就是当前选择集的张数，没有上限）。
 */
export type CardDropPreview = {
  groupKey: string
  index: number
  expanded: boolean
}

/** 方向键 → 「候选容器在拖拽矩形的那一边」，与上游 `sortableKeyboardCoordinates` 同判据。 */
const KEYBOARD_DIRECTION_TESTS: Record<
  string,
  (rect: ClientRect, dragged: ClientRect) => boolean
> = {
  ArrowUp: (rect, dragged) => dragged.top > rect.top,
  ArrowDown: (rect, dragged) => dragged.top < rect.top,
  ArrowLeft: (rect, dragged) => dragged.left > rect.left,
  ArrowRight: (rect, dragged) => dragged.left < rect.left,
}

function rectCenter(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * 分组排序的键盘坐标。
 *
 * 上游的 `sortableKeyboardCoordinates` 会在**所有** droppable 里找下一个容器，卡片也在其中，
 * 于是拖着一个分组按方向键时，落点往往变成「某张卡所在的位置」，再被分组落点过滤成它自己，
 * 结果原地不动。分组排序只需要在组头之间移动，所以这里只在 `group-item:` 容器里按距离取下一个。
 */
const groupKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { active, context }
) => {
  const directionTest = KEYBOARD_DIRECTION_TESTS[event.code]
  if (!directionTest) return undefined
  const { collisionRect, droppableContainers, droppableRects, over } = context
  if (!collisionRect) return undefined
  // 方向键在拖拽中被我们自己消费掉，避免页面跟着滚动。
  event.preventDefault()

  const draggedCenter = rectCenter(collisionRect)
  const candidates: { id: string; rect: ClientRect; distance: number }[] = []
  for (const container of droppableContainers.getEnabled()) {
    const id = String(container.id)
    if (id === String(active) || !isCardGroupSortableId(id)) continue
    const rect = droppableRects.get(container.id)
    if (!rect || !directionTest(rect, collisionRect)) continue
    const center = rectCenter(rect)
    candidates.push({
      id,
      rect,
      distance: Math.hypot(
        center.x - draggedCenter.x,
        center.y - draggedCenter.y
      ),
    })
  }
  if (!candidates.length) return undefined
  candidates.sort((a, b) => a.distance - b.distance)
  // 停在最近的那个分组上时继续往前走一格，否则方向键会在同一对分组之间打转。
  const target =
    candidates.find((candidate) => candidate.id !== String(over?.id)) ??
    candidates[0]!
  return { x: target.rect.left, y: target.rect.top }
}

/** 具体落点：目标分组 + 目标下标（下标语义见 `CardMoveTarget`）。 */
type CardDropTarget = {
  groupKey: string
  index: number
}

type DragKind = "card" | "group"

/** 一次拖拽会话里只读的「谁在拖」：批次内的相对顺序就是列表顺序。 */
type DragSession = {
  kind: DragKind
  /** 被拖的名片（多选时是整个选择集，按清单顺序）。 */
  cardIds: readonly string[]
}

/**
 * 编辑模式的拖拽会话（§7.3）。
 *
 * 拖动**只改草稿、不写服务端**，落位在 `dragEnd` 一次性提交给 `onMoveCards` /
 * `onReorderCardGroups`；拖拽期间不起 View Transition（设计 §10.1）——落位后由 React
 * 按新顺序直接渲染。
 *
 * 预览的**唯一**位移来源是落点 ghost（`cardDropPreview`）：
 * 1. 拖动一开始，本次拖拽涉及的**全部**名片（多选就是整个选择集）立刻从列表里移出去；
 * 2. 落点位置插一个「合集 ghost」占住一张名片的位置（这一摞的真实缩略图 + 旋转，
 *    超过 3 张时右下角报总张数），落点稳定 `CARD_DROP_GHOST_DWELL_MS`（1s）后展开成
 *    N 个缩略图 ghost，真实预览
 *    插入后的排版；指针再动超过 `GHOST_COLLAPSE_DISTANCE_PX`（16px）或落点候选变了就
 *    收起回合集 ghost；**落点按指针几何实测 DOM 算，不看 dnd-kit 的 `over`**
 *    （见 `applyPointerTarget`）；
 * 3. 卡片列表的 `SortableContext` 因此必须用**恒等** strategy（`card-manager.tsx` 的
 *    `NO_SHIFT_SORTING_STRATEGY`）：ghost 已经真的占了一格，再叠加 sortable 位移就会错位
 *    （2026-11-17 用户实测：「瓦片前后各有一处空白」、列表错位甚至溢出）。
 *
 * 批次只有一张时不走这套：原瓦片留在原位压暗，让位交给 dnd-kit 的排序位移（上一轮已认可的
 * 观感）。键盘拖拽同样没有「指针停顿」，落点一确定就是展开态。
 *
 * 首页面的读屏播报走 dnd-kit 自己的 `aria-live` 区（`accessibility.announcements`）：
 * 移动完成后播报「已把 N 张名片移动到『组名』」。
 */
export function useCardManagerDrag({
  cards,
  groups,
  enabled,
  selectedCardIds,
  onMoveCards,
  onReorderCardGroups,
}: {
  cards: readonly FudabaOwnerCard[]
  /** 编辑模式渲染用的草稿分组结构（含默认分组）。 */
  groups: readonly DraftCardGroup[]
  /**
   * 卡片能不能被拖起来（编辑模式的分组视图）。指针追踪只在它打开时挂着：拖拽的落点要靠
   * `pointermove` 的真实视口坐标，而 dnd-kit 要等指针移动超过激活距离才回调 `onDragStart`
   * ——晚挂一步就会丢掉「激活那一次」的指针（见下面 `pointermove` 的那个 effect）。
   */
  enabled: boolean
  selectedCardIds: ReadonlySet<string>
  onMoveCards: (cardNumbers: readonly number[], target: CardMoveTarget) => void
  onReorderCardGroups: (fromKey: string, toKey: string) => void
}) {
  const [session, setSession] = useState<DragSession | null>(null)
  const [cardDropPreview, setCardDropPreview] = useState<CardDropPreview | null>(
    null
  )

  const sessionRef = useRef<DragSession | null>(null)
  /** `cardDropPreview` 的同步快照：拖拽事件里要立刻读到「现在展开没有」，不能等下一帧。 */
  const previewRef = useRef<CardDropPreview | null>(null)
  /** 展开计时器（`window.setTimeout`，浏览器里是数字）。每「重新计时」一次就换掉它。 */
  const dwellTimerRef = useRef<number | null>(null)
  /** 计时的参照点：指针离它超过 `GHOST_COLLAPSE_DISTANCE_PX` 就重新计时（顺便收起 ghost）。 */
  const dwellAnchorRef = useRef<{ x: number; y: number } | null>(null)
  /** 最近一次落定的落点候选；用它判断「候选变了没有」。 */
  const settledTargetRef = useRef<CardDropTarget | null>(null)
  /**
   * 采纳当前候选时的指针位置：死区（`DROP_TARGET_HYSTERESIS_PX`）就是从它算起的。
   * `settledTargetRef` 与它必须一起更新——两者是同一件事（「这个候选取自哪儿」）。
   */
  const targetAnchorRef = useRef<{ x: number; y: number } | null>(null)
  /**
   * 指针拖拽（批次 ≥ 2）最后算出来的落点：松手时按它落位（状态可能还差一帧，所以留快照）。
   */
  const pointerTargetRef = useRef<CardDropTarget | null>(null)
  /**
   * 最后一次 `pointermove` 的视口坐标。滚动（含 dnd-kit 的自动滚动）只改布局、不改指针，
   * 而 `scroll` 事件里拿不到指针坐标——重解析落点只能拿这个位置当落点。
   */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  /** 合并一个滚动批次：这一帧已经排过重解析就不再排（`scroll` 会成串到来）。 */
  const scrollReparseRafRef = useRef<number | null>(null)
  /** 这一趟是不是键盘拖拽：键盘没有「指针停顿」，ghost 直接按展开态渲染。 */
  const keyboardDragRef = useRef(false)
  /** 播报文案在事件处理器里写好，`aria-live` 的回调再取出来（回调执行晚于一帧）。 */
  const messagesRef = useRef({
    start: "",
    over: "",
    end: "",
    cancel: "",
  })

  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards]
  )

  /** 分组标题兜底：默认分组没有标题，播报里也得有个名字。 */
  const groupTitle = useCallback(
    (key: string) => {
      if (key === DEFAULT_CARD_GROUP_KEY) return DEFAULT_CARD_GROUP_LABEL
      return (
        groups.find((group) => group.key === key)?.title ??
        DEFAULT_CARD_GROUP_LABEL
      )
    },
    [groups]
  )

  /**
   * 拿到手的那张卡若在选择集里，整个选择集一起拖（多选堆叠，§7.3）；
   * 否则只拖这一张。顺序按清单顺序，批次内相对顺序不变。
   */
  const dragPayload = useCallback(
    (activeCardId: string): readonly string[] => {
      if (!selectedCardIds.has(activeCardId)) return [activeCardId]
      const ordered = groups.flatMap((group) =>
        group.cards
          .map((card) => card.id)
          .filter((cardId) => selectedCardIds.has(cardId))
      )
      return ordered.includes(activeCardId) ? ordered : [activeCardId]
    },
    [groups, selectedCardIds]
  )

  /**
   * 落点 → 「哪个分组、第几张」。
   *
   * 下标与 `CardMoveTarget.index` 同一套语义：**整批移出之后**目标列表里的位置。
   * 多选拖动（批次 ≥ 2）时这一批已经从每一张列表里移出去（`draggedCardIds` 过滤渲染），
   * 所以解析落点也要在**同一份**列表里定位，否则落点组里含本批名片时下标会多算
   * 「排在落点之前的本批张数」，ghost 与真正的落位就分家了（同组重排、跨组落回来源组都会踩到）。
   * 批次只有一张时原瓦片仍在列表里（让位交给 dnd-kit 的排序位移），下标照旧按完整列表算
   * ——与 `arrayMove` 同口径：落在「被压住的那张卡现在的下标」上就对了。
   *
   * 落到分组放置区的空白处 = 该分组（已摘掉本批的）末尾；落到某张卡上 = 那张卡在
   * （已摘掉本批的）列表里的位置。折叠分组的放置区不渲染，所以它根本不在候选里
   * （头部也不是卡片的落点）。
   */
  const resolveCardTarget = useCallback(
    (overId: string | null): CardDropTarget | null => {
      if (!overId) return null
      const session = sessionRef.current
      const batch =
        session?.kind === "card" && session.cardIds.length > 1
          ? new Set(session.cardIds)
          : null
      // 落点列表 = 这一刻渲染结构里真的还在的名片：多选拖动时整批已经移出去
      // （`draggedCardIds` 过滤渲染），单个拖动时原瓦片还在，所以 `batch` 为 null 就不摘。
      const dropLists = groups.map((group) => ({
        group,
        cards: batch
          ? group.cards.filter((card) => !batch.has(card.id))
          : group.cards,
      }))

      const dropKey = cardGroupKeyFromDropId(overId)
      if (dropKey !== null) {
        const drop = dropLists.find((entry) => entry.group.key === dropKey)
        // 末尾落点：列表里真的渲染出来的张数就是下标。
        return { groupKey: dropKey, index: drop ? drop.cards.length : 0 }
      }
      for (const { group, cards } of dropLists) {
        const index = cards.findIndex((card) => card.id === overId)
        if (index >= 0) return { groupKey: group.key, index }
      }
      return null
    },
    [groups]
  )

  /** 落点 ghost 的写入口：状态与同步快照一起更新（事件里读快照、渲染读状态）。 */
  const updatePreview = useCallback((next: CardDropPreview | null) => {
    previewRef.current = next
    setCardDropPreview(next)
  }, [])

  const clearDwellTimer = useCallback(() => {
    if (dwellTimerRef.current !== null) {
      window.clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = null
    }
  }, [])

  // 卸载（拖动中退出编辑模式、切到经典模式等）也要拆掉计时器：它只在 dragEnd/Cancel
  // 与新的一次 start 时被清，组件没了以后 1s 一到还是会对着已卸载的组件 `setState`。
  useEffect(() => clearDwellTimer, [clearDwellTimer])

  /**
   * 「停顿一下才展开」：把计时重新挂到当前指针位置上。落点候选变了、指针动了、
   * 或者还没开始计时（批次只有一张）时都要重挂/不挂。
   * 键盘拖拽没有停顿可言，调用方直接把 `expanded` 置真（见 `handleDragOver`）。
   */
  const armDwell = useCallback(
    (anchor: { x: number; y: number }, batchSize: number) => {
      clearDwellTimer()
      dwellAnchorRef.current = anchor
      if (batchSize <= 1) return
      dwellTimerRef.current = window.setTimeout(() => {
        dwellTimerRef.current = null
        const current = previewRef.current
        if (current) updatePreview({ ...current, expanded: true })
      }, CARD_DROP_GHOST_DWELL_MS)
    },
    [clearDwellTimer, updatePreview]
  )

  /**
   * 指针拖拽（批次 ≥ 2）的落点：**按指针几何实测 DOM 算**，不看 dnd-kit 的 `over`。
   *
   * 为什么不用 `over`：它比的是 dnd-kit 缓存的 droppable rects（`strategy: Always` 也只在
   * 拖拽开始与 droppable 增删时重量），而落点 ghost 一插进网格就真的改变了布局——`over`
   * 于是最多晚一拍，多选拖动的落点看着就不如单张准（2026-11-17 用户反馈）。这里改成每次
   * 指针移动都对着**当前 DOM** 实测一遍矩形：指针在哪一组的哪一行哪一列，落点就是哪儿。
   *
   * 落点候选变→立刻换 ghost 并重新计时；候选没变但指针又走了 > `GHOST_COLLAPSE_DISTANCE_PX`
   * →收起展开的 ghost 并重新计时。播报文案也在这里写好（dnd-kit 的 `onDragOver` 对这条
   * 路不再负责，见 `handleDragOver`）。
   *
   * 候选本身要过一道**死区**（`DROP_TARGET_HYSTERESIS_PX`）：指针离采纳当前候选时的位置不到
   * 12px 时，哪怕几何算出来的候选变了也不换——否则压在行端点上的指针一抖就换候选、一换布局
   * 又算回原候选，ghost 会在两行之间 60Hz 来回横跳。
   *
   * 每个指针事件都量一遍、不做额外的节流：浏览器把 `pointermove` 对齐到帧（约 60–120 次/秒），
   * 所以它天然就是「最多一帧一次」；再叠一层 rAF 节流只会把同一帧里**后面**的指针事件丢掉，
   * 让落点落后指针一帧（量 rect 的成本与 dnd-kit 自己每次移动都跑的碰撞检测同一量级）。
   *
   * 滚动（`scroll`）走同一个入口，但带 `layoutShifted`：指针没动、几何变了，死区按定义会把
   * 这次修正挡掉，所以那条路绕开它（候选真的不同才采纳，见下面的死区判定）。
   */
  const applyPointerTarget = useCallback(
    (
      pointer: { x: number; y: number },
      { layoutShifted = false }: { layoutShifted?: boolean } = {}
    ) => {
      const current = sessionRef.current
      // 只有「多选 + 指针」这条路要几何落点：单张沿用 dnd-kit 的排序位移，键盘没有指针。
      if (!current || current.kind !== "card") return
      if (current.cardIds.length <= 1 || keyboardDragRef.current) return

      // 下标必须按**整批已摘掉**的列表算（与 `CardMoveTarget.index`、`moveCards` 同口径）：
      // 激活那一次 `pointermove` 早于 React 把整批移出列表——dnd-kit 在 `document` 上先处理、
      // 建好这趟会话，我们的监听器在 `window` 上后处理，此刻 DOM 里整批瓦片还在。不在这里
      // 摘掉，下标就会多算排在落点之前的本批张数，ghost 与真正的落位差一格（正常帧里它们
      // 已经不在 DOM 中，这层过滤是恒等的）。
      const batch = new Set(current.cardIds)
      const target = resolveCardDropFromPointer({
        pointer,
        groups: readDropPointerGroups().map((group) => ({
          ...group,
          tiles: group.tiles.filter((tile) => !batch.has(tile.cardId)),
        })),
      })

      if (!target) {
        settledTargetRef.current = null
        targetAnchorRef.current = null
        messagesRef.current.over = ""
        clearDwellTimer()
        updatePreview(null)
        return
      }

      const settled = settledTargetRef.current
      const anchor = targetAnchorRef.current
      const sameTarget =
        settled?.groupKey === target.groupKey && settled?.index === target.index
      // 换分组是粗粒度、有明确意图的动作，不进死区。
      const groupChanged = settled?.groupKey !== target.groupKey
      // 滚动路径（`layoutShifted`）：指针没动、几何却变了，锚点就在指针脚下——死区按定义会
      // 把这次修正挡掉，所以绕开它。采纳之后锚点跟着更新成当前指针（见下面），后续指针自己
      // 的抖动照旧过死区，不会来回横跳。
      const movedPastDeadZone =
        layoutShifted ||
        !anchor ||
        Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) >
          DROP_TARGET_HYSTERESIS_PX

      // 死区：候选换了，但指针还在原地打转（行端点那种一两像素的抖动）→ 什么都不做，
      // ghost、播报与计时都保持原样。
      if (!sameTarget && !groupChanged && !movedPastDeadZone) return

      if (sameTarget) {
        // 候选没变：指针真的走开了才算「在找新落点」，收起展开的 ghost 并重新计时；
        // 没走开就完全无副作用（指针原地抖动不该打断 1s 的停顿计时）。
        const dwellAnchor = dwellAnchorRef.current
        if (
          !dwellAnchor ||
          Math.hypot(pointer.x - dwellAnchor.x, pointer.y - dwellAnchor.y) <=
            GHOST_COLLAPSE_DISTANCE_PX
        ) {
          return
        }
        const preview = previewRef.current
        if (preview?.expanded) updatePreview({ ...preview, expanded: false })
        armDwell(pointer, current.cardIds.length)
        return
      }

      // 采纳新候选：ghost、播报、`pointerTargetRef`（松手时按它落位）与死区锚点**一起**换，
      // 三者同源才算「ghost 插在哪儿、松手就落在哪儿」。
      settledTargetRef.current = target
      targetAnchorRef.current = pointer
      pointerTargetRef.current = target
      messagesRef.current.over = `落点『${groupTitle(target.groupKey)}』`
      updatePreview({ ...target, expanded: false })
      armDwell(pointer, current.cardIds.length)
    },
    [armDwell, clearDwellTimer, groupTitle, updatePreview]
  )

  /**
   * 指针拖拽的落点从 **`window` 的指针/鼠标移动事件**拿：那才是真实的视口指针坐标
   * （`clientX`/`clientY`，滚动了多少都不参与）。
   *
   * 两个理由不走 dnd-kit 的 `onDragMove`/`onDragOver`：
   * 1. 它们的 `delta` 是**补偿过滚动**的位移（`scrollAdjustedTranslate`）：页面自动滚动时
   *    和真实指针越差越多（滚了多少就偏多少），而落点几何要的恰恰是屏幕上的位置；
   * 2. 回调跑在传感器自己的批次里、比这个监听器还早一步（同一个移动事件里 dnd-kit 先在
   *    `document` 上处理，我们的监听器在 `window` 上），在那儿读指针永远差一个事件。
   *
   * 挂在 `enabled`（编辑模式的分组视图）而不是 `onDragStart`：dnd-kit 要等指针移动超过激活
   * 距离才回调 `onDragStart`，而**激活那一次移动的位置正是落点最需要的第一个位置**——晚挂就
   * 丢了它。两个传感器各走一条事件（桌面 `mousemove`、触屏 `pointermove`），所以两条都听，
   * 见下面 `onPointerMove` 的说明。
   *
   * `scroll` 与之同挂：滚动改的是**布局**、不是指针，指针不动时原实现没有任何东西重算落点，
   * ghost 于是停在旧几何的位置上（用户 2026-11-17「拖拽展开过程中滚动会偶发错位」）。这里用
   * 最后一次指针坐标按新几何重算一遍，`capture: true` 覆盖内部滚动容器（滚动事件不冒泡到
   * `window`），dnd-kit 的自动滚动也是真的 `scroll`，同一条路覆盖。
   */
  useEffect(() => {
    if (!enabled) return
    // 鼠标与触屏都给 `clientX/clientY`，两条事件收进同一个处理器：
    // - 桌面（`MouseSensor`）激活那一次是 `mousemove`——同一个物理移动里 `pointermove` 先到，
    //   那一刻会话还没建好（dnd-kit 在 `document` 上先处理 `mousedown` 之后才建会话），只收
    //   `pointermove` 就会把「开始拖的那一个位置」丢掉，落点 ghost 要等下一次移动才出现；
    // - 触屏（`TouchSensor`）听的是 `touchmove`，浏览器同时发 `pointermove`，走同一条。
    // 两次调用同坐标时是幂等的（候选不变、指针没离开死区就直接返回）。
    const onPointerMove = (event: MouseEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY }
      applyPointerTarget({ x: event.clientX, y: event.clientY })
    }
    // 一个滚动批次里 `scroll` 会成串到来：一帧只重解析一次（rAF 合并），指针那条路仍然逐事件。
    const onScroll = () => {
      if (scrollReparseRafRef.current !== null) return
      scrollReparseRafRef.current = window.requestAnimationFrame(() => {
        scrollReparseRafRef.current = null
        const pointer = lastPointerRef.current
        if (pointer) applyPointerTarget(pointer, { layoutShifted: true })
      })
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("mousemove", onPointerMove, { passive: true })
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    })
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("scroll", onScroll, { capture: true })
      if (scrollReparseRafRef.current !== null) {
        window.cancelAnimationFrame(scrollReparseRafRef.current)
        scrollReparseRafRef.current = null
      }
    }
  }, [applyPointerTarget, enabled])

  /** 丢掉这一趟拖拽留下的 ghost 状态（计时器、参照点、落点、展开态）。 */
  const resetDropPreview = useCallback(() => {
    clearDwellTimer()
    dwellAnchorRef.current = null
    settledTargetRef.current = null
    targetAnchorRef.current = null
    pointerTargetRef.current = null
    keyboardDragRef.current = false
    updatePreview(null)
  }, [clearDwellTimer, updatePreview])

  const endSession = useCallback(() => {
    sessionRef.current = null
    setSession(null)
    resetDropPreview()
  }, [resetDropPreview])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      messagesRef.current = { start: "", over: "", end: "", cancel: "" }
      const activeId = String(event.active.id)
      resetDropPreview()

      if (isCardGroupSortableId(activeId)) {
        const key = cardGroupKeyFromSortableId(activeId) ?? ""
        const next: DragSession = { kind: "group", cardIds: [] }
        sessionRef.current = next
        setSession(next)
        messagesRef.current.start = `已抓起分组『${groupTitle(key)}』`
        return
      }

      // 键盘拖拽的激活事件是 keydown：它没有「指针停顿」，ghost 一开始就是展开态。
      keyboardDragRef.current = event.activatorEvent.type === "keydown"
      const cardIds = dragPayload(activeId)
      const next: DragSession = { kind: "card", cardIds }
      sessionRef.current = next
      setSession(next)
      messagesRef.current.start =
        cardIds.length > 1 ? `已抓起 ${cardIds.length} 张名片` : "已抓起 1 张名片"
    },
    // 这批依赖是**行为**依赖，不是性能摆件：`dnd` 把它们原样转给 `DndContext`，
    // 少一个就会让落位闭包在旧值上（sensor 选项将来提成常量后尤其隐蔽）。
    [dragPayload, groupTitle, resetDropPreview]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const current = sessionRef.current
      if (!current) return
      const overId = event.over ? String(event.over.id) : null
      if (current.kind === "group") {
        const key = overId ? cardGroupKeyFromSortableId(overId) : null
        messagesRef.current.over = key ? `落点『${groupTitle(key)}』` : ""
        return
      }

      // 多选指针拖拽的落点、播报与停顿时序全部由 `applyPointerTarget`（`pointermove` 那条路）
      // 负责：`over` 依赖 dnd-kit 缓存的 rects，比真实指针晚（见那里的说明），再让它插一手
      // 就会把按指针算好的 ghost 与播报顶掉。
      if (!keyboardDragRef.current && current.cardIds.length > 1) return

      // 到这里只有两种：键盘拖拽（含多选）与单张拖动。它们都按 `over` 解析落点：
      // 键盘没有指针；单张的原瓦片留在列表里、让位交给 dnd-kit 的排序位移（上一轮已认可的观感）。
      const target = resolveCardTarget(overId)
      messagesRef.current.over = target
        ? `落点『${groupTitle(target.groupKey)}』`
        : ""
      if (!target || current.cardIds.length <= 1) {
        settledTargetRef.current = null
        clearDwellTimer()
        updatePreview(null)
        return
      }
      const settled = settledTargetRef.current
      if (settled?.groupKey === target.groupKey && settled.index === target.index) {
        return
      }
      settledTargetRef.current = target
      // 键盘拖拽没有「指针停顿」：落点一确定就是展开态。
      updatePreview({ ...target, expanded: true })
    },
    [clearDwellTimer, groupTitle, resolveCardTarget, updatePreview]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const current = sessionRef.current
      const overId = event.over ? String(event.over.id) : null
      if (current?.kind === "group") {
        const fromKey = cardGroupKeyFromSortableId(String(event.active.id))
        const toKey = overId ? cardGroupKeyFromSortableId(overId) : null
        if (fromKey && toKey && fromKey !== toKey) {
          onReorderCardGroups(fromKey, toKey)
          messagesRef.current.end = `已把分组『${groupTitle(fromKey)}』移动到『${groupTitle(toKey)}』`
        }
      } else if (current?.kind === "card") {
        // 多选指针拖拽落位读**最后算出来的指针落点**（与 ghost 完全同源）；键盘与单张读 `over`。
        const target =
          !keyboardDragRef.current && current.cardIds.length > 1
            ? pointerTargetRef.current
            : resolveCardTarget(overId)
        const cardNumbers = current.cardIds
          .map((cardId) => cardsById.get(cardId)?.cardNumber)
          .filter(
            (cardNumber): cardNumber is number => cardNumber !== undefined
          )
        if (target && cardNumbers.length) {
          onMoveCards(cardNumbers, target)
          messagesRef.current.end = `已把 ${cardNumbers.length} 张名片移动到『${groupTitle(target.groupKey)}』`
        }
      }
      endSession()
    },
    [
      cardsById,
      endSession,
      groupTitle,
      onMoveCards,
      onReorderCardGroups,
      resolveCardTarget,
    ]
  )

  const handleDragCancel = useCallback(() => {
    messagesRef.current.cancel = "已取消拖动"
    endSession()
  }, [endSession])

  /**
   * 桌面用 `MouseSensor`、触屏用 `TouchSensor`（设计 §11），**不用** `PointerSensor`：它也吃
   * touch，会和 `TouchSensor` 的 250ms 延迟抢激活——同一根手指刚移动 6px 就被它抢先开始拖，
   * 触屏拖拽于是退化成「一碰就走」。传感器按事件类型分（`mousedown` vs `touchstart`），
   * 不按 `pointerType` 分，所以只能这样拆。桌面手感一字未改：还是 6px 距离激活。
   */
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) =>
        isCardGroupSortableId(String(args.active))
          ? groupKeyboardCoordinates(event, args)
          : sortableKeyboardCoordinates(event, args),
    })
  )

  /**
   * 分组只能落在分组上、卡片只能落在卡片/放置区上：两类 id 前缀不同，一次过滤就够。
   * 也正因为这样，折叠分组的组头（不是卡片的落点）不会把卡片「吸」过去。
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggingGroup = isCardGroupSortableId(String(args.active.id))
    return closestCenter(args).filter(
      (collision) =>
        isCardGroupSortableId(String(collision.id)) === draggingGroup
    )
  }, [])

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: () => messagesRef.current.start,
      onDragOver: () => messagesRef.current.over,
      onDragEnd: () => messagesRef.current.end,
      onDragCancel: () => messagesRef.current.cancel,
    }),
    []
  )

  const dnd = useMemo<
    Pick<
      DndContextProps,
      | "sensors"
      | "collisionDetection"
      | "accessibility"
      | "measuring"
      | "onDragStart"
      | "onDragOver"
      | "onDragEnd"
      | "onDragCancel"
    >
  >(
    () => ({
      sensors,
      collisionDetection,
      // 还在用 `over` 的两条路（键盘拖拽、分组排序）要在 droppable 增删后重量 rects，见 `MEASURING`。
      measuring: MEASURING,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable:
            "按空格键开始拖动，方向键移动位置，再按空格键放下，按 Esc 取消。",
        },
      },
      onDragStart: handleDragStart,
      // 指针拖拽的落点不走 `onDragOver`（键盘拖拽与分组排序的落点才走它）：`onDragOver` 的回调
      // 比 `window` 的 `pointermove` 早一步，`delta` 又被滚动补偿过（见 `applyPointerTarget`）。
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
      onDragCancel: handleDragCancel,
    }),
    // 全列依赖：`dnd` 是 `DndContext` 的 props，漏掉哪一个都会让落位闭包停在旧值上
    // （事件处理器现在都是 useCallback，所以列上它们真的能挡住陈旧闭包）。
    [
      announcements,
      collisionDetection,
      handleDragCancel,
      handleDragEnd,
      handleDragOver,
      handleDragStart,
      sensors,
    ]
  )

  const activeCards = useMemo(
    () =>
      session?.cardIds
        .map((cardId) => cardsById.get(cardId))
        .filter((card): card is FudabaOwnerCard => card !== undefined) ?? [],
    [cardsById, session]
  )

  /**
   * 拖动中要**从列表里移出去**的名片：多选（批次 ≥ 2）时是整个选择集，单张时为空
   * ——单张沿用 dnd-kit 的排序位移，原瓦片留在原位压暗（上一轮已认可的观感）。
   */
  const draggedCardIds = useMemo<ReadonlySet<string>>(
    () =>
      session?.kind === "card" && session.cardIds.length > 1
        ? new Set(session.cardIds)
        : new Set(),
    [session]
  )

  return {
    dnd,
    activeCards,
    /**
     * 落点 ghost（只有批次 ≥ 2 且落点已确定时才有）：`index` 就是这批名片要插进去的位置。
     * 有它的时候卡片列表的排序位移必须关掉（见 `card-manager.tsx` 的 strategy）。
     */
    cardDropPreview,
    draggedCardIds,
  }
}
