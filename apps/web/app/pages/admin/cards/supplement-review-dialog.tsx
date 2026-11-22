import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useRetainedValue } from "~/lib/use-retained-value"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { ReviewCardPreview } from "./review-card-preview"
import { ReviewDecisionFooter } from "./review-decision-footer"
import {
  ReviewFieldRows,
  characterListOrNull,
  rotationRows,
  seriesListOrNull,
  useReviewLabels,
  type ReviewRow,
} from "./review-field-rows"
import { textRow } from "./review-row-diff"
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
  const liveCharacters = live.favoriteCharacters.map((item) => item.id)
  const rows: ReviewRow[] = []
  if (pending.producerName !== undefined) {
    rows.push(textRow("制作人名称", live.producerName, pending.producerName))
  }
  if (pending.groupName !== undefined) {
    rows.push(textRow("团体名称", live.groupName, pending.groupName))
  }
  if (pending.seriesCodes !== undefined) {
    rows.push(
      textRow(
        "企划",
        seriesListOrNull(labels, live.seriesCodes),
        seriesListOrNull(labels, pending.seriesCodes)
      )
    )
  }
  if (pending.favoriteCharacterIds !== undefined) {
    rows.push(
      textRow(
        "担当角色",
        characterListOrNull(labels, liveCharacters),
        characterListOrNull(labels, pending.favoriteCharacterIds)
      )
    )
  }
  // 旋转是这次补充的一部分，审核员必须看到，否则通过后卡片朝向会莫名变化。
  rows.push(...rotationRows(pending.rotations))
  return rows
}

/**
 * 补充审核窗：只比对名片墙上的四项资料，通过后写回那张卡并给补充人发贡献值。
 * 裁决按钮与列表行上的 √ / × 走同一套二次确认窗（理由在确认窗里填）。
 */
export function SupplementReviewDialog({
  supplement: incomingSupplement,
  cardNumber: incomingCardNumber,
  cardLabel: incomingCardLabel,
  onOpenChange,
  onApprove,
  onReject,
  dismissible = true,
}: {
  supplement: AdminCardSupplement | null
  cardNumber: number
  cardLabel: string
  onOpenChange: (open: boolean) => void
  onApprove: (supplement: AdminCardSupplement) => void
  onReject: (supplement: AdminCardSupplement) => void
  /** 二次确认窗打开时别再让点击穿透关掉这扇窗。 */
  dismissible?: boolean
}) {
  // 关闭时父组件先置空；把补充记录与标题参数作为一个整体留到淡出结束。
  const supplementSnapshot = useMemo(
    () =>
      incomingSupplement
        ? {
            supplement: incomingSupplement,
            cardNumber: incomingCardNumber,
            cardLabel: incomingCardLabel,
          }
        : null,
    [incomingSupplement, incomingCardNumber, incomingCardLabel]
  )
  const retained = useRetainedValue(supplementSnapshot)
  const supplement = retained?.supplement ?? null
  const cardNumber = retained?.cardNumber ?? incomingCardNumber
  const cardLabel = retained?.cardLabel ?? incomingCardLabel
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
    <Dialog
      open={incomingSupplement !== null}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>补充审核 · {cardLabel}</DialogTitle>
          <DialogDescription>
            补充只改动制作人名称、团体名称、企划与担当角色，图片与简介不受影响。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 md:grid-cols-2">
          <div className="min-w-0">
            <ReviewCardPreview
              cardNumber={cardNumber}
              rotations={supplement?.payload.rotations}
            />
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
        <ReviewDecisionFooter
          approving={!supplement}
          rejecting={!supplement}
          onApprove={() => {
            if (supplement) onApprove(supplement)
          }}
          onReject={() => {
            if (supplement) onReject(supplement)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
