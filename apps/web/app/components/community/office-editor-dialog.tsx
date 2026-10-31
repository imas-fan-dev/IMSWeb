import type { ReactNode } from "react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"

/** The owner workspace and moderation share the same form/dialog surface. */
export function OfficeEditorDialog({
  open,
  embedded = false,
  busy = false,
  onClose,
  title,
  children,
  footer,
  description = "位置使用精确坐标。任何资料修改后均须整体重新审核，审核通过前不公开。",
  bodyKey,
}: {
  open: boolean
  embedded?: boolean
  busy?: boolean
  onClose(): void
  title: string
  children: ReactNode
  footer?: ReactNode
  description?: string
  bodyKey?: string
}) {
  if (embedded)
    return open ? (
      <div>
        {children}
        <Button variant="outline" disabled={busy} onClick={onClose}>
          返回清单
        </Button>
      </div>
    ) : null
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose()
      }}
    >
      <DialogContent layout="pinned" className="gap-0 bg-background sm:max-w-3xl">
        <DialogHeader className="pr-8 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody key={bodyKey} className="border-t py-5">
          {children}
        </DialogBody>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
