import { CopyIcon, DownloadIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"

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
import {
  canvasPngBlob,
  copyText,
  downloadBlob,
  drawQrCode,
  qrMatrix,
  QR_CANVAS_SIZE,
  selectText,
  shareImageFileName,
  shareLinkFor,
} from "../card-share-model"

const SHARE_TITLE = "分享名片"
const SHARE_DESCRIPTION = "扫码或把链接发给对方，就能打开你的快速交换名片。"

/**
 * 面板内容：二维码（canvas）+ 链接文本 + 复制/下载。桌面与移动两种弹层共用它，
 * 断点切换时它跟着重新挂载，二维码在新 canvas 上重画一次。
 */
function ShareCardBody({ handle }: { handle: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const linkRef = useRef<HTMLParagraphElement>(null)
  const link = useMemo(() => shareLinkFor(handle), [handle])
  const matrix = useMemo(() => qrMatrix(link), [link])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawQrCode(canvas, matrix)
  }, [matrix])

  async function copyLink() {
    if (await copyText(link)) {
      toast.success("链接已复制")
      return
    }
    // 剪贴板不可用（无权限 / 非安全上下文）时降级成选中链接文本，不弹 alert。
    const node = linkRef.current
    if (node) selectText(node)
    toast.error("复制失败，已选中链接，请按 Ctrl+C 复制")
  }

  async function downloadImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      downloadBlob(await canvasPngBlob(canvas), shareImageFileName(handle))
    } catch {
      toast.error("导出图片失败")
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={QR_CANVAS_SIZE}
        height={QR_CANVAS_SIZE}
        role="img"
        aria-label="名片交换二维码"
        className="size-56 rounded-lg border bg-white"
      />
      <p
        ref={linkRef}
        className="w-full rounded-md bg-muted px-3 py-2 text-xs break-all text-muted-foreground"
      >
        {link}
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copyLink()}
        >
          <CopyIcon data-icon="inline-start" aria-hidden="true" />
          复制链接
        </Button>
        <Button type="button" size="sm" onClick={() => void downloadImage()}>
          <DownloadIcon data-icon="inline-start" aria-hidden="true" />
          下载图片
        </Button>
      </div>
    </div>
  )
}

/**
 * 分享面板（设计 §9）：桌面用 `Dialog layout="pinned"`，窄屏用底部 `Sheet`，
 * 断点沿用账号工作区的口径（`useDesktopAccountWorkspace`，与页面本身的桌面/移动分叉同一处）。
 */
export function CardShareDialog({
  handle,
  open,
  onOpenChange,
}: {
  /** 分享链接里的 handle（公开主页地址或数字编号）。 */
  handle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const desktop = useDesktopAccountWorkspace()

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent layout="pinned">
          <DialogHeader>
            <DialogTitle>{SHARE_TITLE}</DialogTitle>
            <DialogDescription>{SHARE_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ShareCardBody handle={handle} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{SHARE_TITLE}</SheetTitle>
          <SheetDescription>{SHARE_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <ShareCardBody handle={handle} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
