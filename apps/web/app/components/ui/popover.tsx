import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { useSafeAreaCollisionBoundary } from "~/components/ui/use-safe-area-collision-boundary"
import { cn } from "~/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const collisionBoundary = useSafeAreaCollisionBoundary()

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        collisionBoundary={collisionBoundary}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50 max-w-(--available-width)"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "glass-surface glass-panel origin-(--transform-origin) rounded-lg p-3 text-sm text-popover-foreground duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  )
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger }
