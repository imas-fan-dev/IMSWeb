import {
  closestCenter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
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
  type CardMoveTarget,
  type DraftCardGroup,
} from "../card-manager-model"

/** 指针移动多远才算「真的在拖」（与 tier-list 的 6px 一致）：再小就当点击/勾选。 */
const POINTER_ACTIVATION_DISTANCE_PX = 6

/** 落点候选稳定这么久之后，合集 ghost 展开成 N 个缩略图 ghost（设计原值，§7.3）。 */
const CARD_DROP_GHOST_DWELL_MS = 180

/**
 * 展开之后再移动超过这么多像素，就当作「用户在找新的落点」：立刻收起回合集 ghost
 * 并重新开始 180ms 计时（用户 2026-11-17 定：原来的 12px 太容易误触）。
 */
const GHOST_COLLAPSE_DISTANCE_PX = 16

/** 拖动中每 100ms 重测一次落点 rect（`frequency` 给数字才真的会定时重测，见下）。 */
const MEASURING_REFRESH_MS = 100

/**
 * 落点 rect 必须常驻重测：拖动中的落点 ghost 会改变布局（网格里真的多出格子），而 dnd-kit
 * 默认在拖拽开始那一刻把 droppable 的 rect 缓存住（`WhileDragging`）。缓存与真实 DOM 失配时
 * `over` 会指到错位的容器上，ghost 与真正的落位就对不上了（2026-11-17 实测）。
 *
 * `strategy: Always` 只管「拖拽之外也量」——它只改掉 `isDisabled()`；光有它还不够：
 * `frequency` 默认 `'optimized'`，拖动中**不会**按位移重测，只在 droppable 增删时量一次。
 * 而 ghost 展开只挪瓦片位置、不增删 droppable，瓦片 rect 于是还是拖拽开始那一刻的值，
 * `over` 可能差一格。所以频率要给一个**数字**：dnd-kit 才会按它定时重测
 * （`useDroppableMeasuring` 里 `typeof frequency === 'number'` 才挂那个计时器）。
 */
const MEASURING: MeasuringConfiguration = {
  droppable: {
    strategy: MeasuringStrategy.Always,
    frequency: MEASURING_REFRESH_MS,
  },
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
 *    超过 3 张时右下角报总张数），落点稳定 180ms 后展开成 N 个缩略图 ghost，真实预览
 *    插入后的排版；指针再动超过 `GHOST_COLLAPSE_DISTANCE_PX`（16px）或落点候选变了就
 *    收起回合集 ghost；
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
  selectedCardIds,
  onMoveCards,
  onReorderCardGroups,
}: {
  cards: readonly FudabaOwnerCard[]
  /** 编辑模式渲染用的草稿分组结构（含默认分组）。 */
  groups: readonly DraftCardGroup[]
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
  /** 由 `onDragMove` 记下的累计位移：候选变化时要把计时重新挂到当前指针位置上。 */
  const dragDeltaRef = useRef({ x: 0, y: 0 })
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
  // 与新的一次 start 时被清，组件没了以后 180ms 一到还是会对着已卸载的组件 `setState`。
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

  /** 丢掉这一趟拖拽留下的 ghost 状态（计时器、参照点、落点、展开态）。 */
  const resetDropPreview = useCallback(() => {
    clearDwellTimer()
    dwellAnchorRef.current = null
    settledTargetRef.current = null
    dragDeltaRef.current = { x: 0, y: 0 }
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

      const target = resolveCardTarget(overId)
      messagesRef.current.over = target
        ? `落点『${groupTitle(target.groupKey)}』`
        : ""
      // 单张拖动沿用 dnd-kit 的排序位移（上一轮已认可的观感），不插 ghost。
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
      updatePreview({
        ...target,
        expanded: keyboardDragRef.current,
      })
      if (!keyboardDragRef.current) {
        armDwell(dragDeltaRef.current, current.cardIds.length)
      }
    },
    [armDwell, clearDwellTimer, groupTitle, resolveCardTarget, updatePreview]
  )

  /**
   * 指针一动（超过 `GHOST_COLLAPSE_DISTANCE_PX`）就当用户在找新落点：收起合集 ghost，
   * 并把 180ms 的计时重新挂到当前位置上。键盘拖拽没有停顿概念，整段跳过。
   */
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      dragDeltaRef.current = event.delta
      const current = sessionRef.current
      if (!current || current.kind !== "card") return
      if (keyboardDragRef.current || current.cardIds.length <= 1) return
      const anchor = dwellAnchorRef.current
      if (!anchor) return
      if (
        Math.hypot(event.delta.x - anchor.x, event.delta.y - anchor.y) <=
        GHOST_COLLAPSE_DISTANCE_PX
      ) {
        return
      }
      const preview = previewRef.current
      if (preview?.expanded) updatePreview({ ...preview, expanded: false })
      armDwell(event.delta, current.cardIds.length)
    },
    [armDwell, updatePreview]
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
        const target = resolveCardTarget(overId)
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE_PX },
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
      | "onDragMove"
      | "onDragOver"
      | "onDragEnd"
      | "onDragCancel"
    >
  >(
    () => ({
      sensors,
      collisionDetection,
      // 落点 ghost 会改布局，rect 必须常驻重测（见 `MEASURING`）。
      measuring: MEASURING,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable:
            "按空格键开始拖动，方向键移动位置，再按空格键放下，按 Esc 取消。",
        },
      },
      onDragStart: handleDragStart,
      onDragMove: handleDragMove,
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
      handleDragMove,
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
