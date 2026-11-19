import { ScanLineIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"

const SCAN_PLACEHOLDER_TITLE = "扫码"
const SCAN_PLACEHOLDER_DESCRIPTION = "扫描对方的扫码交换二维码。"
const SCAN_PLACEHOLDER_HINT = "扫码将在下一片接入"

/**
 * 扫码入口的占位面板：本片只接通按钮与弹层，下一片换成 Tauri 扫码插件。
 * 桌面 / 窄屏外壳与其他交换弹层同一套断点。
 */
export function ScanPlaceholderDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const desktop = useDesktopAccountWorkspace()
  const body = (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <ScanLineIcon aria-hidden="true" className="size-10 text-primary" />
      <p className="text-sm font-medium">{SCAN_PLACEHOLDER_HINT}</p>
      <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
        知道了
      </Button>
    </div>
  )

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent layout="pinned" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{SCAN_PLACEHOLDER_TITLE}</DialogTitle>
            <DialogDescription>{SCAN_PLACEHOLDER_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <DialogBody>{body}</DialogBody>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{SCAN_PLACEHOLDER_TITLE}</SheetTitle>
          <SheetDescription>{SCAN_PLACEHOLDER_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
