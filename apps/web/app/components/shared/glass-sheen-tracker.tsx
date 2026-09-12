import { useEffect } from "react"

const INTERACTIVE_SURFACE_SELECTOR = "[data-glass-interactive]"
const PRESS_TARGET_SELECTOR = ".glass-control, .glass-tab"
const SHEEN_TARGET_SELECTOR = ".glass-sheen, .glass-control"

const POINTER_STYLE_PROPERTIES = [
  "--glass-pointer-x",
  "--glass-pointer-y",
] as const

const PRESS_STYLE_PROPERTIES = [
  "--glass-press-offset-x",
  "--glass-press-offset-y",
  "--glass-press-origin-x",
  "--glass-press-origin-y",
  "--glass-press-scale-x",
  "--glass-press-scale-y",
] as const

type GlassPress = {
  host: HTMLElement
  lastX: number
  lastY: number
  pointerId: number | null
  startX: number
  startY: number
  target: HTMLElement
}

type PointerCoordinates = {
  clientX: number
  clientY: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function isDisabled(target: HTMLElement) {
  return (
    target.getAttribute("aria-disabled") === "true" ||
    (target instanceof HTMLButtonElement && target.disabled)
  )
}

function exitPoint(
  target: HTMLElement,
  from: PointerCoordinates,
  to: PointerCoordinates
): PointerCoordinates | null {
  const bounds = target.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) return null

  const outside =
    to.clientX < bounds.left ||
    to.clientX > bounds.right ||
    to.clientY < bounds.top ||
    to.clientY > bounds.bottom
  if (!outside) return null

  const deltaX = to.clientX - from.clientX
  const deltaY = to.clientY - from.clientY
  const crossings: PointerCoordinates[] = []

  const addCrossing = (progress: number) => {
    if (progress < 0 || progress > 1) return
    const clientX = from.clientX + deltaX * progress
    const clientY = from.clientY + deltaY * progress
    const tolerance = 0.01
    if (
      clientX < bounds.left - tolerance ||
      clientX > bounds.right + tolerance ||
      clientY < bounds.top - tolerance ||
      clientY > bounds.bottom + tolerance
    )
      return
    crossings.push({ clientX, clientY })
  }

  if (deltaX < 0) addCrossing((bounds.left - from.clientX) / deltaX)
  if (deltaX > 0) addCrossing((bounds.right - from.clientX) / deltaX)
  if (deltaY < 0) addCrossing((bounds.top - from.clientY) / deltaY)
  if (deltaY > 0) addCrossing((bounds.bottom - from.clientY) / deltaY)

  if (crossings.length > 0) {
    return crossings.reduce((nearest, crossing) => {
      const nearestDistance = Math.hypot(
        nearest.clientX - from.clientX,
        nearest.clientY - from.clientY
      )
      const crossingDistance = Math.hypot(
        crossing.clientX - from.clientX,
        crossing.clientY - from.clientY
      )
      return crossingDistance < nearestDistance ? crossing : nearest
    })
  }

  return {
    clientX: clamp(to.clientX, bounds.left, bounds.right),
    clientY: clamp(to.clientY, bounds.top, bounds.bottom),
  }
}

/**
 * Feeds glass surfaces the pointer position and press deformation that their
 * specular highlight and transform read from.
 *
 * One delegated listener on the document rather than a listener per surface:
 * glass is used on bars, dialogs and cards at the same time, and per-element
 * handlers turn into hundreds of subscriptions on list-heavy pages. Pointer
 * movement is coalesced into one animation frame, and press feedback only
 * writes custom properties consumed by compositor-friendly transforms.
 *
 * Hover sheen only follows fine pointers. Press and drag also work with touch,
 * unless the user asked for reduced motion.
 */
