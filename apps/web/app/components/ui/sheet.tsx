import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { NativeTabBarSuppression } from "~/components/ui/native-tab-bar-suppression"
import { cn } from "~/lib/utils"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  showDragHandle = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  showDragHandle?: boolean
}) {
  const { t } = useTranslation()
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  // 拖拽到阈值后借 Base UI 的 Close 收尾，才能沿用它的退场动画与 onOpenChange 语义。
  const closeRef = React.useRef<HTMLButtonElement | null>(null)
  const dragState = React.useRef<{ startY: number; pointerId: number } | null>(
    null
  )

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragState.current = { startY: event.clientY, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    const popup = popupRef.current
    if (!state || !popup || state.pointerId !== event.pointerId) return
    const offset = Math.max(0, event.clientY - state.startY)
    popup.style.transition = "none"
    popup.style.translate = `0 ${offset}px`
  }
  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    const popup = popupRef.current
    dragState.current = null
    if (!state || !popup || state.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    const offset = Math.max(0, event.clientY - state.startY)
    if (offset > 96) {
      popup.style.transition = "translate 180ms ease-out"
      popup.style.translate = `0 ${offset + 80}px`
      closeRef.current?.click()
      return
    }
    popup.style.transition = "translate 260ms cubic-bezier(0.22, 1, 0.36, 1)"
    popup.style.translate = "0 0"
    window.setTimeout(() => {
      const element = popupRef.current
      if (!element) return
      element.style.transition = ""
      element.style.translate = ""
    }, 280)
  }

  return (
    <SheetPortal>
      <NativeTabBarSuppression />
      <SheetOverlay />
      <SheetPrimitive.Popup
        ref={popupRef}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "glass-surface glass-panel fixed z-50 flex max-h-(--safe-viewport-height) flex-col gap-4 bg-clip-padding text-sm text-popover-foreground transition duration-200 ease-emphasized data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:right-(--safe-area-right) data-[side=bottom]:bottom-0 data-[side=bottom]:left-(--safe-area-left) data-[side=bottom]:h-auto data-[side=bottom]:rounded-t-[1.75rem] data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10 data-[side=left]:top-(--safe-area-top) data-[side=left]:bottom-(--safe-area-bottom) data-[side=left]:left-(--safe-area-left) data-[side=left]:h-auto data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:-translate-x-10 data-[side=left]:data-starting-style:-translate-x-10 data-[side=right]:top-(--safe-area-top) data-[side=right]:right-(--safe-area-right) data-[side=right]:bottom-(--safe-area-bottom) data-[side=right]:h-auto data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-10 data-[side=right]:data-starting-style:translate-x-10 data-[side=top]:top-(--safe-area-top) data-[side=top]:right-(--safe-area-right) data-[side=top]:left-(--safe-area-left) data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:-translate-y-10 data-[side=top]:data-starting-style:-translate-y-10 data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {side === "bottom" && showDragHandle ? (
          <div
            data-slot="sheet-drag-handle"
            aria-hidden="true"
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <span className="h-1.5 w-11 rounded-full bg-foreground/20" />
          </div>
        ) : null}
        <SheetPrimitive.Close
          ref={closeRef}
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
        />
        {children}
        {side === "bottom" ? (
          <div
            aria-hidden="true"
            data-slot="sheet-bottom-safe-area"
            className="h-(--safe-area-bottom) shrink-0"
          />
        ) : null}
        {showCloseButton && side !== "bottom" && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{t("actions.close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
