import { LoaderCircleIcon, Trash2Icon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"

export interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  submitting: boolean
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
  variant?: "destructive" | "default"
  icon?: LucideIcon
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  submitting,
  onConfirm,
  confirmLabel = "确认删除",
  cancelLabel = "取消",
  variant = "destructive",
  icon: Icon = Trash2Icon,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent aria-busy={submitting}>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant={variant}
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : (
              <Icon data-icon="inline-start" />
            )}
            {submitting ? "正在处理" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
