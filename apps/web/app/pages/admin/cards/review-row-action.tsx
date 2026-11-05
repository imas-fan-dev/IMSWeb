import { LoaderCircleIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"

/**
 * 待审列表每行右侧的裁决按钮。
 *
 * 三个后台列表（投稿、认领/补充、信息修改）里的「通过 / 驳回」原本各写一遍，
 * 连 spinner 的判定条件都重复；这里统一图标位、加载态与无障碍名称，只保留
 * 触发哪个确认动作的差异。
 */
export function ReviewRowAction({
  label,
  icon,
  pending,
  disabled,
  variant = "default",
  onRequest,
}: {
  label: string
  icon: ReactNode
  /** 本次请求正在处理这一行。 */
  pending: boolean
  disabled: boolean
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  onRequest: (trigger: HTMLButtonElement) => void
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => onRequest(event.currentTarget)}
    >
      {pending ? (
        <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
    </Button>
  )
}
