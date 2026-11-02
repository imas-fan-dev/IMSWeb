import {
  CheckIcon,
  LoaderCircleIcon,
  LockIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { formatCredit } from "~/components/community/namecard-credit-format"
import { NamecardStatusBadge } from "~/components/community/namecard-status-badge"
import {
  getAdminNamecardDiff,
  type AdminNamecard,
  type AdminNamecardDiff,
} from "~/lib/api"
import { DiffArtwork, diffImageSlots } from "./diff-artwork"
import { ReviewFieldRows, useReviewLabels } from "./review-field-rows"

type DiffSide = AdminNamecardDiff["live"]

interface FieldDiff {
  label: string
  /** Single-value fields compare as one line. */
  live: string
  pending: string | null
  /** List fields compare item by item so only real edits stand out. */
  items?: { kept: string[]; removed: string[]; added: string[] }
}

/** Items that appear on both sides stay neutral; only the edits are coloured. */
function diffItems(before: readonly string[], after: readonly string[]) {
  const next = new Set(after)
  const previous = new Set(before)
  return {
    kept: before.filter((item) => next.has(item)),
    removed: before.filter((item) => !next.has(item)),
    added: after.filter((item) => !previous.has(item)),
  }
}

function creditsList(side: DiffSide): string[] {
  return side.credits.map(formatCredit).filter((text) => text.length > 0)
}

function charactersList(side: DiffSide): string[] {
  return side.favoriteCharacters.map((character) => character.name)
}

const YES_NO = (value: boolean) => (value ? "是" : "否")
/** 原创与 AI 是「声明」，没勾等于没声明，不等于否认。 */
const DECLARED = (value: boolean) => (value ? "是" : "未声明")
const EXCHANGE_MODES: Record<DiffSide["exchangeMode"], string> = {
  auto: "自动允许",
  manual: "手动允许",
  none: "不可交换",
}

/**
 * 字段顺序与编辑窗口一致；只有提交版本存在的字段才参与比较。
 */
/** 审核员看的是企划名称，不是 `765as` 这类代号；没给解析器时退回代号。 */
export interface DiffLabels {
  seriesList: (codes: readonly string[]) => string
}

const RAW_LABELS: DiffLabels = {
  seriesList: (codes) => codes.join("、"),
}

export function diffFields(
  live: DiffSide,
  pending: DiffSide | null,
  labels: DiffLabels = RAW_LABELS
): FieldDiff[] {
  const next = pending ?? live
  const textRow = (label: string, before: string, after: string): FieldDiff => ({
    label,
    live: before,
    pending: pending && before !== after ? after : null,
  })
  const listRow = (
    label: string,
    before: readonly string[],
    after: readonly string[],
    render: (values: readonly string[]) => string = RAW_LABELS.seriesList
  ): FieldDiff => {
    const items = diffItems(before, after)
    return {
      label,
      live: render(before),
      pending:
        pending && (items.removed.length || items.added.length)
          ? render(after)
          : null,
      items,
    }
  }
  return [
    textRow("制作人名称", live.producerName ?? "", next.producerName ?? ""),
    textRow("制作人读音", live.producerReading ?? "", next.producerReading ?? ""),
    textRow("所属团体", live.groupName ?? "", next.groupName ?? ""),
    textRow("制作日期", live.madeOn ?? "", next.madeOn ?? ""),
    listRow("企划", live.seriesCodes, next.seriesCodes, labels.seriesList),
    listRow("担当角色", charactersList(live), charactersList(next)),
    textRow("简介", live.bio ?? "", next.bio ?? ""),
    listRow("制作人员", creditsList(live), creditsList(next)),
    textRow("原创标记", DECLARED(live.isOriginal), DECLARED(next.isOriginal)),
    textRow("AI 标记", DECLARED(live.madeWithAi), DECLARED(next.madeWithAi)),
    textRow("交换说明", live.tradeNote ?? "", next.tradeNote ?? ""),
    textRow("交换模式", EXCHANGE_MODES[live.exchangeMode], EXCHANGE_MODES[next.exchangeMode]),
    textRow("公开显示", YES_NO(live.visible), YES_NO(next.visible)),
  ]
}

/**
 * 审核队列里的详情窗：左边对比两版的图片，右边逐字段对比文字，底部只留裁决按钮。
 */
export function NamecardReviewDialog({
  card,
  onOpenChange,
  onApprove,
  onReject,
  onLock,
}: {
  card: AdminNamecard | null
  onOpenChange: (open: boolean) => void
  onApprove: (card: AdminNamecard) => void
  onReject: (card: AdminNamecard) => void
  onLock: (card: AdminNamecard) => void
}) {
  const labels = useReviewLabels()
  const [diff, setDiff] = useState<AdminNamecardDiff | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!card) return
    let active = true
    getAdminNamecardDiff(card.id)
      .send()
      .then((next) => {
        if (active) setDiff(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [card])

  const slots = diff ? diffImageSlots(diff.live, diff.pending) : []
  const fields = diff ? diffFields(diff.live, diff.pending, labels) : []

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>名片 #{card?.id ?? ""}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {card ? `${card.producerName ?? `名片 #${card.id}`} · 版本 ${card.revision}` : ""}
            </span>
            {card ? (
              <NamecardStatusBadge
                status={card.status}
                reviewStatus={card.reviewStatus}
              />
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody>
          {failed ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              无法读取两版内容，请刷新后重试。
            </p>
          ) : !diff ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              正在读取两版内容…
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <DiffArtwork slots={slots} />
              <section aria-label="内容对比" className="min-w-0">
                <ReviewFieldRows
                  rows={fields.map((field) => ({
                    label: field.label,
                    live: field.live,
                    pending: field.pending ?? field.live,
                  }))}
                />
              </section>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex-nowrap justify-end gap-2 overflow-x-auto border-t bg-transparent">
          <Button
            type="button"
            className="min-h-11"
            disabled={!card || card.status !== "pending"}
            onClick={() => {
              if (card) onApprove(card)
            }}
          >
            <CheckIcon data-icon="inline-start" aria-hidden="true" />
            通过
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!card || card.status !== "pending"}
            onClick={() => {
              if (card) onReject(card)
            }}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            驳回
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={!card || card.status === "locked"}
            onClick={() => {
              if (card) onLock(card)
            }}
          >
            <LockIcon data-icon="inline-start" aria-hidden="true" />
            锁定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
