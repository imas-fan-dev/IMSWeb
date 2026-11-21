import { useEffect, useRef, type RefObject } from "react"

/** 长按触发时长（设计 §7.1）：移动端长按任一瓦片进入编辑模式。 */
export const LONG_PRESS_DURATION_MS = 450

/**
 * 按住期间允许的抖动：超过它就把手势还给页面（设计 §7.1「位移 >8px 取消」）。
 *
 * 地图长按菜单（`lib/maps/map-context-events.ts`）用的是 550ms + 10px，这里刻意**不**跟着统一：
 * 那套分量是「长按弹右键菜单」的容错，这里是设计文档给「长按进编辑」写死的规格。两者语义也不
 * 一样——瓦片在编辑模式里自己还能被拖（TouchSensor 按住 250ms 就激活），所以「进编辑」必须更短、
 * 更紧，否则同一根手指会先被拖拽抢走。
 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8

/** 触发之后吞掉随后这么久的 `click`（照地图长按菜单：长按不会被当成一次点击）。 */
const CLICK_SUPPRESSION_MS = 1000

/**
 * 要吞掉的那一次 `click` 的截止时间。
 *
 * 放**模块级**、不放实例里：长按一进编辑模式，瓦片所在的子树会被重建（分组视图的
 * `SortableContext` 那一层换了容器），实例里的 ref 会跟着新实例一起归零，挂在瓦片上的监听
 * 也一起没了——只有跨实例的这份时间戳 + 新旧实例都读它的监听，才吞得掉浏览器补的那一次
 * click（不吞的话，刚默认勾上的那张瓦片会被这一下点掉）。
 *
 * 一次性：吞掉一次就清掉；新的一次按下也清掉。这样它不会牵连后面的正常点击。
 */
let swallowClickUntil = 0

/**
 * 交互控件不参与长按（与 `map-context-events` 的 `interactive` 同一套）：手势属于容器，
 * 手指落在按钮/输入框/链接上时它们自己会响应。
 */
const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role=button], [role=dialog]"

/**
 * 手势归**容器自己**所有：容器的直接子控件（瓦片的根按钮）算容器的一部分——「长按瓦片本体
 * 进编辑」正需要覆盖它；再往里的交互控件（将来的复选框、链接）就不接管了。所以容器需要保证
 * 「自己的控件」就在第一层（`SortableCardTile` 的外层节点里只有 `CardTile` 这个按钮）。
 */
function eligible(container: HTMLElement, event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  const hit = target.closest(INTERACTIVE_SELECTOR)
  return hit === null || hit === container || hit.parentElement === container
}

/**
 * 触屏 / 笔的长按手势（设计 §7.1、§11）。
 *
 * 只对**非鼠标**指针生效：桌面端本来就有工具栏的「编辑模式」按钮，鼠标按住 450ms 不该进编辑
 * 模式。触发后 `preventDefault` + `stopImmediatePropagation` 吞掉随后的 `click`（1s 内），
 * 免得同一次长按又落到瓦片的点击处理上。`pointerup`/`pointercancel`/`blur`/
 * `visibilitychange`/`wheel` 一律取消计时——页面开始滚动或窗口不再在前台时，这已经不是长按了。
 *
 * 语义照 `lib/maps/map-context-events.ts`（仓库里唯一的长按先例），阈值见上面两个常量。
 *
 * 调用方按瓦片各挂一个实例，所以「哪一张瓦片被长按了」由回调闭包自己决定（`CardManager` 用它
 * 默认勾选这张瓦片——用户 2026-11-17 追加），不需要在外面按坐标反查。
 */
export function useLongPress({
  targetRef,
  enabled,
  onLongPress,
}: {
  /** 手势归属的容器节点（瓦片的外层节点）。 */
  targetRef: RefObject<HTMLElement | null>
  /** 关掉时停掉手势本身（编辑模式里长按交给 TouchSensor 拖拽）；吞 `click` 的那条留在原地。 */
  enabled: boolean
  onLongPress: () => void
}): void {
  // 回调走 ref：调用方每帧都可能传新函数，直接进 effect 依赖会让 window 上的监听器每帧重挂。
  // 在 effect 里赋值（而不是渲染期间写 `ref.current`）——渲染期间写 ref 会被 React 的 lint 挡下，
  // 而回调只在我的定时器/事件处理器里读，晚一帧没有影响。
  const callbackRef = useRef(onLongPress)
  useEffect(() => {
    callbackRef.current = onLongPress
  })

  useEffect(() => {
    const container = targetRef.current
    if (!container) return

    // 这条监听**始终**挂着（哪怕 `enabled` 已经是 false）：长按触发后调用方会进编辑模式、
    // 这块子树可能被重建，新实例也挂同一条，读的都是模块级的那份截止时间（见 `swallowClickUntil`）。
    const click = (event: MouseEvent) => {
      if (Date.now() >= swallowClickUntil) return
      swallowClickUntil = 0
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    /**
     * 新的一次按下就作废上一趟留下的窗口。**也要在关闭状态下挂**：长按触发后瓦片就进了编辑
     * 模式（这里是 `enabled === false`），用户紧接着轻点别的瓦片时，先来的 `pointerdown`
     * 必须把窗口清掉——否则那一下正常的勾选会被上一趟长按吃掉（浏览器在长按后不一定补
     * click，窗口就会一直挂到过期）。
     */
    const disarm = () => {
      swallowClickUntil = 0
    }
    container.addEventListener("click", click, true)
    container.addEventListener("pointerdown", disarm, true)

    // 关闭时只剩上面两条：编辑模式里长按是 TouchSensor 的拖动，不归这里管。
    if (!enabled) {
      return () => {
        container.removeEventListener("click", click, true)
        container.removeEventListener("pointerdown", disarm, true)
      }
    }

    let timer: number | undefined
    let origin: { id: number; x: number; y: number } | null = null

    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      origin = null
    }
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || origin || !eligible(container, event)) {
        cancel()
        return
      }
      if (event.pointerType === "mouse" || event.button !== 0) return
      origin = { id: event.pointerId, x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        if (!origin) return
        // 注意 `cancel()` 不能清它：抬手（pointerup）就是 `cancel()`，而那之后浏览器才补 click。
        swallowClickUntil = Date.now() + CLICK_SUPPRESSION_MS
        cancel()
        callbackRef.current()
      }, LONG_PRESS_DURATION_MS)
    }
    const move = (event: PointerEvent) => {
      if (
        origin &&
        (event.pointerId !== origin.id ||
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
            LONG_PRESS_MOVE_TOLERANCE_PX)
      )
        cancel()
    }

    container.addEventListener("pointerdown", down, true)
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", cancel, true)
    window.addEventListener("pointercancel", cancel, true)
    window.addEventListener("blur", cancel)
    document.addEventListener("visibilitychange", cancel)
    container.addEventListener("wheel", cancel, { passive: true })
    return () => {
      cancel()
      container.removeEventListener("click", click, true)
      container.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", cancel, true)
      window.removeEventListener("pointercancel", cancel, true)
      window.removeEventListener("blur", cancel)
      document.removeEventListener("visibilitychange", cancel)
      container.removeEventListener("wheel", cancel)
    }
  }, [enabled, targetRef])
}
