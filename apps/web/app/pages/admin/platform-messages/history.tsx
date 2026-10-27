import {
  ArrowLeftIcon,
  ArrowRightIcon,
  HistoryIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  cancelAdminStationMessage,
  getAdminStationMessageDeliveries,
  getAdminStationMessages,
  type AdminStationMessage,
  type AdminStationMessageDelivery,
  type AdminStationMessageList,
  type AdminStationMessageStatus,
} from "~/lib/api"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

const EMPTY_PAGE_INFO: AdminStationMessageList["pageInfo"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

const STATUS_LABELS: Record<AdminStationMessageStatus, string> = {
  scheduled: "待发送",
  sending: "发送中",
  sent: "已发送",
  failed: "失败",
  canceled: "已取消",
}

const EMAIL_STATE_LABELS: Record<
  AdminStationMessageDelivery["emailState"],
  string
> = {
  pending: "邮件待发",
  sent: "邮件已发",
  failed: "邮件失败",
  skipped: "无邮箱",
}

function formatTime(value: number | null) {
  return value === null ? "—" : new Date(value).toLocaleString()
}

export function meta() {
  return [{ title: "历史审计 | IMSWeb" }]
}

export default function AdminPlatformMessagesHistoryPage() {
  const { adminSession } = useOutletContext<AdminOutletContext>()
  const canManage = adminSession.adminRole === "super_admin"

  const [page, setPage] = useState(1)
  const [messages, setMessages] = useState<AdminStationMessage[]>([])
  const [pageInfo, setPageInfo] =
    useState<AdminStationMessageList["pageInfo"]>(EMPTY_PAGE_INFO)
  const [loading, setLoading] = useState(canManage)
  const [error, setError] = useState(false)
  const [detail, setDetail] = useState<AdminStationMessage | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<AdminStationMessageDelivery[]>(
    []
  )
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveriesError, setDeliveriesError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await getAdminStationMessages({ page }).send()
      setMessages(result.messages)
      setPageInfo(result.pageInfo)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    if (!canManage) return
    let active = true
    getAdminStationMessages({ page })
      .send()
      .then((result) => {
        if (!active) return
        setMessages(result.messages)
        setPageInfo(result.pageInfo)
        setError(false)
      })
      .catch(() => {
        if (!active) return
        setError(true)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [canManage, page])

  /** Opening resets the roster so a previous batch never flashes in the dialog. */
  function openDetail(message: AdminStationMessage) {
    setDetail(message)
    setDeliveries([])
    setDeliveriesError(false)
    setDeliveriesLoading(message.audience === "selected")
  }

  function closeDetail() {
    setDetail(null)
  }

  useEffect(() => {
    if (detail === null || detail.audience !== "selected") return
    let active = true
    getAdminStationMessageDeliveries(detail.id)
      .send()
      .then((result) => {
        if (!active) return
        setDeliveries(result.deliveries)
        setDeliveriesError(false)
      })
      .catch(() => {
        if (!active) return
        setDeliveriesError(true)
      })
      .finally(() => {
        if (!active) return
        setDeliveriesLoading(false)
      })
    return () => {
      active = false
    }
  }, [detail])

  async function cancel(message: AdminStationMessage) {
    setCanceling(message.id)
    try {
      await cancelAdminStationMessage(message.id).send()
      toast.success("已取消该定时通知")
      closeDetail()
      await load()
    } catch (cancelError) {
      toast.error(adminErrorMessage(cancelError))
    } finally {
      setCanceling(null)
    }
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow="PLATFORM MESSAGES"
          title="历史审计"
          description="通知发送审计。"
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>仅最高管理员可访问</AlertTitle>
          <AlertDescription>历史审计记录了全站群发操作。</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="PLATFORM MESSAGES"
        title="历史审计"
        description="每批通知的接收范围、送达与邮件转发结果；操作人同时写入管理员审计日志。"
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>共 {pageInfo.total} 批</AdminStatus>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCwIcon
                className={loading ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
              重新读取
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>历史审计读取失败</AlertTitle>
          <AlertDescription>请检查网络连接后重试。</AlertDescription>
        </Alert>
      ) : null}

      <AdminPanel
        title="发送批次"
        description="点击标题查看正文全文。"
        icon={HistoryIcon}
        footer={
          pageInfo.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => {
                  setLoading(true)
                  setPage((current) => Math.max(1, current - 1))
                }}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {pageInfo.page} / {pageInfo.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || !pageInfo.hasNextPage}
                onClick={() => {
                  setLoading(true)
                  setPage((current) => current + 1)
                }}
              >
                下一页
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          ) : null
        }
      >
        {loading && messages.length === 0 ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <AdminEmptyState
            icon={HistoryIcon}
            title="还没有发送记录"
            description="在「发送通知」里发出第一批通知后，这里会列出每一批的送达情况。"
          />
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>接收 / 送达</TableHead>
                  <TableHead>邮件</TableHead>
                  <TableHead>发送人</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="block w-56 max-w-56 text-left"
                        onClick={() => openDetail(message)}
                      >
                        <span className="block truncate font-medium">
                          {message.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {message.body}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          message.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {STATUS_LABELS[message.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {message.audience === "all" ? "群发 · " : "指定 · "}
                      {message.deliveredCount}/{message.recipientCount}
                    </TableCell>
                    <TableCell className="text-sm">
                      {message.forwardEmail
                        ? `${message.emailSentCount} 成功 / ${message.emailFailedCount} 失败`
                        : "未转发"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {message.senderAdminName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {message.scheduledAt !== null &&
                      message.status === "scheduled"
                        ? `排定 ${formatTime(message.scheduledAt)}`
                        : formatTime(message.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {message.status === "scheduled" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={canceling === message.id}
                          onClick={() => void cancel(message)}
                        >
                          {canceling === message.id ? (
                            <LoaderCircleIcon
                              className="animate-spin"
                              data-icon="inline-start"
                            />
                          ) : (
                            <XCircleIcon data-icon="inline-start" />
                          )}
                          取消
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(message)}
                        >
                          详情
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminPanel>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle
              className="line-clamp-2 pr-10 wrap-break-word"
              title={detail?.title ?? ""}
            >
              {detail?.title ?? ""}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${STATUS_LABELS[detail.status]} · ${detail.senderAdminName} · ${formatTime(detail.createdAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 text-sm">
              <div
                className="max-h-60 overflow-y-auto overscroll-contain rounded-lg border bg-muted/20 p-3 wrap-break-word whitespace-pre-wrap"
                aria-label="通知正文"
              >
                {detail?.body ?? ""}
              </div>
              {detail?.audience === "selected" ? (
                <section aria-label="指定接收用户" className="grid gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    指定接收用户 · {deliveries.length} 位
                  </h3>
                  <div className="max-h-48 divide-y overflow-y-auto overscroll-contain rounded-lg border text-xs">
                    {deliveriesLoading ? (
                      <p className="p-3 text-muted-foreground">正在读取…</p>
                    ) : deliveriesError ? (
                      <p className="p-3 text-destructive">收件人读取失败</p>
                    ) : deliveries.length === 0 ? (
                      <p className="p-3 text-muted-foreground">没有收件人</p>
                    ) : (
                      deliveries.map((delivery) => (
                        <div
                          key={delivery.accountId}
                          className="flex flex-wrap items-center gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {delivery.displayName || "（未设置昵称）"}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {delivery.email ?? "未绑定邮箱"}
                          </span>
                          <Badge
                            variant={
                              delivery.delivered ? "secondary" : "outline"
                            }
                          >
                            {delivery.delivered ? "已送达" : "未送达"}
                          </Badge>
                          {detail.forwardEmail ? (
                            <span className="text-muted-foreground">
                              {EMAIL_STATE_LABELS[delivery.emailState]}
                            </span>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}
              {detail ? (
                <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <dt>接收范围</dt>
                  <dd>
                    {detail.audience === "all" ? "全部有效用户" : "指定用户"}
                  </dd>
                  <dt>送达</dt>
                  <dd>
                    {detail.deliveredCount} / {detail.recipientCount}
                  </dd>
                  <dt>邮件转发</dt>
                  <dd>
                    {detail.forwardEmail
                      ? `${detail.emailSentCount} 成功 · ${detail.emailFailedCount} 失败`
                      : "未开启"}
                  </dd>
                  <dt>排定时间</dt>
                  <dd>{formatTime(detail.scheduledAt)}</dd>
                  <dt>开始</dt>
                  <dd>{formatTime(detail.startedAt)}</dd>
                  <dt>完成</dt>
                  <dd>{formatTime(detail.completedAt)}</dd>
                  {detail.failureReason ? (
                    <>
                      <dt>失败原因</dt>
                      <dd>{detail.failureReason}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDetail}>
              关闭
            </Button>
            {detail?.status === "scheduled" ? (
              <Button
                type="button"
                variant="destructive"
                disabled={canceling === detail.id}
                onClick={() => void cancel(detail)}
              >
                取消发送
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
