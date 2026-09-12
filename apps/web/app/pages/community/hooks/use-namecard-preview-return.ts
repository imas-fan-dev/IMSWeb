import { useLayoutEffect, useRef } from "react"

type ReturnTarget = {
  trigger: HTMLButtonElement
  containers: { element: HTMLElement; top: number; left: number }[]
  top: number
  left: number
}

export function useNamecardPreviewReturn(listContext: string) {
  const fallbackRef = useRef<HTMLElement | null>(null)
  const targetRef = useRef<ReturnTarget | null>(null)
  const pendingRef = useRef<ReturnTarget | null>(null)

  useLayoutEffect(() => {
    return () => {
      targetRef.current = null
      pendingRef.current = null
    }
  }, [listContext])

  function remember(trigger: HTMLButtonElement) {
    const containers: ReturnTarget["containers"] = []
    for (
      let element = trigger.parentElement;
      element;
      element = element.parentElement
    ) {
      containers.push({
        element,
        top: element.scrollTop,
        left: element.scrollLeft,
      })
    }
    pendingRef.current = null
    targetRef.current = {
      trigger,
      containers,
      top: window.scrollY,
      left: window.scrollX,
    }
  }

  function prepareRestore() {
    pendingRef.current = targetRef.current
    targetRef.current = null
  }

  function restore() {
    const target = pendingRef.current
    if (!target) return
    // Wait for the dialog focus trap and document scroll lock to be released.
    window.requestAnimationFrame(() => {
      if (pendingRef.current !== target) return
      pendingRef.current = null
      const focusTarget = target.trigger.isConnected
        ? target.trigger
        : fallbackRef.current
      focusTarget?.focus({ preventScroll: true })
      for (const { element, top, left } of target.containers) {
        if (!element.isConnected) continue
        element.scrollTo({ top, left, behavior: "instant" })
      }
      window.scrollTo({
        top: target.top,
        left: target.left,
        behavior: "instant",
      })
    })
  }

  return { fallbackRef, remember, prepareRestore, restore }
}
