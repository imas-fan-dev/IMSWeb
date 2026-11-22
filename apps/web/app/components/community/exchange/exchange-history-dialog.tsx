import { useState } from "react"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleAlertIcon,
  HistoryIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import type {
  NamecardExchangeHistoryEntry,
  NamecardExchangeStatus,
} from "~/lib/api"
import type {
  ScanExchangeQueueEntry,
  ScanExchangeQueueStatus,
} from "~/lib/namecards/scan-exchange-queue"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { Skeleton } from "~/components/ui/skeleton"
import { namecardDateTimeLabel } from "~/lib/namecards/dates"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"

import { useRetainedValue } from "~/lib/use-retained-value"
import { ExchangeRequestDialog } from "./exchange-request-dialog"
import { EXCHANGE_SOURCE_LABEL } from "./exchange-source-label"
import { useExchangeHistory } from "./use-exchange-history"

const DIALOG_TITLE = "交换记录"
const DIALOG_DESCRIPTION = "服务端记录与本机待重试的扫码交换。"

const SERVER_STATUS: Record<
  NamecardExchangeStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "待处理",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  completed: {
    label: "已完成",
    className: "border-success/40 bg-success/10 text-success",
  },
  declined: {
    label: "已拒绝",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  expired: {
    label: "已过期",
    className: "border-border bg-muted text-muted-foreground",
  },
}

const LOCAL_STATUS: Record<
  ScanExchangeQueueStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "等待提交",
    className: "border-border bg-muted text-muted-foreground",
  },
  failed: {
    label: "待重试",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  expired: {
    label: "已失效",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

/** 一笔服务端记录：状态、对方名称、时间与名片数量；每一行都能点开（pending 可处理，其余只读）。 */
function ServerRow({
  entry,
  onOpen,
}: {
  entry: NamecardExchangeHistoryEntry
  onOpen: (entry: { id: string; status: NamecardExchangeStatus }) => void
}) {
  const status = SERVER_STATUS[entry.status]
  const cardCount =
    entry.targetCardNumbers.length + entry.initiatorCardNumbers.length
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
        <span className="min-w-0 truncate text-sm font-medium">
          {entry.counterpart.displayName}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {namecardDateTimeLabel(entry.createdAt) ?? ""}
          </span>
          <span className="shrink-0 rounded border border-border/70 px-1.5 py-px text-[11px]">
            {EXCHANGE_SOURCE_LABEL[entry.source]}
          </span>
        </span>
        <span className="shrink-0">共 {cardCount} 张名片</span>
      </div>
    </>
  )

  return (
    <button
      type="button"
      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={() => onOpen({ id: entry.id, status: entry.status })}
    >
      {content}
      <span className="sr-only">
        {entry.status === "pending"
          ? "查看并处理这笔交换"
          : "查看这笔交换的详情"}
      </span>
    </button>
  )
}

/** 一条本机队列记录：失败可重试 / 删除，失效只能删除后重新生成二维码。 */
function LocalRow({
  entry,
  busy,
  onRetry,
  onRemove,
}: {
  entry: ScanExchangeQueueEntry
  busy: boolean
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}) {
  const status = LOCAL_STATUS[entry.status]
  const targetLabel =
    entry.target.kind === "token"
      ? "本机扫码交换"
      : entry.target.kind === "card-share"
        ? "本机扫码交换 · 单卡分享"
        : "本机扫码交换 · 快速清单"
  return (
    <div className="rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
        <span className="min-w-0 truncate text-sm font-medium">
          {targetLabel}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          我给出 {entry.giveCardNumbers.length} 张
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {namecardDateTimeLabel(entry.createdAt) ?? ""}
      </div>
      {entry.error ? (
        <p className="mt-1 text-xs text-muted-foreground">{entry.error}</p>
      ) : null}
      {entry.status === "pending" ? (
        <p className="mt-1 text-xs text-muted-foreground">联网后会自动提交。</p>
      ) : null}
      {entry.status === "expired" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          这次交换的二维码或链接已失效，需要重新获取后再试一次。
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {entry.status === "failed" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onRetry(entry.id)}
          >
            <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            重试
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onRemove(entry.id)}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          删除
        </Button>
      </div>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status">
      <span className="sr-only">正在读取交换记录…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-16 rounded-lg" />
      ))}
    </div>
  )
}

