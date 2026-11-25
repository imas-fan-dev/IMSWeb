import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { Button } from "~/components/ui/button"
import { NativeTabBarSuppression } from "~/components/ui/native-tab-bar-suppression"
import { cn } from "~/lib/utils"
import { XIcon } from "lucide-react"

const DialogOpenContext = React.createContext<boolean | undefined>(undefined)

function Dialog({ open, ...props }: DialogPrimitive.Root.Props) {
  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />
    </DialogOpenContext.Provider>
  )
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  safeArea = "inset",
  layout = "scroll",
  tabBarBehavior = "hide",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  overlayClassName?: string
  safeArea?: "custom" | "inset" | "viewport"
  layout?: "scroll" | "pinned"
  tabBarBehavior?: "hide" | "block-interaction"
}) {
  // 打开时把子树拍个快照；关闭时调用方往往先清空数据，退场期间继续渲染快照，
  // 不再出现「先空白再消失」。快照只在 open 翻转时更新，不随每次 render 变化。
  const open = React.useContext(DialogOpenContext)
  const [snapshot, setSnapshot] = React.useState<React.ReactNode>(children)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== undefined && open !== wasOpen) {
    setWasOpen(open)
    if (open) setSnapshot(children)
  }
  const content = open === false ? snapshot : children
  return (
    <DialogPortal>
      <NativeTabBarSuppression behavior={tabBarBehavior} />
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-safe-area={safeArea}
        data-layout={layout}
        className={cn(
          "glass-surface glass-panel fixed z-50 grid gap-4 rounded-xl p-4 text-sm text-popover-foreground duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          // `safeArea="inset"` owns its own size: the geometry is repeated
          // after `className` (and `cn` is `twMerge(clsx(...))`), so a caller
          // `max-h-*` / `w-*` never wins. Callers must not pass those.
          safeArea === "inset" &&
            cn(
              "top-1/2 left-1/2 max-h-(--overlay-safe-height) w-(--overlay-safe-width) max-w-full -translate-1/2",
              // Scrolling depends on the layout, not on tailwind-merge
              // resolving `overflow` against `overflow-y`.
              layout === "scroll" && "overflow-y-auto overscroll-contain",
              "sm:max-w-sm"
            ),
          className,
          safeArea === "inset"
            ? cn(
                "top-1/2 left-1/2 max-h-(--overlay-safe-height) w-(--overlay-safe-width) -translate-1/2",
                layout === "pinned" && "flex flex-col overflow-hidden"
              )
            : safeArea === "viewport"
              ? "inset-0 h-dvh max-h-none w-screen max-w-none translate-0"
              : undefined
        )}
        {...props}
      >
        {content}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 max-sm:size-11"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        // `pb-px`：按钮的按下反馈是 `active:translate-y-px`（见 button.tsx），那 1px 会算进这个
        // 滚动容器的可滚动溢出。内容刚好铺满时（弹窗高度由内容决定），按住按钮就会多出 1px
        // 溢出、Chrome 当场画一道滚动条。留 1px 余量正好吃掉它，视觉上不可见。
        "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-px",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/40 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
