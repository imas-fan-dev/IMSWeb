import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"

/**
 * 鼠标框选（marquee，§8）：编辑模式下在列表**空白处**按下并拖动，与矩形**相交**的可勾选瓦片
 * 进入选择集。
 *
 * 口径（2026-11-17 用户定）：
 * - 只在编辑模式、且**只对鼠标/笔**（`pointerType !== "touch"`）启用——移动端完全不启用；
 * - 框选 = **替换**当前选择；按住 `Shift` 框选 = **追加**；
 * - 只点空白、不拖动 = 清空选择（已有的行为，这里保持）；
 * - 在**瓦片**上按下仍然是「拖拽 / 勾选」（dnd-kit 的传感器挂在瓦片上），框选只在空白处启动；
 *   表单控件与按钮（组头、折叠、删除分组、标题输入）上按下也不启动；
 * - 框选期间不进入文本选择（`document.body` 的 `user-select: none`），抬手/取消后恢复；
 * - 矩形是**视口坐标**，与同一个坐标系里的瓦片矩形相交，所以页面滚动/自动滚动都不会错位。
 */
export type CardMarqueeRect = {
  left: number
  top: number
  width: number
  height: number
}

/** 起拖阈值：小于它当点击（点空白 = 清空选择）；超过才开始框选。 */
const MARQUEE_DRAG_THRESHOLD_PX = 6

/** 瓦片身份的 DOM 契约：`SortableCardTile` 的 `data-card-id`。 */
const CARD_TILE_SELECTOR = "[data-card-id]"

/** 在这些目标上按下不启动框选（瓦片自己 + 各类控件）。 */
const MARQUEE_IGNORED_SELECTOR = "button, a, input, select, textarea"

type MarqueeSession = {
  startX: number
  startY: number
  /** 按住 `Shift`：命中追加到按下那一刻的选择集上，否则整份替换。 */
  additive: boolean
  /** 按下那一刻的选择集：追加模式的底数。 */
  base: readonly string[]
  /** 是否已经超过起拖阈值（没超过的抬手 = 点击空白 = 清空选择）。 */
  dragging: boolean
}

function rectFromPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): CardMarqueeRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

function rectsIntersect(a: CardMarqueeRect, b: DOMRect): boolean {
  return (
    a.left < b.right &&
    a.left + a.width > b.left &&
    a.top < b.bottom &&
    a.top + a.height > b.top
  )
}

/** 与矩形相交、且**可勾选**的瓦片 id（DOM 顺序）。不可勾选的瓦片（非 `published`）从不入选。 */
function selectableCardIdsInRect(
  rect: CardMarqueeRect,
  isSelectableCardId: (cardId: string) => boolean
): string[] {
  const ids: string[] = []
  for (const tile of document.querySelectorAll<HTMLElement>(
    CARD_TILE_SELECTOR
  )) {
    const cardId = tile.dataset.cardId
    if (!cardId || !isSelectableCardId(cardId)) continue
    if (!rectsIntersect(rect, tile.getBoundingClientRect())) continue
    ids.push(cardId)
  }
  return ids
}

/** 两个 id 列表是不是同一份集合（顺序无关）：集合没变就不再写状态。 */
function sameCardIdSet(
  ids: readonly string[],
  current: ReadonlySet<string>
): boolean {
  return ids.length === current.size && ids.every((id) => current.has(id))
}

function disableTextSelection() {
  if (typeof document === "undefined") return
  document.body.style.userSelect = "none"
}

function restoreTextSelection() {
  if (typeof document === "undefined") return
  document.body.style.userSelect = ""
}

export function useCardMarquee({
  enabled,
  isSelectableCardId,
  selectedCardIds,
  onSelectionChange,
}: {
  /** 只在编辑模式打开（点「编辑模式」会先切回分组视图，所以经典模式里不会有会话）。 */
  enabled: boolean
  /** 可勾选资格（`isCardSelectable`）：只有它认的卡能进选择集。 */
  isSelectableCardId: (cardId: string) => boolean
  /** 当前生效的选择集：用来跳过「这次框选结果与现状相同」的写入。 */
  selectedCardIds: ReadonlySet<string>
  /** 框选落地：整份给出新的选择集（替换或追加都已在这里算好）。 */
  onSelectionChange: (cardIds: readonly string[]) => void
}) {
  const [rect, setRect] = useState<CardMarqueeRect | null>(null)
  const sessionRef = useRef<MarqueeSession | null>(null)
  /**
   * 事件处理器挂在 `window` 上、只挂一次，闭包里的 props 会过期；这份 ref 由 effect 在每次
   * 渲染提交后更新（不能在 render 里写 ref），处理器只读它。
   */
  const stateRef = useRef({ isSelectableCardId, selectedCardIds, onSelectionChange })
  useEffect(() => {
    stateRef.current = { isSelectableCardId, selectedCardIds, onSelectionChange }
  }, [isSelectableCardId, selectedCardIds, onSelectionChange])

  /** 结束一次会话：恢复文本选择、收起矩形；`clearSelection` 用于「点空白」那一次抬手。 */
  const endSession = useCallback((clearSelection: boolean) => {
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    restoreTextSelection()
    setRect(null)
    if (clearSelection && !session.dragging) {
      stateRef.current.onSelectionChange([])
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      // 移动端完全不启用：触屏长按是「进编辑 / 开始拖拽」，与框选天然冲突。
      if (event.pointerType === "touch") return
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      // 瓦片上按下留给 dnd-kit（拖拽）与瓦片自己的勾选。
      if (target.closest(CARD_TILE_SELECTOR)) return
      // 组头、折叠、删除分组、标题输入这些控件上按下也不该启动框选。
      if (target.closest(MARQUEE_IGNORED_SELECTOR)) return
      sessionRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        additive: event.shiftKey,
        base: [...stateRef.current.selectedCardIds],
        dragging: false,
      }
    },
    [enabled]
  )

  useEffect(() => {
    if (!enabled) return

    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session) return
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY
      if (!session.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < MARQUEE_DRAG_THRESHOLD_PX) {
          return
        }
        session.dragging = true
        disableTextSelection()
      }
      // 框选期间不要让浏览器顺手选中页面文字（或把拖动当成文本拖拽）。
      event.preventDefault()
      const next = rectFromPoints(
        session.startX,
        session.startY,
        event.clientX,
        event.clientY
      )
      setRect(next)
      const hits = selectableCardIdsInRect(next, stateRef.current.isSelectableCardId)
      const selection = session.additive
        ? [...new Set([...session.base, ...hits])]
        : hits
      if (sameCardIdSet(selection, stateRef.current.selectedCardIds)) return
      stateRef.current.onSelectionChange(selection)
    }

    const handlePointerUp = () => endSession(true)
    // 取消（例如系统手势抢走指针）不算「点空白」：不清理选择集，只收摊。
    const handlePointerCancel = () => endSession(false)

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      // 会话被卸载（退出编辑、切模式）：矩形与文本选择都不该留在页面上。
      sessionRef.current = null
      restoreTextSelection()
      setRect(null)
    }
  }, [enabled, endSession])

  return { rect, onPointerDown: handlePointerDown }
}