export function GlassSheenTracker() {
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)")
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    let frame = 0
    let pending: {
      clientX: number
      clientY: number
      hoverTarget: HTMLElement | null
    } | null = null
    let active: HTMLElement | null = null
    let press: GlassPress | null = null

    const setPointerPosition = (
      target: HTMLElement,
      clientX: number,
      clientY: number
    ) => {
      const bounds = target.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return null

      const x = clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100)
      const y = clamp(((clientY - bounds.top) / bounds.height) * 100, 0, 100)
      target.style.setProperty("--glass-pointer-x", `${x}%`)
      target.style.setProperty("--glass-pointer-y", `${y}%`)
      return { bounds, x, y }
    }

    const clearPointerStyles = (target: HTMLElement) => {
      for (const property of POINTER_STYLE_PROPERTIES) {
        target.style.removeProperty(property)
      }
    }

    const clearPressStyles = (target: HTMLElement) => {
      for (const property of PRESS_STYLE_PROPERTIES) {
        target.style.removeProperty(property)
      }
    }

    const updatePress = (clientX: number, clientY: number) => {
      if (!press) return

      const hostPoint = setPointerPosition(press.host, clientX, clientY)
      const targetPoint =
        press.host === press.target
          ? hostPoint
          : setPointerPosition(press.target, clientX, clientY)
      if (!targetPoint) return

      const { bounds, x, y } = targetPoint
      const deltaX = clientX - press.startX
      const deltaY = clientY - press.startY
      const normalizedX = deltaX / Math.max(bounds.width, 1)
      const normalizedY = deltaY / Math.max(bounds.height, 1)
      const travel = Math.min(Math.hypot(normalizedX, normalizedY), 1)
      const stretch = travel * 0.07
      const horizontal = Math.abs(normalizedX) >= Math.abs(normalizedY)
      const edgePullX = ((x - 50) / 50) * Math.min(bounds.width * 0.025, 3)
      const edgePullY = ((y - 50) / 50) * Math.min(bounds.height * 0.035, 2)
      const offsetX = clamp(edgePullX + deltaX * 0.08, -6, 6)
      const offsetY = clamp(edgePullY + deltaY * 0.08, -4, 4)
      const scaleX = horizontal ? 0.975 + stretch : 0.975 - stretch * 0.2
      const scaleY = horizontal ? 0.94 - stretch * 0.24 : 0.94 + stretch

      press.target.style.setProperty(
        "--glass-press-offset-x",
        `${offsetX.toFixed(2)}px`
      )
      press.target.style.setProperty(
        "--glass-press-offset-y",
        `${offsetY.toFixed(2)}px`
      )
      press.target.style.setProperty("--glass-press-origin-x", `${x}%`)
      press.target.style.setProperty("--glass-press-origin-y", `${y}%`)
      press.target.style.setProperty("--glass-press-scale-x", scaleX.toFixed(4))
      press.target.style.setProperty("--glass-press-scale-y", scaleY.toFixed(4))
      press.lastX = clientX
      press.lastY = clientY
    }

    const clearActive = () => {
      if (!active) return
      active.style.removeProperty("--glass-pointer-x")
      active.style.removeProperty("--glass-pointer-y")
      active = null
    }

    const flush = () => {
      frame = 0
      if (!pending) return
      const { clientX, clientY, hoverTarget } = pending
      pending = null

      if (press) {
        updatePress(clientX, clientY)
        return
      }

      if (!hoverTarget) {
        clearActive()
        return
      }

      if (active && active !== hoverTarget) clearActive()
      active = hoverTarget
      setPointerPosition(hoverTarget, clientX, clientY)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return
      if (press && event.pointerId !== press.pointerId) return
      if (!press && !finePointer.matches) return
      if (press) {
        const boundary = exitPoint(
          press.host,
          { clientX: press.lastX, clientY: press.lastY },
          { clientX: event.clientX, clientY: event.clientY }
        )
        if (boundary) {
          updatePress(boundary.clientX, boundary.clientY)
          releasePress(true)
          return
        }
        press.lastX = event.clientX
        press.lastY = event.clientY
      }

      const hoverTarget =
        !press && event.target instanceof Element
          ? event.target.closest<HTMLElement>(SHEEN_TARGET_SELECTOR)
          : null

      pending = {
        clientX: event.clientX,
        clientY: event.clientY,
        hoverTarget,
      }

      if (frame === 0) frame = window.requestAnimationFrame(flush)
    }

    const releasePress = (cancelled = false, showExit = true) => {
      if (!press) return
      const current = press
      press = null
      pending = null

      current.target.removeAttribute("data-glass-pressed")
      current.host.removeAttribute("data-glass-pressed")

      if (cancelled) {
        current.target.removeAttribute("data-glass-releasing")
        clearPressStyles(current.target)

        if (!showExit) {
          current.host.removeAttribute("data-glass-exiting")
          current.host.removeAttribute("data-glass-releasing")
          clearPointerStyles(current.host)
          if (current.target !== current.host) {
            clearPointerStyles(current.target)
          }
          if (active === current.host) active = null
          return
        }

        current.host.setAttribute("data-glass-exiting", "")
        return
      }

      current.host.setAttribute("data-glass-releasing", "")
      current.target.setAttribute("data-glass-releasing", "")
    }

    const startPress = (
      target: HTMLElement,
      host: HTMLElement,
      clientX: number,
      clientY: number,
      pointerId: number | null
    ) => {
      releasePress(true, false)
      target.removeAttribute("data-glass-exiting")
      target.removeAttribute("data-glass-releasing")
      host.removeAttribute("data-glass-exiting")
      host.removeAttribute("data-glass-releasing")
      target.setAttribute("data-glass-pressed", "")
      host.setAttribute("data-glass-pressed", "")
      active = host
      press = {
        host,
        lastX: clientX,
        lastY: clientY,
        pointerId,
        startX: clientX,
        startY: clientY,
        target,
      }
      updatePress(clientX, clientY)
    }

    const findPressTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null
      const target = eventTarget.closest<HTMLElement>(PRESS_TARGET_SELECTOR)
      if (!target || isDisabled(target)) return null
      const host = target.matches(".glass-control")
        ? target
        : target.closest<HTMLElement>(INTERACTIVE_SURFACE_SELECTOR)
      if (!host) return null
      return { host, target }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        reducedMotion.matches ||
        event.isPrimary === false ||
        event.button > 0
      )
        return
      const match = findPressTarget(event.target)
      if (!match) return

      startPress(
        match.target,
        match.host,
        event.clientX,
        event.clientY,
        event.pointerId
      )
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return
      const boundary = exitPoint(
        press.host,
        { clientX: press.lastX, clientY: press.lastY },
        { clientX: event.clientX, clientY: event.clientY }
      )
      if (boundary) {
        updatePress(boundary.clientX, boundary.clientY)
        releasePress(true)
        return
      }
      updatePress(event.clientX, event.clientY)
      releasePress()
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return
      const boundary = exitPoint(
        press.host,
        { clientX: press.lastX, clientY: press.lastY },
        { clientX: event.clientX, clientY: event.clientY }
      )
      if (boundary) updatePress(boundary.clientX, boundary.clientY)
      releasePress(true)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        reducedMotion.matches ||
        event.repeat ||
        (event.key !== "Enter" && event.key !== " ")
      )
        return
      const match = findPressTarget(event.target)
      if (!match) return

      const bounds = match.target.getBoundingClientRect()
      startPress(
        match.target,
        match.host,
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
        null
      )
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        !press ||
        press.pointerId !== null ||
        (event.key !== "Enter" && event.key !== " ")
      )
        return
      releasePress()
    }

    const finishFeedback = (target: HTMLElement) => {
      const host = target.matches(".glass-control")
        ? target
        : target.closest<HTMLElement>(INTERACTIVE_SURFACE_SELECTOR)

      target.removeAttribute("data-glass-exiting")
      target.removeAttribute("data-glass-releasing")
      clearPressStyles(target)
      clearPointerStyles(target)

      if (host) {
        host.removeAttribute("data-glass-exiting")
        host.removeAttribute("data-glass-releasing")
        clearPointerStyles(host)
        if (active === host) active = null
      }
    }

    const handleAnimationEnd = (event: AnimationEvent) => {
      if (
        event.animationName !== "glass-control-release" &&
        event.animationName !== "glass-touch-exit"
      )
        return
      if (!(event.target instanceof HTMLElement)) return
      finishFeedback(event.target)
    }

    const handleWindowBlur = () => releasePress(true, false)

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    })
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerCancel)
    document.addEventListener("lostpointercapture", handlePointerCancel)
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("keyup", handleKeyUp)
    document.addEventListener("animationend", handleAnimationEnd)
    window.addEventListener("blur", handleWindowBlur)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
      document.removeEventListener("pointercancel", handlePointerCancel)
      document.removeEventListener("lostpointercapture", handlePointerCancel)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      document.removeEventListener("animationend", handleAnimationEnd)
      window.removeEventListener("blur", handleWindowBlur)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      pending = null
      releasePress(true, false)
      clearActive()
    }
  }, [])

  return null
}
