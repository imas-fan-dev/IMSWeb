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
import { DiffArtwork, diffImageSlots } from "./diff-artwork"
import { ReviewCardPreview } from "./review-card-preview"
import {
  ReviewFieldRows,
  useReviewLabels,
  type ReviewRow,
} from "./review-field-rows"
import { textRow } from "./review-row-diff"

type LiveSide = AdminNamecardDiff["live"]

/**
 * 认领申请只带六个字段：申请值缺省时沿用 live，
 * 因此对照表要按「申请之后这张卡会变成什么」来算右侧。
 */
export function claimRows(
  claim: FudabaAdminCardClaim,
  live: LiveSide | null,
  labels: ReturnType<typeof useReviewLabels>,
  target: LiveSide | null = null
): ReviewRow[] {
  const series = (codes: readonly string[]) =>
    codes.length ? labels.seriesList(codes) : null
  const characters = (ids: readonly number[]) =>
    ids.length ? labels.characterList(ids) : null
  const characterIds = (side: LiveSide) =>
    side.favoriteCharacters.map((character) => character.id)
  /**
   * 申请里的旋转必须让审核员看到，否则通过后卡片朝向会莫名变化。
   * 绑定型认领提交时不带旋转（调用方已把 `payload` 置空），这里自然得到空数组。
   */
  const rotationRows = (): ReviewRow[] => {
    const rotations = claim.payload.rotations
    if (!rotations) return []
    const turnLabels = (["front", "back"] as const)
      .map((side) => {
        const turns = rotations[side] ?? 0
        if (!turns) return null
        return `${side === "front" ? "正面" : "背面"} ${turns * 90}°`
      })
      .filter((label): label is string => label !== null)
    return turnLabels.length > 0
      ? [textRow("图片旋转", null, turnLabels.join("、"))]
      : []
  }

  // 绑定型认领丢弃游客投稿的资料：右侧整列取自目标卡片。
  if (target) {
    return [
      textRow("制作人名称", live?.producerName ?? null, target.producerName),
      textRow(
        "制作人读音",
        live?.producerReading ?? null,
        target.producerReading
      ),
      textRow("团体名称", live?.groupName ?? null, target.groupName),
      textRow("制作时间", live?.madeOn ?? null, target.madeOn),
      textRow(
        "企划",
        series(live?.seriesCodes ?? []),
        series(target.seriesCodes)
      ),
      textRow(
        "担当角色",
        characters(live ? characterIds(live) : []),
        characters(characterIds(target))
      ),
      ...rotationRows(),
    ]
  }
  // 未绑定时右侧是「申请里给了就用申请值，否则沿用线上值」。
  const payload = claim.payload
  const liveSeries = live?.seriesCodes ?? []
  const liveCharacters = live ? characterIds(live) : []
  return [
    textRow(
      "制作人名称",
      live?.producerName ?? null,
      payload.producerName ?? live?.producerName ?? null
    ),
    textRow(
      "制作人读音",
      live?.producerReading ?? null,
      payload.producerReading ?? live?.producerReading ?? null
    ),
    textRow(
      "团体名称",
      live?.groupName ?? null,
      payload.groupName ?? live?.groupName ?? null
    ),
    textRow(
      "制作时间",
      live?.madeOn ?? null,
      payload.madeOn ?? live?.madeOn ?? null
    ),
    textRow(
      "企划",
      series(liveSeries),
      series(payload.seriesCodes ?? liveSeries)
    ),
    textRow(
      "担当角色",
      characters(liveCharacters),
      characters(payload.favoriteCharacterIds ?? liveCharacters)
    ),
    ...rotationRows(),
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
  // 绑定型认领会把游客投稿并进用户投稿，所以右侧是目标卡片的 live。
  const [target, setTarget] = useState<LiveSide | null>(null)
  const [failed, setFailed] = useState(false)
  const targetCardNumber = claim?.targetCardNumber ?? null
  const binding = targetCardNumber !== null

  useEffect(() => {
    if (!claim) return
    let active = true
    const guest = getAdminNamecardDiff(claim.legacyCardId).send()
    const owner = targetCardNumber
      ? getAdminNamecardDiff(targetCardNumber).send()
      : Promise.resolve(null)
    void Promise.all([guest, owner])
      .then(([guestDetail, ownerDetail]) => {
        if (!active) return
        setLive(guestDetail.live)
        setTarget(ownerDetail?.live ?? null)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [claim, targetCardNumber])

  const rows = claim
    ? binding
      ? claimRows({ ...claim, payload: {} }, live, labels, target)
      : claimRows(claim, live, labels)
    : []

  return (
    <Dialog
      open={claim !== null}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            名片认领 · 名片 #{claim?.legacyCardId ?? ""}
          </DialogTitle>
          <DialogDescription>
            申请人 {claim?.claimant.displayName ?? ""}
            {claim?.targetCardId === null
              ? " 申请把这张无主名片变成自己的注册名片。"
              : " 申请把这张无主名片绑定到自己已有的名片。"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 md:grid-cols-2">
          {claim && binding && live && target ? (
            <DiffArtwork slots={diffImageSlots(live, target)} />
          ) : claim ? (
            <ReviewCardPreview
              cardNumber={claim.legacyCardId}
              rotations={claim.payload.rotations}
            />
          ) : null}
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