/** 面板内容：本机条目固定置顶，服务端条目按页跟随。 */
function ExchangeHistoryBody() {
  const history = useExchangeHistory()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openExchange, setOpenExchange] = useState<{
    id: string
    status: NamecardExchangeStatus
  } | null>(null)
  const shownExchange = useRetainedValue(openExchange)

  const runLocal = async (
    id: string,
    action: (id: string) => Promise<void>
  ) => {
    setBusyId(id)
    try {
      await action(id)
    } finally {
      setBusyId(null)
    }
  }

  const empty =
    !history.loading &&
    !history.failed &&
    history.local.length === 0 &&
    history.server.length === 0

  return (
    <div className="flex flex-col gap-3">
      {history.loading && history.server.length === 0 ? (
        <HistorySkeleton />
      ) : null}

      {history.failed ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>暂时无法读取交换记录</AlertTitle>
          <AlertDescription>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={history.reload}
            >
              重试读取
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {history.local.length > 0 ? (
        <ul aria-label="本机待重试" className="flex flex-col gap-2">
          {history.local.map((entry) => (
            <li key={entry.id}>
              <LocalRow
                entry={entry}
                busy={busyId === entry.id}
                onRetry={(id) => void runLocal(id, history.retryLocal)}
                onRemove={(id) => void runLocal(id, history.removeLocal)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {history.server.length > 0 ? (
        <ul aria-label="交换记录" className="flex flex-col gap-2">
          {history.server.map((entry) => (
            <li key={entry.id}>
              <ServerRow entry={entry} onOpen={setOpenExchange} />
            </li>
          ))}
        </ul>
      ) : null}

      {empty ? (
        <Empty className="min-h-48 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有交换记录</EmptyTitle>
            <EmptyDescription>
              完成一次名片交换后，这里会留下记录。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {history.totalPage > 1 ? (
        <nav
          aria-label="交换记录翻页"
          className="flex items-center justify-between gap-2"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="上一页"
            disabled={history.page <= 1 || history.loading}
            onClick={() => history.setPage(history.page - 1)}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">
            第 {history.page} / {history.totalPage} 页
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="下一页"
            disabled={history.page >= history.totalPage || history.loading}
            onClick={() => history.setPage(history.page + 1)}
          >
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </nav>
      ) : null}

      {/* 每一笔服务端记录都复用通知里的详情窗：pending 可同意 / 拒绝，其余只读。 */}
      <ExchangeRequestDialog
        open={openExchange !== null}
        onOpenChange={(open) => {
          if (!open) setOpenExchange(null)
        }}
        exchangeId={shownExchange?.id ?? null}
        readOnly={shownExchange?.status !== "pending"}
        onDecided={history.reload}
      />
    </div>
  )
}

/**
 * 名片册工具栏的「交换记录」面板。
 *
 * 桌面用 `Dialog layout="pinned"`、窄屏用底部 `Sheet`，与扫码面板同一套外壳；
 * 内容只在打开时挂载，关窗即卸载（下次打开重新取第一页）。
 */
export function ExchangeHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const desktop = useDesktopAccountWorkspace()

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent layout="pinned" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{DIALOG_TITLE}</DialogTitle>
            <DialogDescription>{DIALOG_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <DialogBody>{open ? <ExchangeHistoryBody /> : null}</DialogBody>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{DIALOG_TITLE}</SheetTitle>
          <SheetDescription>{DIALOG_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <div className="max-h-[60svh] overflow-y-auto overscroll-contain px-4 pb-4">
          {open ? <ExchangeHistoryBody /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
