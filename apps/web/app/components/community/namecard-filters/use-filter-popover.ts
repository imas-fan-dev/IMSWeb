import { useEffect, useRef, useState } from "react"
import type { FocusEvent, KeyboardEvent } from "react"

/**
 * 目标是否仍属于这个输入框浮层：自身（输入框、徽标、面板、企划/分类下拉）或
 * 任意已挂载的 base-ui 浮层。浮层选择器必须算「内部」，否则点选下拉时会被
 * 当成点到外部而先收起候选面板。
 */
function isInsidePopover(
  root: HTMLElement | null,
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) return false
  return (
    root?.contains(target) === true ||
    target.closest("[data-base-ui-portal]") !== null
  )
}

/**
 * 筛选输入框的浮层开关：聚焦打开，点到外部 / Esc / 焦点离开收起。
 *
 * 输入法组词期间不判断；`compositionend` 之后再看焦点落在哪，避免拼音候选
 * 阶段把面板收起。
 */
export function useFilterPopover() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const composing = useRef(false)

  useEffect(() => {
    if (!open) return
    function closeOnOutsidePointer(event: PointerEvent) {
      if (composing.current) return
      if (isInsidePopover(rootRef.current, event.target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [open])

  function closeOnBlur(next: EventTarget | null) {
    if (composing.current) return
    // 指针点击统一交给 pointerdown：relatedTarget 为空时先不动，免得点面板里的
    // 标签/下拉时提前收起。键盘 Tab 走这里（relatedTarget 是下一个焦点元素）。
    if (next === null) return
    if (isInsidePopover(rootRef.current, next)) return
    setOpen(false)
  }

  return {
    open,
    setOpen,
    rootRef,
    rootProps: {
      onBlur: (event: FocusEvent<HTMLDivElement>) =>
        closeOnBlur(event.relatedTarget),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape" || !open) return
        event.stopPropagation()
        setOpen(false)
      },
      onCompositionStart: () => {
        composing.current = true
      },
      onCompositionEnd: () => {
        composing.current = false
        if (!isInsidePopover(rootRef.current, document.activeElement)) {
          setOpen(false)
        }
      },
    },
  }
}
