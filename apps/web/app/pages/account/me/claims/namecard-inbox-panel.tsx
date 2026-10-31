import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  IdCardIcon,
  SquarePenIcon,
  LoaderCircleIcon,
  MailIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
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
  getNamecardNotifications,
  markNamecardNotificationsRead,
} from "~/lib/api"
import { setNamecardUnread } from "~/lib/use-namecard-unread"
import type { NamecardNotification } from "@imsweb/contracts/fudaba/card-claims"

interface InboxDetail {
  title: string
  at: string
  body: string
  cardNumber: number | null
}

export function NamecardInboxPanel({ readOnly }: { readOnly: boolean }) {
  const [notifications, setNotifications] = useState<NamecardNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
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
        if (active) setLoadFailed(true)
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
  function openDetail(entry: NamecardNotification) {
    setDetail({
      title: entry.title,
      at: entry.createdAt,
      body: entry.body,
      cardNumber: entry.cardNumber,
    })
    if (!entry.readAt) {
      void markOneRead(entry.id)
    }
  }

  /** 同号名片提示把用户带回名片墙，认领窗口在那张卡自己的详情里。 */
  function claimHref(cardNumber: number) {
    return `/community/cards?card=${encodeURIComponent(String(cardNumber))}`
  }

  /** 被驳回的投稿/复审直接落到编辑窗口，编号与 UUID 两种写法编辑页都认。 */
  function editHref(cardNumber: number) {
    return `/account/me/namecards?card=${encodeURIComponent(String(cardNumber))}`
  }

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

        {loadFailed && !notificationsLoading ? (
          <Alert variant="destructive" className="mt-4">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>消息读取失败</AlertTitle>
            <AlertDescription>请刷新后重试。</AlertDescription>
          </Alert>
        ) : notificationsLoading ? (
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
        ) : notifications.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {notifications.map((entry) => {
              const claimable =
                entry.cardNumber !== null && entry.kind === "legacy-card-match"
              // 只有被驳回才需要改稿；通过/锁定/编辑提示不引导用户去编辑。
              const revisable =
                entry.cardNumber !== null && entry.kind === "card-rejected"
              return (
                <div
                  key={entry.id}
                  className={entry.readAt ? "p-4" : "bg-primary/5 p-4"}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{entry.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {entry.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                    {entry.readAt ? null : (
                      <Badge variant="secondary">未读</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
                    {entry.body}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {claimable ? (
                      <NavigationLink
                        to={claimHref(entry.cardNumber!)}
                        className={buttonVariants({
                          size: "sm",
                          className: "h-7 px-2.5 text-[0.8rem]",
                        })}
                      >
                        <IdCardIcon className="size-3.5" aria-hidden="true" />
                        去认领
                      </NavigationLink>
                    ) : null}
                    {revisable ? (
                      <NavigationLink
                        to={editHref(entry.cardNumber!)}
                        className={buttonVariants({
                          size: "sm",
                          className: "h-7 px-2.5 text-[0.8rem]",
                        })}
                      >
                        <SquarePenIcon className="size-3.5" aria-hidden="true" />
                        去修改
                      </NavigationLink>
                    ) : null}
                    <div className="ml-auto flex items-center gap-2">
                      {entry.readAt ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={readOnly || readingId !== null}
                          onClick={() => void markOneRead(entry.id)}
                        >
                          {readingId === entry.id ? (
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
                      )}
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
            {detail?.cardNumber ? (
              <NavigationLink
                to={claimHref(detail.cardNumber)}
                className={buttonVariants({ variant: "outline" })}
                onClick={() => setDetail(null)}
              >
                查看名片
              </NavigationLink>
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
