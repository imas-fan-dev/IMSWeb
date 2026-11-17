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
 * 编辑模式下的批量操作区（§8）：可见性 / 交换模式 / 快速清单三个动作 + 快速清单计数。
 *
 * 三个动作都作用在当前选择集上（`selectedCount === 0` 时禁用）；团体名片由调用方在写入时
 * 跳过，这里只负责把「跳过了几张」讲清楚。
 */
export function CardBulkActions({
  selectedCount,
  quickCount,
  limit,
  skippedGroupCardCount,
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
  onSetVisibility: (visible: boolean) => void
  onSetExchangeMode: (mode: FudabaOwnerCard["exchangeMode"]) => void
  onQuickAdd: () => void
  onQuickRemove: () => void
}) {
  const noSelection = selectedCount === 0
  const limitSuffix = limit === null ? "" : `/${limit}`

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
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
        {/* 已选张数在工具栏（「已选 N 张」）；这里只报快速交换清单，且把上限对象写清楚。 */}
        <span
          className={cn(
            "text-muted-foreground sm:ml-auto",
            limit !== null && quickCount > limit && "text-destructive"
          )}
          aria-label={
            limit === null
              ? `快速交换清单 ${quickCount} 张`
              : `快速交换清单 ${quickCount}/${limit} 张，上限 ${limit}`
          }
        >
          {`快速交换清单 ${quickCount}${limitSuffix}`}
        </span>
      </div>
      {skippedGroupCardCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {`已跳过 ${skippedGroupCardCount} 张团体名片：团体名片固定为自动交换且始终展示。`}
        </p>
      ) : null}
    </div>
  )
}
