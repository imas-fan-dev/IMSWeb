import { InfoIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

/**
 * 复选框旁的说明收进 tooltip：界面只留一个信息图标，展开后才念解释。
 *
 * 触发器是带 `tabIndex` 的 span，不是按钮——它只解释文案，不执行动作，
 * 所以不抢 tab 顺序里的按钮语义，键盘聚焦时同样弹出。
 */
export function FilterHint({
  label,
  children,
  className,
}: {
  label: string
  children: string
  className?: string
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              tabIndex={0}
              aria-label={`${label}说明：${children}`}
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                className
              )}
            />
          }
        >
          <InfoIcon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
