import { CheckIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

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
  getAdminNamecardDiff,
  type AdminNamecardDiff,
  type FudabaAdminCardClaim,
} from "~/lib/api"
import { ReviewCardPreview } from "./review-card-preview"
import {
  ReviewFieldRows,
  useReviewLabels,
  type ReviewRow,
} from "./review-field-rows"

type LiveSide = AdminNamecardDiff["live"]

/**
 * 认领申请只带六个字段：申请值缺省时沿用 live，
 * 因此对照表要按「申请之后这张卡会变成什么」来算右侧。
 */
function claimRows(
  claim: FudabaAdminCardClaim,
  live: LiveSide | null,
  labels: ReturnType<typeof useReviewLabels>
): ReviewRow[] {
  const payload = claim.payload
  const liveSeries = live?.seriesCodes ?? []
  const liveCharacters = (live?.favoriteCharacters ?? []).map(
    (character) => character.id
  )
  return [
    {
      label: "制作人名称",
      live: live?.producerName ?? null,
      pending: payload.producerName ?? live?.producerName ?? null,
    },
    {
      label: "制作人读音",
      live: live?.producerReading ?? null,
      pending: payload.producerReading ?? live?.producerReading ?? null,
    },
    {
      label: "团体名称",
      live: live?.groupName ?? null,
      pending: payload.groupName ?? live?.groupName ?? null,
    },
    {
      label: "制作时间",
      live: live?.madeOn ?? null,
      pending: payload.madeOn ?? live?.madeOn ?? null,
    },
    {
      label: "企划",
      live: liveSeries.length ? labels.seriesList(liveSeries) : null,
      pending: labels.seriesList(payload.seriesCodes ?? liveSeries),
    },
    {
      label: "担当角色",
      live: liveCharacters.length ? labels.characterList(liveCharacters) : null,
      pending: labels.characterList(
        payload.favoriteCharacterIds ?? liveCharacters
      ),
    },
  ]
}

/**
 * 认领审核窗：左侧是名片墙上的原始名片，右侧是申请值与 live 的对照。
 * 裁决按钮与列表行上的 √ / × 走同一套二次确认窗。
 */
export function ClaimReviewDialog({
  claim,
  onOpenChange,
  onApprove,
  onReject,
  dismissible = true,
}: {
  claim: FudabaAdminCardClaim | null
  onOpenChange: (open: boolean) => void
  onApprove: (claim: FudabaAdminCardClaim) => void
  onReject: (claim: FudabaAdminCardClaim) => void
  /** 二次确认窗打开时别再让点击穿透关掉这扇窗。 */
  dismissible?: boolean
}) {
  const labels = useReviewLabels()
  const [live, setLive] = useState<LiveSide | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!claim) return
    let active = true
    getAdminNamecardDiff(claim.legacyCardId)
      .send()
      .then((detail) => {
        if (active) setLive(detail.live)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [claim])

  const rows = claim ? claimRows(claim, live, labels) : []

  return (
    <Dialog
      open={claim !== null}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>名片认领 · 名片 #{claim?.legacyCardId ?? ""}</DialogTitle>
          <DialogDescription>
            申请人 {claim?.claimant.displayName ?? ""}
            {claim?.targetCardId === null
              ? " 申请把这张无主名片变成自己的注册名片。"
              : " 申请把这张无主名片绑定到自己已有的名片。"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 md:grid-cols-2">
          {claim ? <ReviewCardPreview cardNumber={claim.legacyCardId} /> : null}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">名片认领</Badge>
              <span className="text-xs text-muted-foreground">
                {claim?.claimant.displayName}
              </span>
            </div>
            {failed ? (
              <p className="text-sm text-destructive">
                名片资料载入失败，请刷新后重试。
              </p>
            ) : (
              <ReviewFieldRows rows={rows} />
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              if (claim) onApprove(claim)
            }}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            通过
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (claim) onReject(claim)
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
