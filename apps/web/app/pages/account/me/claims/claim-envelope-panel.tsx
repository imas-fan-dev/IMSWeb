import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MailIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

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
import {
  getFudabaClaimEnvelopes,
  getNamecardNotifications,
  isApiError,
  markNamecardNotificationsRead,
  respondFudabaClaimEnvelope,
  type FudabaClaimEnvelope,
} from "~/lib/api"
import { setNamecardUnread } from "~/lib/use-namecard-unread"
import type { NamecardNotification } from "@imsweb/contracts/fudaba/card-claims"

interface InboxEntry {
  kind: "notification" | "claim"
  key: string
  at: string
  read: boolean
  title: string
  body: string
  notificationId: string | null
  envelope: FudabaClaimEnvelope | null
}

interface InboxDetail {
  key: string
  title: string
  at: string
  body: string
  notificationId: string | null
  envelope: FudabaClaimEnvelope | null
}

export function ClaimEnvelopePanel({ readOnly }: { readOnly: boolean }) {
  const [items, setItems] = useState<FudabaClaimEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NamecardNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [markingRead, setMarkingRead] = useState(false)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InboxDetail | null>(null)

  useEffect(() => {
    let active = true
    getNamecardNotifications()
      .send()
      .then((result) => {
        if (!active) return
        setNotifications(result.items)
        setUnreadNotifications(result.unread)
        setNamecardUnread(result.unread)
      })
      .catch(() => {
        // Signed out or offline: keep the message panel usable.
      })
      .finally(() => {
        if (active) setNotificationsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setMarkingRead(true)
    try {
      await markNamecardNotificationsRead().send()
      setNotifications((current) =>
        current.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() }
        )
      )
      setUnreadNotifications(0)
      setNamecardUnread(0)
    } catch {
      toast.error("标记已读失败，请刷新后重试")
    } finally {
      setMarkingRead(false)
    }
  }, [])

  /** 单个通知标记已读：列表里直接操作，不必依赖「全部已读」。 */
  async function markOneRead(notificationId: string) {
    const target = notifications.find((item) => item.id === notificationId)
    if (!target || target.readAt !== null || readingId !== null) return
    setReadingId(notificationId)
    try {
      const result = await markNamecardNotificationsRead([
        notificationId,
      ]).send()
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      )
      const next = Math.max(0, unreadNotifications - result.updated)
      setUnreadNotifications(next)
      setNamecardUnread(next)
    } catch {
      toast.error("标记已读失败，请刷新后重试")
    } finally {
      setReadingId(null)
    }
  }

  /** 打开详情即视为读过：正文比列表里的摘要长得多，看完就算送达。 */
  function openDetail(entry: InboxEntry) {
    setDetail({
      key: entry.key,
      title: entry.title,
      at: entry.at,
      body: entry.body,
      notificationId: entry.notificationId,
      envelope: entry.envelope,
    })
    if (entry.notificationId !== null && !entry.read) {
      void markOneRead(entry.notificationId)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const result = await getFudabaClaimEnvelopes().send()
      setItems(result.items)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getFudabaClaimEnvelopes()
      .send()
      .then((result) => {
        if (active) setItems(result.items)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function respond(
    envelope: FudabaClaimEnvelope,
    decision: "confirm" | "decline"
  ) {
    if (busyId || readOnly) return
    setBusyId(envelope.id)
    try {
      const result = await respondFudabaClaimEnvelope(
        envelope.id,
        decision,
        envelope.revision
      ).send()
      setItems((current) =>
        current.map((item) =>
          item.id === result.envelope.id ? result.envelope : item
        )
      )
      toast.success(
        decision === "confirm"
          ? "已确认本人名片，认领申请等待管理员审核"
          : "已拒绝这次名片匹配"
      )
    } catch (responseError) {
      toast.error(
        isApiError(responseError)
          ? responseError.message
          : "信封处理失败，请刷新后重试"
      )
      if (isApiError(responseError) && responseError.status === 409) {
        await load()
      }
    } finally {
      setBusyId(null)
    }
  }

  const feed: InboxEntry[] = [
    ...notifications.map((item) => ({
      kind: "notification" as const,
      key: item.id,
      at: item.createdAt,
      read: item.readAt !== null,
      title: item.title,
      body: item.body,
      notificationId: item.id,
      envelope: null,
    })),
    ...items
      .filter((item) => item.actionState === "pending")
      .map((item) => ({
        kind: "claim" as const,
        key: item.id,
        at: item.createdAt,
        read: false,
        title: item.title,
        body: item.body,
        notificationId: null,
        envelope: item,
      })),
  ].sort((left, right) =>
    left.at < right.at ? 1 : left.at > right.at ? -1 : 0
  )

  return (
    <section aria-labelledby="claim-inbox-title">
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="claim-inbox-title"
              className="flex items-center gap-2 text-xl font-semibold"
            >
              <MailIcon className="size-4" aria-hidden="true" />
              消息
              {unreadNotifications ? (
                <Badge variant="secondary">{unreadNotifications} 条未读</Badge>
              ) : null}
            </h2>
            <p className="mt-2 text-sm/6 text-muted-foreground">
              名片审核结果、同名历史名片的认领询问与站长通知都会出现在这里。
            </p>
          </div>
          {unreadNotifications ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markingRead}
              onClick={() => void markAllRead()}
            >
              {markingRead ? "标记中…" : "全部已读"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>消息读取失败</AlertTitle>
            <AlertDescription>请刷新后重试。</AlertDescription>
          </Alert>
        ) : loading || notificationsLoading ? (
          <div
            className="mt-4 flex h-16 items-center text-sm text-muted-foreground"
            aria-label="正在读取消息"
          >
            <LoaderCircleIcon
              className="mr-2 size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            正在读取
          </div>
        ) : feed.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {feed.map((entry) => {
              const envelope = entry.envelope
              return (
                <div
                  key={entry.key}
                  className={entry.read ? "p-4" : "bg-primary/5 p-4"}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{entry.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {entry.at.slice(0, 16).replace("T", " ")}
                    </span>
                    {entry.notificationId !== null ? (
                      entry.read ? null : (
                        <Badge variant="secondary">未读</Badge>
                      )
                    ) : (
                      <Badge variant="outline">待处理</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
                    {entry.body}
                  </p>
                  {envelope ? (
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      历史名片 #{envelope.legacyCardId} · 注册名片{" "}
                      {envelope.cardId}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {envelope ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={readOnly || busyId !== null}
                          onClick={() => void respond(envelope, "confirm")}
                        >
                          {busyId === envelope.id ? (
                            <LoaderCircleIcon
                              data-icon="inline-start"
                              className="animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckIcon
                              data-icon="inline-start"
                              aria-hidden="true"
                            />
                          )}
                          是本人名片
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={readOnly || busyId !== null}
                          onClick={() => void respond(envelope, "decline")}
                        >
                          <XIcon data-icon="inline-start" aria-hidden="true" />
                          不是本人名片
                        </Button>
                      </>
                    ) : null}
                    <div className="ml-auto flex items-center gap-2">
                      {entry.notificationId !== null && !entry.read ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={readingId !== null}
                          onClick={() =>
                            void markOneRead(entry.notificationId!)
                          }
                        >
                          {readingId === entry.notificationId ? (
                            <LoaderCircleIcon
                              data-icon="inline-start"
                              className="animate-spin motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckIcon
                              data-icon="inline-start"
                              aria-hidden="true"
                            />
                          )}
                          标为已读
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetail(entry)}
                      >
                        查看详情
                        <ChevronRightIcon
                          data-icon="inline-end"
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">当前没有消息。</p>
        )}
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
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
              {detail ? detail.at.slice(0, 16).replace("T", " ") : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="max-h-[60vh] overflow-y-auto overscroll-contain rounded-lg border bg-muted/20 p-4 text-sm wrap-break-word whitespace-pre-wrap">
              {detail?.body ?? ""}
            </div>
          </DialogBody>
          <DialogFooter>
            {detail?.envelope ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={readOnly || busyId !== null}
                  onClick={() => {
                    const envelope = detail.envelope
                    setDetail(null)
                    if (envelope) void respond(envelope, "decline")
                  }}
                >
                  <XIcon data-icon="inline-start" aria-hidden="true" />
                  不是本人名片
                </Button>
                <Button
                  type="button"
                  disabled={readOnly || busyId !== null}
                  onClick={() => {
                    const envelope = detail.envelope
                    setDetail(null)
                    if (envelope) void respond(envelope, "confirm")
                  }}
                >
                  <CheckIcon data-icon="inline-start" aria-hidden="true" />
                  是本人名片
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetail(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
