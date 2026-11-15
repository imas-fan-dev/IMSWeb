import type { ReactNode } from "react"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"

export interface ActionConfirmDialogProps {
  /** `useConfirmAction` 的返回值，直接展开成底层对话框的 props。 */
  action: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: ReactNode
    submitting: boolean
    confirmAction: () => Promise<void>
  }
  confirmLabel: string
  variant?: "default" | "destructive"
}

/**
 * 后台队列里 `useConfirmAction` + `ConfirmActionDialog` 的固定组合：
 * 7 处调用只差一个确认按钮文案和样式，其余样板都在这里展开。
 */
export function ActionConfirmDialog({
  action,
  confirmLabel,
  variant = "default",
}: ActionConfirmDialogProps) {
  return (
    <ConfirmActionDialog
      open={action.open}
      onOpenChange={action.onOpenChange}
      title={action.title}
      description={action.description}
      submitting={action.submitting}
      onConfirm={() => void action.confirmAction()}
      confirmLabel={confirmLabel}
      variant={variant}
    />
  )
}
