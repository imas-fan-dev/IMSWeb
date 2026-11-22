import { PlusIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { MouseEvent, ReactNode } from "react"

import { Button } from "~/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { NAMECARD_REACTIONS } from "~/lib/api"
import type { NamecardReactions } from "~/lib/api"
import { cn } from "~/lib/utils"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"

const NAMECARD_REACTION_SET = new Set<string>(NAMECARD_REACTIONS)
const NAMECARD_REACTION_ORDER = new Map<string, number>(
  NAMECARD_REACTIONS.map((emoji, index) => [emoji, index] as const)
)

export type NamecardReactionEntry = readonly [string, number]

/** 反应按次数降序；同次数时按内置表情顺序，墙与详情窗因此总是一致。 */
export function orderedNamecardReactions(
  reactions: NamecardReactions
): NamecardReactionEntry[] {
  return Object.entries(reactions)
    .filter(([emoji, count]) => count > 0 && NAMECARD_REACTION_SET.has(emoji))
    .sort(
      ([leftEmoji, leftCount], [rightEmoji, rightCount]) =>
        rightCount - leftCount ||
        (NAMECARD_REACTION_ORDER.get(leftEmoji) ?? 0) -
          (NAMECARD_REACTION_ORDER.get(rightEmoji) ?? 0)
    )
}

/** 墙瓦片与详情窗共用的反应胶囊：固定 20px 高、小圆角，不再随断点变尺寸。 */
export function NamecardReactionChip({
  entry: [emoji, count],
  disabled,
  className,
  onClick,
}: {
  entry: NamecardReactionEntry
  disabled?: boolean
  className?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-5 min-h-5 shrink-0 gap-0.5 rounded-sm border border-border bg-background px-1.5 text-[10px] tabular-nums",
        className
      )}
      disabled={disabled}
      aria-label={`${emoji}，${count} 次反应`}
      onClick={onClick}
    >
      <NamecardReactionEmoji emoji={emoji} compact />
      {count}
    </Button>
  )
}

/**
 * 一排按次数排好的反应胶囊。点击行为由调用方决定：墙的桌面端直接加一，
 * 窄屏/App 打开详情，详情窗里则切换反应。
 */
export function NamecardReactionRow({
  reactions,
  limit,
  label,
  busy = false,
  className,
  chipClassName,
  chipDisabled = false,
  onChipClick,
  children,
}: {
  reactions: NamecardReactions
  /** 只渲染次数最高的前 N 个：墙的窄屏摘要只露前三。 */
  limit?: number
  label?: string
  busy?: boolean
  className?: string
  chipClassName?: string
  chipDisabled?: boolean
  onChipClick: (
    entry: NamecardReactionEntry,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  children?: ReactNode
}) {
  const entries = orderedNamecardReactions(reactions)
  const visible = limit === undefined ? entries : entries.slice(0, limit)
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-0.5", className)}
      aria-label={label}
      aria-busy={label ? busy : undefined}
    >
      {visible.map((entry) => (
        <NamecardReactionChip
          key={entry[0]}
          entry={entry}
          className={chipClassName}
          disabled={chipDisabled}
          onClick={(event) => onChipClick(entry, event)}
        />
      ))}
      {children}
    </div>
  )
}

export function NamecardReactionPicker({
  reactions,
  busy,
  onReact,
  className,
  closeBelowMd = false,
}: {
  reactions: NamecardReactions
  busy: boolean
  onReact: (emoji: string) => Promise<boolean>
  className?: string
  closeBelowMd?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [closedByBreakpoint, setClosedByBreakpoint] = useState(false)
  useEffect(() => {
    if (!closeBelowMd || !open) return
    const desktop = window.matchMedia("(min-width: 48rem)")
    const closeOnNarrowViewport = () => {
      if (desktop.matches) return
      setClosedByBreakpoint(true)
      setOpen(false)
    }
    closeOnNarrowViewport()
    desktop.addEventListener("change", closeOnNarrowViewport)
    return () => desktop.removeEventListener("change", closeOnNarrowViewport)
  }, [closeBelowMd, open])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setClosedByBreakpoint(false)
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              // 视觉与胶囊同高；用伪元素只向上/下撑出 44px 触控热区，
              // 不把行高和外边距顶开，也不会横向盖住相邻胶囊。
              "relative size-5 min-h-5 shrink-0 rounded-sm border-0 bg-transparent text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:bg-transparent hover:text-foreground max-md:focus-visible:ring-inset dark:hover:bg-transparent",
              className
            )}
            title="添加反应"
            aria-label="添加反应"
            disabled={busy}
          />
        }
      >
        {/* 命中区保持 44px；可见的虚线块与胶囊同高、同圆角。 */}
        <span className="flex size-5 items-center justify-center rounded-sm border border-dashed border-border group-hover/button:border-solid dark:border-input [&_svg]:size-3">
          <PlusIcon aria-hidden="true" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        style={{ animation: "none" }}
        className="max-h-(--available-height) w-72 max-w-(--available-width) overflow-y-auto"
        finalFocus={
          closeBelowMd && closedByBreakpoint
            ? () => {
                const summary = triggerRef.current?.closest(
                  '[data-slot="namecard-reaction-summary"]'
                )
                const card = triggerRef.current?.closest("[data-namecard-item]")
                const buttons = [
                  ...(summary?.querySelectorAll<HTMLButtonElement>("button") ??
                    []),
                  ...(card?.querySelectorAll<HTMLButtonElement>("button") ??
                    []),
                ]
                return (
                  buttons.find(
                    (button) =>
                      !button.disabled && button.getClientRects().length > 0
                  ) ?? false
                )
              }
            : undefined
        }
      >
        <PopoverTitle className="mb-2">选择反应</PopoverTitle>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(44px,1fr))] gap-1">
          {NAMECARD_REACTIONS.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              size="icon"
              variant={reactions[emoji] ? "secondary" : "ghost"}
              className="size-11 text-base"
              disabled={busy}
              aria-label={`${emoji}，添加反应`}
              onClick={() => {
                void onReact(emoji).then((success) => {
                  if (success) setOpen(false)
                })
              }}
            >
              <NamecardReactionEmoji emoji={emoji} />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
