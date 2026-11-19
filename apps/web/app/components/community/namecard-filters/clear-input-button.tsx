import { XIcon } from "lucide-react"

import { cn } from "~/lib/utils"

/**
 * 输入框尾部的清空按钮。调用方决定是否渲染（有值才出），这里只管外观。
 */
export function ClearInputButton({
  label,
  onClick,
  className,
}: {
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="清空"
      onClick={onClick}
      className={cn(
        "absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
    >
      <XIcon className="size-3.5" aria-hidden="true" />
    </button>
  )
}
