import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { useSafeAreaCollisionBoundary } from "~/components/ui/use-safe-area-collision-boundary"
import { IS_APP_TARGET } from "~/lib/app-target"
import {
  placeMapGuide,
  type GuideLayout,
  type GuideRect,
} from "../components/exchange-map-guide-model"

function revealTarget(target: HTMLElement) {
  for (
    let parent = target.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (
      parent.scrollHeight <= parent.clientHeight ||
      !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)
    )
      continue
    const frame = parent.getBoundingClientRect(),
      rect = target.getBoundingClientRect()
    const top = frame.top + parent.clientTop,
      bottom = top + parent.clientHeight
    const padding = Math.min(
      4,
      Math.max(0, (parent.clientHeight - rect.height) / 2)
    )
    if (rect.height > parent.clientHeight) {
      if (Math.abs(rect.top - top) > 0.5) parent.scrollTop += rect.top - top
    } else if (rect.top < top + padding - 0.5) {
      parent.scrollTop -= top + padding - rect.top
    } else if (rect.bottom > bottom - padding + 0.5) {
      parent.scrollTop += rect.bottom - bottom + padding
    }
  }
}

export function useMapGuideLayout(
  step: number | null,
  targetName: string | undefined,
  content: RefObject<HTMLDivElement | null>,
  actions: RefObject<HTMLDivElement | null>
) {
  const viewport = useSafeAreaCollisionBoundary()
  const [layout, setLayout] = useState<
    (GuideLayout & { animate: boolean; step: number }) | null
  >(null)
  if (step === null && layout !== null) setLayout(null)
  const previousStep = useRef<number | null>(null)
  const previousViewport = useRef(viewport)

  useLayoutEffect(() => {
    if (step === null || !targetName || !viewport) {
      previousStep.current = null
      return
    }
    let animate =
      previousStep.current !== null && previousViewport.current === viewport
    let frame = 0
    let observed: HTMLElement | null = null
    const measure = () => {
      frame = 0
      if (!content.current || !actions.current) return
      const target = document.querySelector<HTMLElement>(
        `[data-map-guide="${targetName}"]`
      )
      if (target !== observed) {
        if (observed) observer.unobserve(observed)
        observed = target
        if (target) {
          observer.observe(target)
        }
      }
      if (target) revealTarget(target)
      const rect = target?.getBoundingClientRect()
      const targetRect: GuideRect | null =
        rect && rect.width && rect.height
          ? {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            }
          : null
      const actionsHeight = actions.current.getBoundingClientRect().height
      const cardStyle = getComputedStyle(actions.current.parentElement!)
      const borderHeight =
        (Number.parseFloat(cardStyle.borderTopWidth) || 0) +
        (Number.parseFloat(cardStyle.borderBottomWidth) || 0)
      previousStep.current = step
      previousViewport.current = viewport
      const next = {
        step,
        ...placeMapGuide({
          viewport,
          target: targetRect,
          naturalHeight:
            content.current.getBoundingClientRect().height +
            actionsHeight +
            borderHeight,
          actionsHeight: actionsHeight + borderHeight,
          initial: step === 0,
          compact: IS_APP_TARGET || viewport.width < 1024,
        }),
        animate,
      }
      setLayout((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const resize = () => {
      animate = false
      schedule()
    }
    const observer = new ResizeObserver(schedule)
    if (content.current) observer.observe(content.current)
    if (actions.current) observer.observe(actions.current)
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    })
    schedule()
    window.addEventListener("scroll", schedule, true)
    window.addEventListener("resize", resize)
    window.addEventListener("animationend", schedule, true)
    window.addEventListener("transitionend", schedule, true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", resize)
      window.removeEventListener("animationend", schedule, true)
      window.removeEventListener("transitionend", schedule, true)
    }
  }, [step, targetName, viewport, content, actions])
  return layout
}
