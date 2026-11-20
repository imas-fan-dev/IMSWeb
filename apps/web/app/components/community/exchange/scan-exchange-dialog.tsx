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
import { ScanOverlay } from "./scan-overlay"
import type { ScanExchangeState } from "./use-scan-exchange"
import { useScanExchange } from "./use-scan-exchange"

const SCAN_TITLE = "扫码"
const SCAN_DESCRIPTION = "扫描对方的扫码交换二维码。"

/**
 * 取景阶段只渲染全屏遮罩（相机在 WebView 后面），提交后再套回窗口外壳：
 * 桌面 `Dialog layout="pinned"`、窄屏底部 `Sheet`，与账号工作区的断点一致。
 *
 * 每次打开都重新挂载主体，关窗即卸载——原生取景不留到下一次。
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
  if (!open) return null
  return (
    <ScanExchangeBody
      cardNumbers={cardNumbers}
      onClose={() => onOpenChange(false)}
    />
  )
}

function ScanExchangeBody({
  cardNumbers,
  onClose,
}: {
  cardNumbers: readonly number[]
  onClose: () => void
}) {
  const desktop = useDesktopAccountWorkspace()
  const exchange = useScanExchange({ cardNumbers, onCancel: onClose })

  if (exchange.phase === "scanning" || exchange.phase === "decoding") {
    return (
      <ScanOverlay
        decoding={exchange.phase === "decoding"}
        onClose={onClose}
        onPickImage={exchange.submitImage}
      />
    )
  }

  const body = <ScanResultBody exchange={exchange} onClose={onClose} />

  if (desktop) {
    return (
      <Dialog
        open
        onOpenChange={(value) => {
          if (!value) onClose()
        }}
      >
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
    <Sheet
      open
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
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

/** 取景之外的阶段：不支持、提交中、完成、已入队、失败。 */
function ScanResultBody({
  exchange,
  onClose,
}: {
  exchange: ScanExchangeState
  onClose: () => void
}) {
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
      正在提交交换…
    </p>
  )
}
