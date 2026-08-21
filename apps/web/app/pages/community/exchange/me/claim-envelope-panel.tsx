import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MailIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  getFudabaClaimEnvelopes,
  isApiError,
  respondFudabaClaimEnvelope,
  type FudabaClaimEnvelope,
} from "~/lib/api"

export function ClaimEnvelopePanel({ readOnly }: { readOnly: boolean }) {
  const [items, setItems] = useState<FudabaClaimEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const pending = items.filter((item) => item.actionState === "pending")

  return (
    <section
      className="border-b bg-background"
      aria-labelledby="claim-inbox-title"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="claim-inbox-title"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <MailIcon className="size-4" aria-hidden="true" />
              名片认领信封
              {pending.length ? (
                <Badge variant="secondary">{pending.length} 封待确认</Badge>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              系统发现同 ID 的历史名片时，会在这里询问是否为本人名片。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="刷新名片认领信封"
            title="刷新"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCwIcon
              className={
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }
              aria-hidden="true"
            />
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>信封读取失败</AlertTitle>
            <AlertDescription>请刷新后重试。</AlertDescription>
          </Alert>
        ) : loading ? (
          <div
            className="mt-4 flex h-16 items-center text-sm text-muted-foreground"
            aria-label="正在读取名片认领信封"
          >
            <LoaderCircleIcon
              className="mr-2 size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            正在读取
          </div>
        ) : pending.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {pending.map((envelope) => (
              <div
                key={envelope.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{envelope.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {envelope.body}
                  </p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    历史名片 #{envelope.legacyCardId} · 注册名片{" "}
                    {envelope.cardId}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
                      <CheckIcon data-icon="inline-start" aria-hidden="true" />
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
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            当前没有待确认信封。
          </p>
        )}
      </div>
    </section>
  )
}
