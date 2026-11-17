import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useId, type ReactNode } from "react"

import { Button } from "~/components/ui/button"
import type { FudabaOwnerCard } from "~/lib/api"
import { cn } from "~/lib/utils"

/** 批量「交换模式」的三态按钮；文案沿用设计 §8。 */
const EXCHANGE_MODE_ACTIONS = [
  { mode: "auto", label: "自动确认" },
  { mode: "manual", label: "手动确认" },
  { mode: "none", label: "仅展示" },
] as const satisfies readonly {
  mode: FudabaOwnerCard["exchangeMode"]
  label: string
}[]

/**
 * 编辑模式下的批量操作区（§8）：可见性 / 交换模式 / 快速清单三个动作 + 快速交换上限计数。
 *
 * 三个动作都作用在当前选择集上（`selectedCount === 0` 时禁用）；团体名片由调用方在写入时
 * 跳过，这里只负责把「跳过了几张」讲清楚。
 *
 * 移动端（`collapsible`）默认**折叠**，由一个带 `aria-expanded` 的按钮展开——展开状态由调用方
 * 持有（每次进编辑模式回到折叠，不持久化）。桌面始终展开，不渲染那个按钮。
 */
export function CardBulkActions({
  selectedCount,
  quickCount,
  limit,
  skippedGroupCardCount,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
  onSetVisibility,
  onSetExchangeMode,
  onQuickAdd,
  onQuickRemove,
}: {
  selectedCount: number
  /** 生效后的快速清单张数。 */
  quickCount: number
  /** 布局响应里的上限；未知时只显示张数。 */
  limit: number | null
  skippedGroupCardCount: number
  /** 窄屏：整块由按钮收放（默认折叠）。 */
  collapsible?: boolean
  /** 只在 `collapsible` 时生效：当前是不是折叠着。 */
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onSetVisibility: (visible: boolean) => void
  onSetExchangeMode: (mode: FudabaOwnerCard["exchangeMode"]) => void
  onQuickAdd: () => void
  onQuickRemove: () => void
}) {
  const bodyId = useId()
  const noSelection = selectedCount === 0
  const limitSuffix = limit === null ? "" : `/${limit}`

  const body: ReactNode = (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">可见性</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={noSelection}
            onClick={() => onSetVisibility(true)}
          >
            显示
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={noSelection}
            onClick={() => onSetVisibility(false)}
          >
            隐藏
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">交换模式</span>
          {EXCHANGE_MODE_ACTIONS.map((action) => (
            <Button
              key={action.mode}
              type="button"
              size="sm"
              variant="outline"
              disabled={noSelection}
              onClick={() => onSetExchangeMode(action.mode)}
            >
              {action.label}
            </Button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">快速清单</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={noSelection}
            onClick={onQuickAdd}
          >
            加入
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={noSelection}
            onClick={onQuickRemove}
          >
            移出
          </Button>
        </div>
        {/* 已选张数在工具栏（「已选 N 张」）；这里只报快速交换上限，字号与相邻标签一致。 */}
        <span
          className={cn(
            "text-xs text-muted-foreground sm:ml-auto",
            limit !== null && quickCount > limit && "text-destructive"
          )}
          aria-label={
            limit === null
              ? `快速交换上限 ${quickCount} 张`
              : `快速交换上限 ${quickCount}/${limit} 张，上限 ${limit}`
          }
        >
          {`快速交换上限 ${quickCount}${limitSuffix}`}
        </span>
      </div>
      {skippedGroupCardCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {`已跳过 ${skippedGroupCardCount} 张团体名片：团体名片固定为自动交换且始终展示。`}
        </p>
      ) : null}
    </>
  )

  if (!collapsible) {
    return (
      <div
        data-testid="card-bulk-actions"
        className="mt-3 rounded-lg border bg-muted/30 p-3"
      >
        {body}
      </div>
    )
  }

  return (
    /*
      移动端的纵向留白比桌面紧一档（桌面那支保持 `p-3` 原样）；展开/收起走 200ms 的
      `grid-template-rows` + 透明度过渡（与仓库既有缓动一致），reduced motion 时直接切换。
      收起时内容仍在 DOM 里（过渡需要它），但 `inert` + `aria-hidden` 保证它不可聚焦、
      也不进无障碍树——`aria-expanded` 的语义照旧。
    */
    <div
      data-testid="card-bulk-actions"
      className="mt-2 rounded-lg border bg-muted/30 px-3 py-1.5"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : bodyId}
        onClick={onToggleCollapsed}
        className="flex min-h-6 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        批量操作
        {collapsed ? (
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        )}
      </button>
      <div
        id={bodyId}
        data-testid="card-bulk-actions-body"
        inert={collapsed}
        aria-hidden={collapsed || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-emphasized motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2">{body}</div>
        </div>
      </div>
    </div>
  )
}
