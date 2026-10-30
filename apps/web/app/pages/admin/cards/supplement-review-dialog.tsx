import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

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
  getAdminFudabaCardSupplement,
  isApiError,
  reviewAdminFudabaCardSupplement,
  type AdminCardSupplement,
  type AdminCardSupplementDetailResponse,
} from "~/lib/api"

const REASON_PRESETS = ["信息不符", "资料不完整", "与名片图片矛盾", "重复提交"]

function fieldRows(
  live: AdminCardSupplementDetailResponse["live"],
  pending: AdminCardSupplement["payload"]
) {
  const rows: { label: string; live: string; next: string }[] = []
  if (pending.producerName !== undefined) {
    rows.push({
      label: "制作人名称",
      live: live.producerName ?? "-",
      next: pending.producerName,
    })
  }
  if (pending.groupName !== undefined) {
    rows.push({
      label: "团体名称",
      live: live.groupName ?? "-",
      next: pending.groupName ?? "-",
    })
  }
  if (pending.seriesCodes !== undefined) {
    rows.push({
      label: "企划",
      live: live.seriesCodes.join("、") || "-",
      next: pending.seriesCodes.join("、") || "-",
    })
  }
  if (pending.favoriteCharacterIds !== undefined) {
    const names = new Map(live.favoriteCharacters.map((item) => [item.id, item.name]))
    rows.push({
      label: "担当角色",
      live: live.favoriteCharacters.map((item) => item.name).join("、") || "-",
      next:
        pending.favoriteCharacterIds
          .map((id) => names.get(id) ?? `#${id}`)
          .join("、") || "-",
    })
  }
  return rows
}

/**
 * 补充审核窗：只比对名片墙上的四项资料，通过后写回那张卡并给补充人发贡献值。
 */
export function SupplementReviewDialog({
  supplement,
  cardLabel,
  onOpenChange,
  onReviewed,
}: {
  supplement: AdminCardSupplement | null
  cardLabel: string
  onOpenChange: (open: boolean) => void
  onReviewed: () => void
}) {
  const [detail, setDetail] = useState<AdminCardSupplementDetailResponse | null>(
    null
  )
  const [failed, setFailed] = useState(false)
  const [reason, setReason] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null)

  useEffect(() => {
    if (!supplement) return
    let active = true
    getAdminFudabaCardSupplement(supplement.id)
      .send()
      .then((next) => {
        if (active) setDetail(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [supplement])

  async function decide(decision: "approve" | "reject") {
    if (!supplement || submitting) return
    const note = reason.trim()
    if (decision === "reject" && !note) {
      setRejecting(true)
      toast.error("驳回需要填写理由")
      return
    }
    setSubmitting(decision)
    try {
      await reviewAdminFudabaCardSupplement(supplement.id, {
        decision,
        expectedRevision: supplement.revision,
        note: note || "已核对名片墙上的资料",
      }).send()
      toast.success(decision === "approve" ? "补充已通过" : "补充已驳回")
      onReviewed()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        isApiError(error) ? error.message : "审核提交失败，请刷新后重试"
      )
      if (isApiError(error) && error.status === 409) onReviewed()
    } finally {
      setSubmitting(null)
    }
  }

  const rows = detail ? fieldRows(detail.live, detail.supplement.payload) : []

  return (
    <Dialog open={supplement !== null} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>补充审核 · {cardLabel}</DialogTitle>
          <DialogDescription>
            补充只改动制作人名称、团体名称、企划与担当角色，图片与简介不受影响。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {failed ? (
            <p className="text-sm text-destructive">补充资料载入失败，请刷新后重试。</p>
          ) : detail ? (
            <>
              <div className="rounded-lg border">
                {rows.length ? (
                  rows.map((row) => (
                    <div
                      key={row.label}
                      className="grid gap-1 border-b p-3 last:border-b-0 sm:grid-cols-[6rem_1fr]"
                    >
                      <span className="text-xs text-muted-foreground">
                        {row.label}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through decoration-border">
                          {row.live}
                        </span>
                        <span aria-hidden="true">→</span>
                        <span className="font-medium">{row.next}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    这份补充没有带来任何改动。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setReason(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                aria-label="审核备注"
                value={reason}
                maxLength={400}
                rows={3}
                aria-invalid={rejecting && !reason.trim() ? true : undefined}
                placeholder="驳回时必填，会随通知发送给补充人"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            </>
          ) : (
            <div className="flex h-24 items-center text-sm text-muted-foreground">
              <LoaderCircleIcon className="mr-2 size-4 animate-spin" aria-hidden="true" />
              正在载入
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting !== null}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!detail || submitting !== null}
            onClick={() => void decide("reject")}
          >
            {submitting === "reject" ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <XIcon data-icon="inline-start" />
            )}
            驳回
          </Button>
          <Button
            type="button"
            disabled={!detail || submitting !== null}
            onClick={() => void decide("approve")}
          >
            {submitting === "approve" ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            通过
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
