import { Menu } from "@base-ui/react/menu"
import {
  Building2Icon,
  CheckIcon,
  ContactRoundIcon,
  InfoIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Button } from "~/components/ui/button"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

interface ExchangeMapToolsMenuProps {
  filterAnchorRef?: RefObject<HTMLElement | null>
  filterApplied?: boolean
  modalOpen?: boolean
  pointCount?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerRef?: RefObject<HTMLButtonElement | null>
  triggerClassName?: string
  side?: "top" | "bottom"
  onOpenFilter: () => void
  onOpenOffices: () => void
  onOpenCards: () => void
  onOpenAttribution?: (trigger: HTMLElement) => void
}

const itemClass = cn(
  "flex w-full items-center gap-3 text-sm font-medium outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
  IS_APP_TARGET
    ? "min-h-11 rounded-xl px-3 py-2.5"
    : "min-h-11 rounded-lg px-2.5 py-2 lg:min-h-10"
)

export function ExchangeMapToolsMenu({
  filterAnchorRef,
  filterApplied,
  modalOpen,
  pointCount,
  open,
  onOpenChange,
  triggerRef,
  triggerClassName,
  side = "top",
  onOpenFilter,
  onOpenOffices,
  onOpenCards,
  onOpenAttribution,
}: ExchangeMapToolsMenuProps) {
  const ownTrigger = useRef<HTMLButtonElement>(null)
  const trigger = triggerRef ?? ownTrigger
  const [localOpen, setLocalOpen] = useState(false)
  const isOpen = open ?? localOpen
  const returningFromModal = useRef(false)
  const restoreToolFocus = useRef(true)

  useEffect(() => {
    if (!returningFromModal.current || modalOpen || isOpen) return
    if (!restoreToolFocus.current) {
      returningFromModal.current = false
      return
    }
    const frame = requestAnimationFrame(() => {
      returningFromModal.current = false
      trigger.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [modalOpen, isOpen, trigger])

  useEffect(() => {
    if (!isOpen) return
    const closeHiddenTrigger = () => {
      if (trigger.current?.getClientRects().length) return
      setLocalOpen(false)
      onOpenChange?.(false)
    }
    window.addEventListener("resize", closeHiddenTrigger)
    return () => window.removeEventListener("resize", closeHiddenTrigger)
  }, [isOpen, onOpenChange, trigger])

  function openTool(action: () => void, restoreFocus = true) {
    returningFromModal.current = true
    restoreToolFocus.current = restoreFocus
    action()
  }

  return (
    <Menu.Root
      open={isOpen}
      onOpenChange={(value) => {
        setLocalOpen(value)
        onOpenChange?.(value)
      }}
    >
      <Menu.Trigger
        render={
          <Button
            ref={trigger}
            variant="secondary"
            className={cn(
              "relative size-11 shrink-0 rounded-full",
              triggerClassName
            )}
            aria-label="更多地图工具"
            aria-description={filterApplied ? "已应用筛选" : undefined}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
        {filterApplied ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary"
          />
        ) : null}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side={side}
          sideOffset={8}
          align="end"
          className="z-50"
        >
          <Menu.Popup
            aria-labelledby={undefined}
            aria-label="更多地图工具内容"
            finalFocus={(interaction) =>
              !returningFromModal.current && interaction === "keyboard"
                ? trigger.current
                : false
            }
            className={cn(
              "exchange-map-tools-menu max-h-[min(420px,calc(100dvh-24px))] w-60 max-w-[calc(100vw-24px)] overflow-y-auto border bg-popover text-popover-foreground shadow-lg outline-none",
              IS_APP_TARGET
                ? "exchange-map-app-surface rounded-3xl p-2 text-foreground"
                : "rounded-xl p-1.5"
            )}
          >
            <Menu.Item
              className={itemClass}
              aria-label={filterApplied ? "打开筛选，已应用筛选" : "打开筛选"}
              onClick={() => {
                if (filterAnchorRef) filterAnchorRef.current = trigger.current
                openTool(onOpenFilter, !filterAnchorRef)
              }}
            >
              <SlidersHorizontalIcon aria-hidden="true" />
              <span className="flex-1">筛选</span>
              {filterApplied ? <CheckIcon aria-hidden="true" /> : null}
            </Menu.Item>
            <Menu.Item
              className={itemClass}
              aria-label="打开事务所名录"
              onClick={() => openTool(onOpenOffices)}
            >
              <Building2Icon aria-hidden="true" />
              事务所
            </Menu.Item>
            <Menu.Item
              className={itemClass}
              aria-label="打开名片名录"
              onClick={() => openTool(onOpenCards)}
            >
              <ContactRoundIcon aria-hidden="true" />
              名片
            </Menu.Item>
            <div aria-hidden="true" className="mx-3 my-2 border-t" />
            <Menu.LinkItem
              render={<NavigationLink to="/account/me" />}
              className={itemClass}
            >
              <UserRoundIcon aria-hidden="true" />
              我的交换账号
            </Menu.LinkItem>
            {onOpenAttribution ? (
              <Menu.Item
                className={itemClass}
                aria-label="查看地图数据来源"
                aria-haspopup="dialog"
                onClick={() =>
                  openTool(() => {
                    if (trigger.current) onOpenAttribution(trigger.current)
                  })
                }
              >
                <InfoIcon aria-hidden="true" />
                地图来源
              </Menu.Item>
            ) : null}
            {pointCount !== undefined ? (
              <p className="mx-3 mt-2 border-t pt-3 pb-1 text-xs text-muted-foreground">
                当前范围：{pointCount} 个区域点
              </p>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
