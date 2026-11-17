import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { useCallback, useMemo, useRef, useState } from "react"

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
 * 预览用 dnd-kit 自己的排序位移：`SortableContext` 的 `rectSortingStrategy` 把瓦片挪开，
 * 空出来的位置就是**唯一**的落点占位；拖起来的原瓦片留在原位压暗、`DragOverlay` 跟着指针。
 * 多选时 `DragOverlay` 里叠成一摞（最多 3 张 + `+N`），不再另画占位块。
 * **不要往 sortable 列表里插占位子项**：2026-11-17 用户实测，额外的子项会让网格真的多出
 * 格子，与排序位移叠加后瓦片前后各空一处、列表错位甚至溢出。
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

  const sessionRef = useRef<DragSession | null>(null)
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
   * 下标直接用**渲染结构里的位置**（草稿就是按渲染结构 materialize 的，两者一致）：
   * 落到分组放置区的空白处 = 该分组末尾；落到某张卡上 = 那张卡现在的位置。
   * 折叠分组的放置区不渲染，所以它根本不在候选里（头部也不是卡片的落点）。
   */
  const resolveCardTarget = useCallback(
    (overId: string | null): CardDropTarget | null => {
      if (!overId) return null
      const dropKey = cardGroupKeyFromDropId(overId)
      if (dropKey !== null) {
        const group = groups.find((candidate) => candidate.key === dropKey)
        return { groupKey: dropKey, index: group ? group.cards.length : 0 }
      }
      for (const group of groups) {
        const index = group.cards.findIndex((card) => card.id === overId)
        if (index >= 0) return { groupKey: group.key, index }
      }
      return null
    },
    [groups]
  )

  const endSession = useCallback(() => {
    sessionRef.current = null
    setSession(null)
  }, [])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      messagesRef.current = { start: "", over: "", end: "", cancel: "" }
      const activeId = String(event.active.id)

      if (isCardGroupSortableId(activeId)) {
        const key = cardGroupKeyFromSortableId(activeId) ?? ""
        const next: DragSession = { kind: "group", cardIds: [] }
        sessionRef.current = next
        setSession(next)
        messagesRef.current.start = `已抓起分组『${groupTitle(key)}』`
        return
      }

      const cardIds = dragPayload(activeId)
      const next: DragSession = { kind: "card", cardIds }
      sessionRef.current = next
      setSession(next)
      messagesRef.current.start =
        cardIds.length > 1 ? `已抓起 ${cardIds.length} 张名片` : "已抓起 1 张名片"
    },
    // 这批依赖是**行为**依赖，不是性能摆件：`dnd` 把它们原样转给 `DndContext`，
    // 少一个就会让落位闭包在旧值上（sensor 选项将来提成常量后尤其隐蔽）。
    [dragPayload, groupTitle]
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

      // 卡片：落点只用来写播报文案，占位完全交给 dnd-kit 的排序位移。
      const target = resolveCardTarget(overId)
      messagesRef.current.over = target
        ? `落点『${groupTitle(target.groupKey)}』`
        : ""
    },
    [groupTitle, resolveCardTarget]
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
      | "onDragStart"
      | "onDragOver"
      | "onDragEnd"
      | "onDragCancel"
    >
  >(
    () => ({
      sensors,
      collisionDetection,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable:
            "按空格键开始拖动，方向键移动位置，再按空格键放下，按 Esc 取消。",
        },
      },
      onDragStart: handleDragStart,
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

  return { dnd, activeCards }
}
