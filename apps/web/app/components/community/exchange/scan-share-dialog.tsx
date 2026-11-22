import { CheckCircle2Icon, RotateCcwIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

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
import { namecardDateTimeLabel } from "~/lib/namecards/dates"
import {
  drawQrCode,
  qrMatrix,
  QR_CANVAS_SIZE,
  scanShareLinkFor,
} from "~/pages/account/me/namecards/card-share-model"

import { useRetainedValue } from "~/lib/use-retained-value"
import { useScanShare } from "./use-scan-share"

const SCAN_SHARE_TITLE = "扫码交换"
const SCAN_SHARE_DESCRIPTION = "让对方扫码，收下你选中的名片。"
/** 一次性 + 有效期：二维码上方最醒目的一行。 */
const SCAN_SHARE_WAITING_TITLE = "此二维码仅可交换一次"
const SCAN_SHARE_WAITING_DESCRIPTION =
  "请让对方在 App 里打开【名片交换】，选择【扫码】扫描这个二维码。"

/**
 * 出示侧扫码交换面板：二维码内容是 `/exchange/scan/<token>` 站点链接，轮询到对方提交后给成功提示。
 *
 * 内容只在 `open` 为真时挂载：关闭即卸载，回到选卡窗口再进就是一次全新的会话。
 */
function ScanShareBody({
  cardNumbers: incomingCardNumbers,
  onClose,
}: {
  cardNumbers: readonly number[]
  onClose: () => void
}) {
  const cardNumbers = useRetainedValue(incomingCardNumbers) ?? []
  const share = useScanShare({ cardNumbers })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 二维码内容是站点链接：任何扫码器都能看出这是什么、属于哪个站点。
  const link = useMemo(
    () => (share.token ? scanShareLinkFor(share.token) : null),
    [share.token]
  )
  const matrix = useMemo(() => (link ? qrMatrix(link) : null), [link])
  const expiresLabel = namecardDateTimeLabel(share.expiresAt)
  const waitingTitle = expiresLabel
    ? `${SCAN_SHARE_WAITING_TITLE}，有效期至 ${expiresLabel}`
    : SCAN_SHARE_WAITING_TITLE

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && matrix) drawQrCode(canvas, matrix)
  }, [matrix])

  if (share.phase === "creating") {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        正在生成二维码…
      </p>
    )
  }

  if (share.phase === "committed") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2Icon
          aria-hidden="true"
          className="size-10 text-primary"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium">交换完成，名片已放进你的名片册</p>
          <p className="text-xs text-muted-foreground">对方也收下了你选中的名片。</p>
        </div>
        <Button type="button" className="w-full" onClick={onClose}>
          完成
        </Button>
      </div>
    )
  }

  if (share.phase === "expired" || share.phase === "error") {
    const message =
      share.phase === "expired"
        ? "二维码已过期，请重新生成。"
        : (share.errorMessage ?? "二维码生成失败，请重试。")
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" onClick={share.retry}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          重新生成
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={QR_CANVAS_SIZE}
        height={QR_CANVAS_SIZE}
        role="img"
        aria-label="扫码交换二维码"
        className="size-56 rounded-lg border bg-white"
      />
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-warning">{waitingTitle}</p>
        <p className="text-xs text-muted-foreground">
          {SCAN_SHARE_WAITING_DESCRIPTION}
        </p>
      </div>
    </div>
  )
}

/**
 * 桌面用 `Dialog layout="pinned"`、窄屏用底部 `Sheet`，断点与账号工作区一致
 * （`useDesktopAccountWorkspace`）；两种外壳共用同一份内容。
 */
export function ScanShareDialog({
  open,
  onOpenChange,
  cardNumbers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardNumbers: readonly number[]
}) {
  const desktop = useDesktopAccountWorkspace()
  const close = () => onOpenChange(false)
  const body = open ? (
    <ScanShareBody cardNumbers={cardNumbers} onClose={close} />
  ) : null

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent layout="pinned">
          <DialogHeader>
            <DialogTitle>{SCAN_SHARE_TITLE}</DialogTitle>
            <DialogDescription>{SCAN_SHARE_DESCRIPTION}</DialogDescription>
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
          <SheetTitle>{SCAN_SHARE_TITLE}</SheetTitle>
          <SheetDescription>{SCAN_SHARE_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
