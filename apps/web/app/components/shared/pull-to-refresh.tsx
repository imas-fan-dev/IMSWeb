import { ArrowDownIcon, CheckIcon, LoaderCircleIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  usePullToRefresh,
  type PullToRefreshStatus,
} from "~/lib/use-pull-to-refresh"
import { cn } from "~/lib/utils"

const STATUS_LABEL: Record<PullToRefreshStatus, string> = {
  idle: "下拉刷新",
  pulling: "下拉刷新",
  armed: "松开立即刷新",
  refreshing: "正在刷新",
  settling: "已是最新",
}

/**
 * Wraps a scrolling list in a touch pull-to-refresh gesture.
 *
 * `children` moves with a transform rather than sitting below a spacer that
 * grows. Transforms are not layout, so a `useWindowVirtualizer` inside keeps a
 * usable `scrollMargin` while the band is open.
 *
 * The status pill is positioned against the band instead of the viewport,
 * which is the only anchor that works in both shells. Anchoring to the
 * viewport put the pill in the header's own strip, and no z-index could rescue
 * it: both layouts wrap the page in a `z-10` stacking context, so a `z-50`
 * claimed in here is still resolved below the `z-40` app title bar and site
 * header.
 *
 * The band's top edge needs no such knowledge. Both shells keep scrolling
 * content in normal flow under a sticky header, and the gesture only starts at
 * `scrollY === 0`, so that edge already sits just below the header. Parking the
 * pill above it lets the pill emerge from under the header as the band opens,
 * carried by the band's own transform rather than a second one here.
 */
export function PullToRefresh({
  onRefresh,
  enabled = true,
  children,
}: {
  onRefresh: () => void | Promise<void>
  /** Off while the page has no loaded list to pull on. */
  enabled?: boolean
  children: ReactNode
}) {
  const { status, distance, progress, dragging } = usePullToRefresh({
    onRefresh,
    enabled,
  })

  return (
    <div
      className={cn(
        "relative",
        !dragging && "transition-transform duration-300 ease-out",
        "motion-reduce:transition-none"
      )}
      style={{ transform: `translateY(${distance}px)` }}
    >
      {status === "idle" ? null : (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3.5 py-2 text-xs font-medium whitespace-nowrap shadow-lg backdrop-blur-sm"
        >
          {status === "refreshing" ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin text-primary motion-reduce:animate-none"
            />
          ) : status === "settling" ? (
            <CheckIcon aria-hidden="true" className="size-4 text-success" />
          ) : (
            <ArrowDownIcon
              aria-hidden="true"
              className="size-4 text-primary transition-transform duration-150 motion-reduce:transition-none"
              style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
            />
          )}
          <span>{STATUS_LABEL[status]}</span>
        </div>
      )}

      {children}
    </div>
  )
}
