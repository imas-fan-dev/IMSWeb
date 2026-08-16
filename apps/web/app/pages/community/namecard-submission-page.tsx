import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getNamecardSubmission,
  isApiError,
  withdrawNamecardSubmission,
} from "~/lib/api"
import type { NamecardSubmission, NamecardSubmissionStatus } from "~/lib/api"

import {
  getNamecardSubmissionReceipt,
  saveNamecardSubmissionReceipt,
} from "./namecard-submission-storage"

const STATUS_COPY: Record<
  NamecardSubmissionStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "等待审核",
    description: "投稿正在审核队列中，此时仍可自行撤回。",
  },
  approving: {
    label: "审核处理中",
    description: "运营正在发布两面的图片，当前不能撤回。",
  },
  approved: {
    label: "已通过",
    description: "名片已经公开。如需下架，请联系管理员处理。",
  },
  rejected: {
    label: "未通过",
    description: "游客投稿不能修改。如需再次投稿，请返回名片墙重新上传。",
  },
  withdrawn: {
    label: "已撤回",
    description: "投稿已退出审核队列，图片和担当信息不能再修改。",
  },
}

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Shanghai",
})

export function meta() {
  return [{ title: "投稿管理 | IMSWeb" }]
}

function statusIcon(status: NamecardSubmissionStatus) {
  if (status === "approved") {
    return <CircleCheckIcon aria-hidden="true" className="size-5" />
  }
  if (status === "rejected" || status === "withdrawn") {
    return <CircleXIcon aria-hidden="true" className="size-5" />
  }
  return <CircleDashedIcon aria-hidden="true" className="size-5" />
}

function errorCopy(error: unknown) {
  if (isApiError(error) && error.status === 404) {
    return "找不到这次投稿，或者投稿管理凭证无效。"
  }
  if (isApiError(error) && error.status === 409) {
    return "投稿状态已经发生变化，已为你刷新最新状态。"
  }
  return "暂时无法读取投稿状态，请稍后重试。"
}

export default function NamecardSubmissionPage() {
  const { id: idParam = "" } = useParams()
  const submissionId = Number(idParam)
  const validId = Number.isInteger(submissionId) && submissionId > 0
  const [token] = useState<string | null>(() => {
    if (!validId || typeof window === "undefined") return null
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get(
      "token"
    )
    return (
      hashToken ?? getNamecardSubmissionReceipt(submissionId)?.token ?? null
    )
  })
  const [submission, setSubmission] = useState<NamecardSubmission | null>(null)
  const [loading, setLoading] = useState(validId && token !== null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const statusHeadingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!validId || !token) return

    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const hashToken = hashParams.get("token")
    if (hashToken) {
      saveNamecardSubmissionReceipt({ id: submissionId, token: hashToken })
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`
      )
    }
  }, [submissionId, token, validId])

  const refresh = useCallback(async () => {
    if (!validId || !token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await getNamecardSubmission(submissionId, token).send()
      setSubmission(next.submission)
    } catch (loadError) {
      setError(errorCopy(loadError))
    } finally {
      setLoading(false)
    }
  }, [submissionId, token, validId])

  useEffect(() => {
    if (!validId || !token) return
    let active = true
    void getNamecardSubmission(submissionId, token)
      .send()
      .then((next) => {
        if (active) setSubmission(next.submission)
      })
      .catch((loadError) => {
        if (active) setError(errorCopy(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [submissionId, token, validId])

  async function withdraw() {
    if (!submission || !token || withdrawing) return
    setWithdrawing(true)
    setError(null)
    try {
      const response = await withdrawNamecardSubmission(
        submission.id,
        token,
        submission.revision
      ).send()
      setSubmission(response.submission)
      setConfirmOpen(false)
      window.requestAnimationFrame(() => statusHeadingRef.current?.focus())
      toast.success("投稿已撤回")
    } catch (withdrawError) {
      const message = errorCopy(withdrawError)
      setError(message)
      toast.error(message)
      if (isApiError(withdrawError) && withdrawError.status === 409) {
        await refresh()
      }
    } finally {
      setWithdrawing(false)
    }
  }

  const copy = submission ? STATUS_COPY[submission.status] : null
  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link
        to="/community/cards"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        返回名片墙
      </Link>

      <header className="mt-8 max-w-2xl">
        <p className="text-sm font-semibold text-primary">Submission receipt</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">投稿管理</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          这里仅管理这一次匿名投稿。请妥善保管投稿管理链接。
        </p>
      </header>

      {loading ? (
        <div className="mt-10 space-y-4" aria-label="正在读取投稿状态">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}

      {!loading && (!validId || !token) ? (
        <Alert variant="destructive" className="mt-10">
          <CircleXIcon aria-hidden="true" />
          <AlertTitle>缺少投稿管理凭证</AlertTitle>
          <AlertDescription>
            请使用投稿成功时保存的完整管理链接。链接丢失后只能联系管理员。
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <CircleXIcon aria-hidden="true" />
          <AlertTitle>无法完成操作</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error}</p>
            {token ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
              >
                <RotateCcwIcon data-icon="inline-start" />
                重新读取
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && submission && copy ? (
        <Card className="mt-10">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle
                ref={statusHeadingRef}
                tabIndex={-1}
                className="flex items-center gap-2 focus:outline-none"
              >
                {statusIcon(submission.status)}
                {copy.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {copy.description}
              </p>
            </div>
            <Badge
              variant={
                submission.status === "approved"
                  ? "secondary"
                  : submission.status === "rejected" ||
                      submission.status === "withdrawn"
                    ? "destructive"
                    : "outline"
              }
            >
              {copy.label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            {submission.image1_url && submission.image2_url ? (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border">
                {(
                  [
                    [submission.image1_url, "正面", "front"],
                    [submission.image2_url, "背面", "back"],
                  ] as const
                ).map(([src, label, side]) => (
                  <figure key={side} className="bg-muted">
                    <img
                      src={src}
                      alt={`投稿名片${label}`}
                      className="aspect-3/2 size-full object-contain"
                    />
                    <figcaption className="p-2 text-center text-xs text-muted-foreground">
                      <span>{label}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">投稿编号</dt>
                <dd className="mt-1 font-mono">{submission.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">提交时间</dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  <CalendarDaysIcon aria-hidden="true" className="size-4" />
                  {submission.created_at
                    ? DATE_FORMATTER.format(new Date(submission.created_at))
                    : "待补充"}
                </dd>
              </div>
            </dl>

            {submission.status === "pending" ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                撤回投稿
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!withdrawing) setConfirmOpen(open)
        }}
        title="撤回这次投稿？"
        description="投稿将退出审核队列。游客投稿撤回后不能修改或重新送审。"
        submitting={withdrawing}
        onConfirm={() => void withdraw()}
        confirmLabel="确认撤回"
        cancelLabel="继续等待审核"
      />
    </main>
  )
}
