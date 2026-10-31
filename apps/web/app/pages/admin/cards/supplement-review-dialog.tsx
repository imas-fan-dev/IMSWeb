import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

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
import { ReviewCardPreview } from "./review-card-preview"
import {
  ReviewFieldRows,
  useReviewLabels,
  type ReviewRow,
} from "./review-field-rows"
import {
  getAdminFudabaCardSupplement,
  type AdminCardSupplement,
  type AdminCardSupplementDetailResponse,
} from "~/lib/api"

/** 补充只会带这四项；没带的字段表示这次不改。 */
function fieldRows(
  detail: AdminCardSupplementDetailResponse,
  labels: ReturnType<typeof useReviewLabels>
): ReviewRow[] {
  const pending = detail.supplement.payload
  const live = detail.live
  const rows: ReviewRow[] = []
  if (pending.producerName !== undefined) {
    rows.push({
      label: "制作人名称",
      live: live.producerName,
      pending: pending.producerName,
    })
  }
  if (pending.groupName !== undefined) {
    rows.push({
      label: "团体名称",
      live: live.groupName,
      pending: pending.groupName,
    })
  }
  if (pending.seriesCodes !== undefined) {
    rows.push({
      label: "企划",
      live: live.seriesCodes.length ? labels.seriesList(live.seriesCodes) : null,
      pending: pending.seriesCodes.length
        ? labels.seriesList(pending.seriesCodes)
        : null,
    })
  }
  if (pending.favoriteCharacterIds !== undefined) {
    rows.push({
      label: "担当角色",
      live: live.favoriteCharacters.length
        ? labels.characterList(live.favoriteCharacters.map((item) => item.id))
        : null,
      pending: pending.favoriteCharacterIds.length
        ? labels.characterList(pending.favoriteCharacterIds)
        : null,
    })
  }
  return rows
}

/**
 * 补充审核窗：只比对名片墙上的四项资料，通过后写回那张卡并给补充人发贡献值。
 * 裁决按钮与列表行上的 √ / × 走同一套二次确认窗（理由在确认窗里填）。
 */
export function SupplementReviewDialog({
  supplement,
  cardNumber,
  cardLabel,
  onOpenChange,
  onApprove,
  onReject,
}: {
  supplement: AdminCardSupplement | null
  cardNumber: number
  cardLabel: string
  onOpenChange: (open: boolean) => void
  onApprove: (supplement: AdminCardSupplement) => void
  onReject: (supplement: AdminCardSupplement) => void
}) {
  const labels = useReviewLabels()
  const [detail, setDetail] =
    useState<AdminCardSupplementDetailResponse | null>(null)
  const [failed, setFailed] = useState(false)

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

  const rows = detail ? fieldRows(detail, labels) : []

  return (
    <Dialog open={supplement !== null} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>补充审核 · {cardLabel}</DialogTitle>
          <DialogDescription>
            补充只改动制作人名称、团体名称、企划与担当角色，图片与简介不受影响。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 md:grid-cols-2">
          <div className="min-w-0">
            <ReviewCardPreview cardNumber={cardNumber} />
          </div>
          <div className="min-w-0 space-y-4">
            {failed ? (
              <p className="text-sm text-destructive">
                补充资料载入失败，请刷新后重试。
              </p>
            ) : detail ? (
              <ReviewFieldRows rows={rows} />
            ) : (
              <div className="flex h-24 items-center text-sm text-muted-foreground">
                <LoaderCircleIcon
                  className="mr-2 size-4 animate-spin"
                  aria-hidden="true"
                />
                正在载入
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            disabled={!supplement}
            onClick={() => {
              if (!supplement) return
              onOpenChange(false)
              onApprove(supplement)
            }}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            通过
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!supplement}
            onClick={() => {
              if (!supplement) return
              onOpenChange(false)
              onReject(supplement)
            }}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            驳回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
