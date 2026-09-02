import { OrbitIcon, XIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import type { WikiPublicAgency } from "~/lib/api"
import { APP_FLOATING_CONTROL_OFFSET, IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import { safeWikiColor } from "~/pages/wiki/wiki-model"

import "./wiki-agency-dial.css"

interface WikiAgencyDialProps {
  agencies: WikiPublicAgency[]
  selectedAgency: string | null
  disabled?: boolean
  visibilityClassName?: string
  /**
   * Which wiki shell hosts the dial, named to match `WikiMobileSearch`. Only
   * `modern` renders inside a layout, so only it has an app tab bar to clear;
   * `/wiki/classic` is a standalone route with no chrome underneath it.
   */
  view: "classic" | "modern"
  onSelectAgency: (agency: string) => void
}

interface DragState {
  pointerId: number
  lastX: number
  lastTimestamp: number
  totalMovement: number
  velocity: number
}

const CAROUSEL_CENTER_ANGLE = 45
const CAROUSEL_SLOT_ANGLE = 37
const CAROUSEL_ORBIT_RADIUS = "clamp(6.8rem, 36vw, 8.6rem)"
const CAROUSEL_ORBIT_DIAMETER = "clamp(13.6rem, 72vw, 17.2rem)"
const CAROUSEL_DRAG_SENSITIVITY = 1 / 68
const CAROUSEL_INERTIA_FRICTION = 0.0075
const CAROUSEL_MAX_VELOCITY = 0.022
const CAROUSEL_MIN_VELOCITY = 0.00035
const CAROUSEL_RELEASE_IDLE_MS = 80
const CAROUSEL_WINDOW_RADIUS = 4
const CAROUSEL_WINDOW_MIN_ANGLE = -38
const CAROUSEL_WINDOW_MAX_ANGLE = 129

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getVisibleAgencies(
  agencies: WikiPublicAgency[],
  selectedIndex: number,
  carouselPosition: number
) {
  const previewVirtualSlot = Math.round(carouselPosition)
  const candidates = []

  for (
    let offset = -CAROUSEL_WINDOW_RADIUS;
    offset <= CAROUSEL_WINDOW_RADIUS;
    offset += 1
  ) {
    const virtualSlot = previewVirtualSlot + offset
    const angle =
      CAROUSEL_CENTER_ANGLE +
      (virtualSlot - carouselPosition) * CAROUSEL_SLOT_ANGLE
    if (
      angle < CAROUSEL_WINDOW_MIN_ANGLE ||
      angle > CAROUSEL_WINDOW_MAX_ANGLE
    ) {
      continue
    }

    candidates.push({
      relativeIndex: offset,
      virtualSlot,
      index: modulo(selectedIndex + virtualSlot, agencies.length),
    })
  }

  candidates.sort((left, right) => {
    const distanceDifference =
      Math.abs(left.virtualSlot - carouselPosition) -
      Math.abs(right.virtualSlot - carouselPosition)
    return distanceDifference || left.virtualSlot - right.virtualSlot
  })

  const seenAgencyIndexes = new Set<number>()
  const visibleAgencies = candidates.filter(({ index }) => {
    if (seenAgencyIndexes.has(index)) return false
    seenAgencyIndexes.add(index)
    return true
  })
  visibleAgencies.sort((left, right) => left.virtualSlot - right.virtualSlot)

  return visibleAgencies.map((item) => ({
    ...item,
    agency: agencies[item.index],
  }))
}

export function WikiAgencyDial(props: WikiAgencyDialProps) {
  if (props.agencies.length < 2) return null
  return <InteractiveWikiAgencyDial {...props} />
}

function InteractiveWikiAgencyDial({
  agencies,
  selectedAgency,
  disabled = false,
  visibilityClassName = "md:hidden",
  onSelectAgency,
  view,
}: WikiAgencyDialProps) {
  // Anchor the App trigger and lower-left dial from the native tab bar clearance.
  // `IS_APP_TARGET` is inlined by Vite, so the web bundle drops this branch.
  const clearsAppTabBar = IS_APP_TARGET && view === "modern"
  const selectedIndex = Math.max(
    0,
    agencies.findIndex((agency) => agency.name === selectedAgency)
  )
  const selectedAgencyName = agencies[selectedIndex]?.name ?? null
  const [open, setOpen] = useState(false)
  const [carouselPosition, setCarouselPosition] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [inertiaActive, setInertiaActive] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const dialRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const positionRef = useRef(carouselPosition)
  const pendingPositionRef = useRef(carouselPosition)
  const frameRef = useRef<number | null>(null)
  const inertiaFrameRef = useRef<number | null>(null)
  const suppressOptionClickRef = useRef(false)
  const previewVirtualSlot = Math.round(carouselPosition)
  const displayedPreviewIndex = modulo(
    selectedIndex + previewVirtualSlot,
    agencies.length
  )
  const previewAgency = agencies[displayedPreviewIndex] ?? agencies[0]
  const accent = safeWikiColor(previewAgency.color)
  const visibleAgencies = getVisibleAgencies(
    agencies,
    selectedIndex,
    carouselPosition
  )

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (inertiaFrameRef.current !== null) {
        cancelAnimationFrame(inertiaFrameRef.current)
      }
    },
    []
  )

  function updateCarouselPosition(nextPosition: number) {
    positionRef.current = nextPosition
    pendingPositionRef.current = nextPosition
    setCarouselPosition(nextPosition)
  }

  function scheduleCarouselPosition(nextPosition: number) {
    positionRef.current = nextPosition
    pendingPositionRef.current = nextPosition
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      setCarouselPosition(pendingPositionRef.current)
      frameRef.current = null
    })
  }

  function cancelInertia() {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current)
      inertiaFrameRef.current = null
    }
    setInertiaActive(false)
  }

  function startInertia(initialVelocity: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let velocity = clamp(
      initialVelocity,
      -CAROUSEL_MAX_VELOCITY,
      CAROUSEL_MAX_VELOCITY
    )
    let previousTimestamp: number | null = null
    setInertiaActive(true)

    const advance = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp
        inertiaFrameRef.current = requestAnimationFrame(advance)
        return
      }
      const elapsed = Math.min(32, timestamp - previousTimestamp)
      previousTimestamp = timestamp
      updateCarouselPosition(positionRef.current + velocity * elapsed)
      velocity *= Math.exp(-CAROUSEL_INERTIA_FRICTION * elapsed)

      if (Math.abs(velocity) <= CAROUSEL_MIN_VELOCITY) {
        inertiaFrameRef.current = null
        setInertiaActive(false)
        return
      }
      inertiaFrameRef.current = requestAnimationFrame(advance)
    }

    inertiaFrameRef.current = requestAnimationFrame(advance)
  }

  function changeOpen(nextOpen: boolean) {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    cancelInertia()
    setDragging(false)
    setHasInteracted(false)
    dragRef.current = null
    updateCarouselPosition(0)
    setOpen(nextOpen)
  }

  function previewAgencyAt(index: number) {
    cancelInertia()
    setHasInteracted(true)
    const currentVirtualSlot = Math.round(positionRef.current)
    const currentAgencyIndex = modulo(
      selectedIndex + currentVirtualSlot,
      agencies.length
    )
    const targetAgencyIndex = modulo(index, agencies.length)
    let agencyDelta = targetAgencyIndex - currentAgencyIndex
    if (agencyDelta > agencies.length / 2) agencyDelta -= agencies.length
    if (agencyDelta < -agencies.length / 2) agencyDelta += agencies.length
    updateCarouselPosition(currentVirtualSlot + agencyDelta)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return
    if (
      (event.target as HTMLElement).closest(
        "[data-wiki-agency-dial-center], [data-slot='dialog-close']"
      )
    ) {
      return
    }

    cancelInertia()
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      totalMovement: 0,
      velocity: 0,
    }
    setHasInteracted(true)
    setDragging(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    const deltaX = event.clientX - drag.lastX
    const elapsed = Math.max(8, event.timeStamp - drag.lastTimestamp)
    const positionDelta = -deltaX * CAROUSEL_DRAG_SENSITIVITY
    const instantVelocity = positionDelta / elapsed
    const nextTotalMovement = drag.totalMovement + Math.abs(deltaX)
    if (drag.totalMovement < 6 && nextTotalMovement >= 6) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    drag.velocity = drag.velocity * 0.55 + instantVelocity * 0.45
    drag.lastX = event.clientX
    drag.lastTimestamp = event.timeStamp
    drag.totalMovement = nextTotalMovement
    scheduleCarouselPosition(positionRef.current + positionDelta)
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      setCarouselPosition(positionRef.current)
    }

    const moved = drag.totalMovement >= 6
    const releaseVelocity =
      event.timeStamp - drag.lastTimestamp > CAROUSEL_RELEASE_IDLE_MS
        ? 0
        : drag.velocity
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    if (moved) {
      suppressOptionClickRef.current = true
      window.setTimeout(() => {
        suppressOptionClickRef.current = false
      }, 0)
    }

    if (
      event.type === "pointerup" &&
      Math.abs(releaseVelocity) > CAROUSEL_MIN_VELOCITY
    ) {
      startInertia(releaseVelocity)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const previousKeys = new Set(["ArrowLeft", "ArrowUp"])
    const nextKeys = new Set(["ArrowRight", "ArrowDown"])
    if (previousKeys.has(event.key)) {
      event.preventDefault()
      previewAgencyAt(displayedPreviewIndex - 1)
    } else if (nextKeys.has(event.key)) {
      event.preventDefault()
      previewAgencyAt(displayedPreviewIndex + 1)
    } else if (event.key === "Home") {
      event.preventDefault()
      previewAgencyAt(0)
    } else if (event.key === "End") {
      event.preventDefault()
      previewAgencyAt(agencies.length - 1)
    }
  }

  function confirmSelection() {
    onSelectAgency(previewAgency.name)
    changeOpen(false)
  }

  function selectAgencyAt(index: number) {
    if (suppressOptionClickRef.current) return
    const agency = agencies[index]
    if (!agency) return
    onSelectAgency(agency.name)
    changeOpen(false)
  }

  const triggerAgency = agencies[selectedIndex] ?? agencies[0]
  const triggerAccent = safeWikiColor(triggerAgency.color)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 size-14 rounded-full bg-background/95 shadow-lg backdrop-blur-md transition-[opacity,transform,box-shadow] duration-200 aria-expanded:scale-75 aria-expanded:opacity-0 motion-reduce:transition-none",
              clearsAppTabBar && APP_FLOATING_CONTROL_OFFSET,
              visibilityClassName
            )}
            style={{
              borderColor: triggerAccent,
              color: triggerAccent,
              boxShadow: `0 8px 24px color-mix(in srgb, ${triggerAccent} 22%, transparent)`,
            }}
            disabled={disabled}
            data-wiki-agency-dial-trigger
            aria-label="打开企划拨盘"
            title="切换企划"
          />
        }
      >
        {triggerAgency.iconUrl ? (
          <WikiTransformedImage
            src={triggerAgency.iconUrl}
            alt=""
            draggable={false}
            transform={triggerAgency.imageTransform}
            className="size-9 bg-transparent p-1"
          />
        ) : (
          <OrbitIcon className="size-5" aria-hidden="true" />
        )}
      </DialogTrigger>

      <DialogContent
        initialFocus={dialRef}
        showCloseButton={false}
        safeArea="custom"
        overlayClassName="bg-black/30 backdrop-blur-[2px] duration-300 motion-reduce:duration-0"
        className={cn(
          "top-auto right-auto block w-auto max-w-none rounded-full bg-transparent p-0 shadow-none ring-0 duration-300 motion-reduce:duration-0 sm:max-w-none",
          clearsAppTabBar
            ? "bottom-[calc(var(--app-bottom-clearance)+1rem)] left-11 -translate-x-1/2 translate-y-1/2"
            : "bottom-[calc(2.75rem+env(safe-area-inset-bottom))] left-11 -translate-x-1/2 translate-y-1/2",
          visibilityClassName
        )}
        data-wiki-agency-dial-popup
      >
        <DialogTitle className="sr-only">选择企划</DialogTitle>
        <div
          ref={dialRef}
          role="group"
          aria-label="企划拨盘"
          aria-roledescription="无限滚动拨盘"
          tabIndex={0}
          data-testid="wiki-agency-dial"
          data-wiki-agency-dial-interacted={hasInteracted || undefined}
          data-wiki-agency-dial-dragging={dragging || undefined}
          data-wiki-agency-dial-inertia={inertiaActive || undefined}
          data-wiki-agency-dial-position={carouselPosition.toFixed(3)}
          className="relative aspect-square cursor-grab touch-none overflow-visible rounded-full border border-foreground/15 bg-background/96 shadow-2xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          style={{
            width: clearsAppTabBar
              ? "min(calc(var(--safe-viewport-width) - 2rem), calc(var(--app-viewport-height) - var(--app-bottom-clearance) - 2rem), 22rem)"
              : "min(92vw, calc(100dvh - 6rem), 22rem)",
            borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
            boxShadow: `0 22px 60px color-mix(in srgb, ${accent} 24%, rgb(0 0 0 / 0.28))`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
        >
          <div
            data-wiki-agency-dial-orbit
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 rounded-full border border-dashed border-foreground/14"
            style={{
              width: CAROUSEL_ORBIT_DIAMETER,
              height: CAROUSEL_ORBIT_DIAMETER,
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-[28%] rounded-full border border-foreground/10 bg-muted/25"
            aria-hidden="true"
          />
          <svg
            data-wiki-agency-dial-direction
            className="wiki-agency-dial-direction"
            viewBox="0 0 120 120"
            style={{
              color: `color-mix(in srgb, ${triggerAccent} 58%, transparent)`,
            }}
            aria-hidden="true"
          >
            <path
              className="wiki-agency-dial-direction-arc"
              d="M 60 16 A 44 44 0 0 1 104 60"
            />
            <path
              className="wiki-agency-dial-direction-head"
              d="M 66 11 L 60 16 L 66 21"
            />
            <path
              className="wiki-agency-dial-direction-head"
              d="M 99 54 L 104 60 L 109 54"
            />
          </svg>

          <div
            data-testid="wiki-agency-carousel-window"
            className="absolute inset-0"
          >
            {visibleAgencies.map(
              ({ agency, index, relativeIndex, virtualSlot }, slotIndex) => {
                const angle =
                  CAROUSEL_CENTER_ANGLE +
                  (virtualSlot - carouselPosition) * CAROUSEL_SLOT_ANGLE
                const isSelected = agency.name === selectedAgencyName
                const isPreview = relativeIndex === 0
                const agencyAccent = safeWikiColor(agency.color)
                return (
                  <div
                    key={virtualSlot}
                    className="absolute top-1/2 left-1/2 size-0 will-change-transform"
                    data-wiki-agency-dial-item
                    data-wiki-agency-carousel-slot={relativeIndex}
                    data-wiki-agency-carousel-virtual-slot={virtualSlot}
                    style={
                      {
                        "--wiki-dial-angle": `${angle}deg`,
                        "--wiki-dial-delay": `${110 + slotIndex * 52}ms`,
                        transform: `rotate(${angle}deg) translateY(calc(-1 * ${CAROUSEL_ORBIT_RADIUS}))`,
                      } as CSSProperties
                    }
                  >
                    <div
                      className="will-change-transform"
                      style={{ transform: `rotate(${-angle}deg)` }}
                    >
                      <button
                        type="button"
                        aria-label={`预览企划 ${agency.name}`}
                        aria-pressed={isSelected}
                        data-wiki-agency-selected={isSelected || undefined}
                        data-wiki-agency-preview={isPreview || undefined}
                        className="absolute flex size-12 items-center justify-center overflow-hidden rounded-full border-2 bg-background p-1 shadow-md transition-[transform,border-color,box-shadow] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                        style={{
                          borderColor: isSelected
                            ? agencyAccent
                            : "transparent",
                          color: agencyAccent,
                          transform: `translate(-50%, -50%) scale(${isSelected ? 1.1 : 1})`,
                          boxShadow: isSelected
                            ? `0 0 0 3px color-mix(in srgb, ${agencyAccent} 18%, transparent), 0 8px 18px rgb(0 0 0 / 0.16)`
                            : "0 5px 14px rgb(0 0 0 / 0.12)",
                        }}
                        onClick={() => selectAgencyAt(index)}
                      >
                        {agency.iconUrl ? (
                          <WikiTransformedImage
                            src={agency.iconUrl}
                            alt=""
                            draggable={false}
                            transform={agency.imageTransform}
                            className="size-full bg-transparent object-contain"
                          />
                        ) : (
                          <span className="text-[10px] leading-none font-bold">
                            {agency.code.toUpperCase()}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )
              }
            )}
          </div>

          <button
            type="button"
            aria-label={`切换到${previewAgency.name}`}
            data-wiki-agency-dial-center
            className="absolute top-1/2 left-1/2 z-10 flex size-12 -translate-1/2 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-background/95 p-1 shadow-lg backdrop-blur-md transition-[box-shadow,scale] duration-300 outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none"
            style={{
              color: accent,
              boxShadow: "0 8px 24px rgb(0 0 0 / 0.14)",
            }}
            onClick={confirmSelection}
          >
            {previewAgency.iconUrl ? (
              <WikiTransformedImage
                src={previewAgency.iconUrl}
                alt=""
                draggable={false}
                transform={previewAgency.imageTransform}
                className="size-8 bg-transparent object-contain p-1"
              />
            ) : (
              <OrbitIcon
                className="size-5"
                style={{ color: accent }}
                aria-hidden="true"
              />
            )}
          </button>

          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="absolute top-3 right-3 z-30 rounded-full bg-background shadow-md"
                aria-label="关闭企划拨盘"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
