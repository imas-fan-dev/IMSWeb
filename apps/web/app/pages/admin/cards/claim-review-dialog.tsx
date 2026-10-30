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

type LiveSide = AdminNamecardDiff["live"]

const EMPTY = "-"

/** 认领申请只带六个字段：把 live 与申请值并排列出来。 */
function claimRows(claim: FudabaAdminCardClaim, live: LiveSide | null) {
  const payload = claim.payload
  const rows: { label: string; live: string; next: string }[] = [
    {
      label: "制作人名称",
      live: live?.producerName ?? EMPTY,
      next: payload.producerName ?? live?.producerName ?? EMPTY,
    },
    {
      label: "团体名称",
      live: live?.groupName ?? EMPTY,
      next: payload.groupName ?? live?.groupName ?? EMPTY,
    },
    {
      label: "制作时间",
      live: live?.madeOn ?? EMPTY,
      next: payload.madeOn ?? live?.madeOn ?? EMPTY,
    },
    {
      label: "企划",
      live: live?.seriesCodes.join("、") || EMPTY,
      next: payload.seriesCodes?.join("、") || live?.seriesCodes.join("、") || EMPTY,
    },
    {
      label: "担当角色",
      live:
        live?.favoriteCharacters.map((character) => character.name).join("、") ||
        EMPTY,
      next: payload.favoriteCharacterIds
        ? payload.favoriteCharacterIds
            .map(
              (id) =>
                live?.favoriteCharacters.find((item) => item.id === id)?.name ??
                `#${id}`
            )
            .join("、") || EMPTY
        : live?.favoriteCharacters.map((character) => character.name).join("、") ||
          EMPTY,
    },
  ]
  return rows
}

/**
 * 认领审核窗：左侧是名片墙上的原始名片，右侧是申请值与 live 的对照。
 * 按钮与列表行上的 √ / × 走同一套确认框。
 */
export function ClaimReviewDialog({
  claim,
  onOpenChange,
  onApprove,
  onReject,
}: {
  claim: FudabaAdminCardClaim | null
  onOpenChange: (open: boolean) => void
  onApprove: (claim: FudabaAdminCardClaim) => void
  onReject: (claim: FudabaAdminCardClaim) => void
}) {
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

  const rows = claim ? claimRows(claim, live) : []

  return (
    <Dialog open={claim !== null} onOpenChange={onOpenChange}>
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
              <div className="rounded-lg border">
                {rows.map((row) => (
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
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!claim) return
              onOpenChange(false)
              onReject(claim)
            }}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            驳回
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!claim) return
              onOpenChange(false)
              onApprove(claim)
            }}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            通过
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
