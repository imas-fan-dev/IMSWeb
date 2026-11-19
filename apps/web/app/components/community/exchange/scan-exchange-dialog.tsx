import {
  CheckCircle2Icon,
  CloudOffIcon,
  RotateCcwIcon,
  ScanLineIcon,
} from "lucide-react"

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
import { SCAN_EXCHANGE_QUEUED_MESSAGE } from "~/lib/namecards/scan-exchange-queue"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"
import {
  SCAN_FAILED_MESSAGE,
  SCAN_RUNTIME_UNSUPPORTED_MESSAGE,
} from "~/lib/scan/mobile-scan"

import { EXCHANGE_COMPLETED_MESSAGE } from "./use-exchange-submit"
import { useScanExchange } from "./use-scan-exchange"

const SCAN_TITLE = "扫码"
const SCAN_DESCRIPTION = "扫描对方的扫码交换二维码。"

/**
 * 扫码提交面板：内容只在打开时挂载，相机把令牌交回来后立刻提交。
 *
 * 桌面 App 没有相机通道，只给「请在手机 App 内扫码」，不接 web 摄像头兜底；
 * 用户返回 / 取消扫码不弹错误，直接关窗。
 */
function ScanExchangeBody({
  cardNumbers,
  onClose,
}: {
  cardNumbers: readonly number[]
  onClose: () => void
}) {
  const exchange = useScanExchange({ cardNumbers, onCancel: onClose })

  if (exchange.phase === "unsupported") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <ScanLineIcon aria-hidden="true" className="size-10 text-primary" />
        <p className="text-sm font-medium">
          {SCAN_RUNTIME_UNSUPPORTED_MESSAGE}
        </p>
        <Button type="button" className="w-full" onClick={onClose}>
          知道了
        </Button>
      </div>
    )
  }

  if (exchange.phase === "committed") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2Icon aria-hidden="true" className="size-10 text-primary" />
        <p className="text-sm font-medium">{EXCHANGE_COMPLETED_MESSAGE}</p>
        <Button type="button" className="w-full" onClick={onClose}>
          完成
        </Button>
      </div>
    )
  }

  if (exchange.phase === "queued") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CloudOffIcon aria-hidden="true" className="size-10 text-primary" />
        <p className="text-sm font-medium">{SCAN_EXCHANGE_QUEUED_MESSAGE}</p>
        <Button type="button" className="w-full" onClick={onClose}>
          完成
        </Button>
      </div>
    )
  }

  if (exchange.phase === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          {exchange.errorMessage ?? SCAN_FAILED_MESSAGE}
        </p>
        <Button type="button" variant="outline" onClick={exchange.retry}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          重试
        </Button>
      </div>
    )
  }

  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {exchange.phase === "committing" ? "正在提交交换…" : "正在打开相机…"}
    </p>
  )
}

/**
 * 桌面用 `Dialog layout="pinned"`、窄屏用底部 `Sheet`，断点与账号工作区一致
 * （`useDesktopAccountWorkspace`）；两种外壳共用同一份内容。
 */
export function ScanExchangeDialog({
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
    <ScanExchangeBody cardNumbers={cardNumbers} onClose={close} />
  ) : null

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent layout="pinned" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{SCAN_TITLE}</DialogTitle>
            <DialogDescription>{SCAN_DESCRIPTION}</DialogDescription>
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
          <SheetTitle>{SCAN_TITLE}</SheetTitle>
          <SheetDescription>{SCAN_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
