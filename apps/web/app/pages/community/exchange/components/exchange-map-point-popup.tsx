import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { XIcon } from "lucide-react"
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { Button } from "~/components/ui/button"
import { Popover, PopoverTitle } from "~/components/ui/popover"
import { cn } from "~/lib/utils"

interface MarkerAnchor {
  key: string
  element: HTMLElement
  contextElement: HTMLElement
  getBoundingClientRect: () => DOMRect
  boundary: { x: number; y: number; width: number; height: number }
}

/** Follow the SDK's actual marker, including its projection and world wrapping. */
function useMarkerAnchor(
  map: RefObject<HTMLElement | null>,
  groupKey: string | null,
  paused: boolean
) {
  const [anchor, setAnchor] = useState<MarkerAnchor | null>(null)
  useLayoutEffect(() => {
    const surface = map.current
    if (!surface || !groupKey || paused) return
    let frame = 0
    let marker: HTMLElement | undefined
    let previous = ""
    const update = () => {
      if (!marker?.isConnected) {
        previous = ""
        marker = Array.from(
          surface.querySelectorAll<HTMLElement>("[data-map-office-group]")
        ).find((element) => element.dataset.mapOfficeGroup === groupKey)
      }
      if (marker) {
        const element = marker
        const rect = element.getBoundingClientRect()
        const bounds = surface.getBoundingClientRect()
        const dock = surface
          .querySelector(".exchange-web-search-dock")
          ?.getBoundingClientRect()
        // Reserve the retained search dock and the provider's legal notice.
        const top =
          dock && dock.top < bounds.top + bounds.height / 2
            ? Math.max(bounds.top + 12, dock.bottom + 12)
            : bounds.top + 12
        const bottom =
          dock && dock.top >= bounds.top + bounds.height / 2
            ? Math.min(bounds.bottom - 56, dock.top - 12)
            : bounds.bottom - 56
        const boundary = {
          x: bounds.left + 12,
          y: top,
          width: Math.max(0, bounds.width - 24),
          height: Math.max(0, bottom - top),
        }
        const signature = JSON.stringify([
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          boundary,
        ])
        if (signature !== previous) {
          previous = signature
          setAnchor({
            key: groupKey,
            element,
            contextElement: element,
            getBoundingClientRect: () => rect,
            boundary,
          })
        }
      } else if (previous !== "missing") {
        previous = "missing"
        setAnchor(null)
      }
      frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [map, groupKey, paused])
  return anchor
}

export function ExchangeMapPointPopup({
  map,
  groupKey,
  focusRequest,
  covered = false,
  onClose,
  children,
}: {
  map: RefObject<HTMLElement | null>
  groupKey: string | null
  focusRequest?: number
  covered?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const anchor = useMarkerAnchor(map, groupKey, covered)
  const title = useRef<HTMLHeadingElement>(null)
  const focusedRequest = useRef<number | undefined>(undefined)
  const restoreFocus = useRef(false)
  const [retainedContent, setRetainedContent] = useState(children)
  if (groupKey && retainedContent !== children) setRetainedContent(children)
  useLayoutEffect(() => {
    const surface = map.current
    if (!surface || !groupKey) return
    // Keep this pinned nonmodal window readable while focus is on the map.
    // Capture at the map surface, before FloatingPortal's focus-out listener
    // can remove every popup descendant from the tab order.
    const keepReadable = (event: FocusEvent) => {
      const popup = title.current?.closest(".exchange-map-point-popup")
      if (
        popup &&
        event.target instanceof Node &&
        popup.contains(event.target) &&
        event.relatedTarget instanceof Node &&
        !popup.contains(event.relatedTarget)
      )
        event.stopPropagation()
    }
    surface.addEventListener("focusout", keepReadable, true)
    return () => surface.removeEventListener("focusout", keepReadable, true)
  }, [map, groupKey])
  useLayoutEffect(() => {
    if (groupKey) {
      restoreFocus.current = false
    }
  }, [groupKey, children])
  useLayoutEffect(() => {
    const surface = map.current
    if (
      !surface ||
      !groupKey ||
      covered ||
      focusRequest === undefined ||
      focusedRequest.current === focusRequest
    )
      return
    let frame = 0
    const owner = surface.ownerDocument
    const retire = () => {
      cancelAnimationFrame(frame)
      focusedRequest.current = focusRequest
      owner.removeEventListener("pointerdown", retire, true)
      owner.removeEventListener("keydown", retire, true)
      owner.removeEventListener("wheel", retire, true)
    }
    const focus = () => {
      const element = title.current
      if (
        element?.getClientRects().length &&
        getComputedStyle(element).visibility === "visible"
      ) {
        element.focus({ preventScroll: true })
        if (document.activeElement === element) {
          retire()
          return
        }
      }
      frame = requestAnimationFrame(focus)
    }
    // Re-selecting a point from the list keeps the popup mounted. Restore a
    // useful focus once its camera command exposes it, unless the user acts.
    owner.addEventListener("pointerdown", retire, true)
    owner.addEventListener("keydown", retire, true)
    owner.addEventListener("wheel", retire, { capture: true, passive: true })
    frame = requestAnimationFrame(focus)
    return retire
  }, [map, groupKey, focusRequest, covered])

  return (
    <Popover
      modal={false}
      open={Boolean(groupKey && anchor?.key === groupKey)}
      onOpenChange={(open, details) => {
        // Panning, zooming and typing in the map must keep the point selected.
        if (
          covered ||
          details.reason === "outside-press" ||
          details.reason === "focus-out"
        ) {
          details.cancel()
          return
        }
        if (!open) {
          restoreFocus.current = true
          onClose()
        }
      }}
    >
      <PopoverPrimitive.Portal container={map}>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          side="top"
          sideOffset={12}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          collisionBoundary={anchor?.boundary}
          collisionPadding={0}
          className={cn(
            "z-20 max-w-(--available-width) data-anchor-hidden:invisible",
            covered && "pointer-events-none invisible"
          )}
          inert={covered}
        >
          <PopoverPrimitive.Popup
            className="exchange-map-point-popup glass-surface glass-panel flex max-h-[min(27rem,var(--available-height))] w-84 max-w-(--available-width) flex-col rounded-lg text-sm text-popover-foreground outline-none"
            aria-hidden={covered || undefined}
            inert={covered}
            initialFocus={() => (covered ? false : title.current)}
            finalFocus={() => {
              if (!restoreFocus.current) return false
              const marker = anchor?.element.isConnected
                ? anchor.element
                : Array.from(
                    map.current?.querySelectorAll<HTMLElement>(
                      "[data-map-office-group]"
                    ) ?? []
                  ).find(
                    (element) => element.dataset.mapOfficeGroup === anchor?.key
                  )
              return (
                marker ??
                map.current?.querySelector<HTMLButtonElement>(
                  'button[aria-label="范围内事务所列表"]'
                ) ??
                false
              )
            }}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b py-1 pr-1 pl-4">
              <PopoverTitle ref={title} tabIndex={-1} className="outline-none">
                事务所详情
              </PopoverTitle>
              <PopoverPrimitive.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="size-11 shrink-0"
                    aria-label="关闭事务所详情"
                  />
                }
              >
                <XIcon aria-hidden="true" />
              </PopoverPrimitive.Close>
            </header>
            <div
              role="region"
              aria-label="点位事务所资料"
              tabIndex={0}
              className="min-h-0 overflow-y-auto overscroll-contain p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_a]:min-h-11"
            >
              {groupKey ? children : retainedContent}
            </div>
            <PopoverPrimitive.Arrow
              data-map-point-arrow
              className="size-3 rotate-45 border-r border-b bg-popover data-[side=bottom]:-top-1.5 data-[side=bottom]:rotate-225 data-[side=left]:-right-1.5 data-[side=left]:-rotate-45 data-[side=right]:-left-1.5 data-[side=right]:rotate-135 data-[side=top]:-bottom-1.5"
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  )
}
