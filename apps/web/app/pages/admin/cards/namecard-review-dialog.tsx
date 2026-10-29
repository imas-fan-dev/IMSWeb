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
import { NamecardStatusBadge } from "~/components/community/namecard-status-badge"
import { getAdminNamecardDiff, type AdminNamecard, type AdminNamecardDiff } from "~/lib/api"
import { cn } from "~/lib/utils"

type DiffSide = AdminNamecardDiff["live"]

interface ImageSlot {
  key: string
  url: string
  state: "same" | "removed" | "added"
  /** 旧图排在前面，替换后的新图紧跟其后。 */
  label: string
}

interface FieldDiff {
  label: string
  live: string
  pending: string | null
}

const EMPTY = "-"

function pairSlots(
  before: string | null,
  after: string | null,
  label: string,
  key: string
): ImageSlot[] {
  if (before === after) {
    return before ? [{ key: `${key}-same`, url: before, state: "same", label }] : []
  }
  return [
    ...(before
      ? [{ key: `${key}-old`, url: before, state: "removed" as const, label }]
      : []),
    ...(after
      ? [{ key: `${key}-new`, url: after, state: "added" as const, label }]
      : []),
  ]
}

/**
 * 图片按页序比较：正面、中间页逐位、背面。位置不同就「旧的在前、新的在后」。
 */
export function diffImageSlots(live: DiffSide, pending: DiffSide | null): ImageSlot[] {
  const next = pending ?? live
  const middles = Math.max(
    live.middleImageUrls.length,
    next.middleImageUrls.length
  )
  const slots: ImageSlot[] = [
    ...pairSlots(live.frontImageUrl, next.frontImageUrl, "正面", "front"),
  ]
  for (let index = 0; index < middles; index += 1) {
    slots.push(
      ...pairSlots(
        live.middleImageUrls[index] ?? null,
        next.middleImageUrls[index] ?? null,
        `中间页 ${index + 1}`,
        `middle-${index}`
      )
    )
  }
  slots.push(
    ...pairSlots(live.backImageUrl, next.backImageUrl, "背面", "back")
  )
  return slots
}

function creditsText(side: DiffSide): string {
  if (!side.credits.length) return ""
  return side.credits
    .map((credit) => credit.displayName)
    .filter((name) => name.trim())
    .join("、")
}

function charactersText(side: DiffSide): string {
  return side.favoriteCharacters.map((character) => character.name).join("、")
}

/** 字段顺序与名片详情窗一致，只有提交版本才参与比较。 */
export function diffFields(live: DiffSide, pending: DiffSide | null): FieldDiff[] {
  const rows: Array<[string, string, string]> = [
    ["制作人名称", live.producerName ?? "", pending?.producerName ?? ""],
    ["制作人读音", live.producerReading ?? "", pending?.producerReading ?? ""],
    ["制作日期", live.madeOn ?? "", pending?.madeOn ?? ""],
    ["所属团体", live.groupName ?? "", pending?.groupName ?? ""],
    ["制作人员", creditsText(live), pending ? creditsText(pending) : ""],
    ["企划", live.seriesCodes.join("、"), pending?.seriesCodes.join("、") ?? ""],
    ["担当角色", charactersText(live), pending ? charactersText(pending) : ""],
    ["简介", live.bio ?? "", pending?.bio ?? ""],
    ["交换说明", live.tradeNote ?? "", pending?.tradeNote ?? ""],
  ]
  return rows.map(([label, before, after]) => ({
    label,
    live: before,
    pending: pending && before !== after ? after : null,
  }))
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
  const [diff, setDiff] = useState<AdminNamecardDiff | null>(null)
  const [failed, setFailed] = useState(false)
  const [activeSlot, setActiveSlot] = useState(0)

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
  const fields = diff ? diffFields(diff.live, diff.pending) : []
  const active = slots[Math.min(activeSlot, Math.max(slots.length - 1, 0))]

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent layout="pinned" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>名片 #{card?.id ?? ""}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {card ? `${card.producerName ?? `名片 #${card.id}`} · 版本 ${card.revision}` : ""}
            </span>
            {card ? <NamecardStatusBadge status={card.status} /> : null}
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
              <section aria-label="图片对比" className="space-y-3">
                {active ? (
                  <div className="overflow-hidden rounded-xl border bg-muted">
                    <img
                      src={active.url}
                      alt={`${active.label}（${active.state === "removed" ? "旧版" : active.state === "added" ? "新版" : "未改动"}）`}
                      className={cn(
                        "aspect-3/2 w-full object-contain",
                        active.state === "removed" && "border-4 border-destructive",
                        active.state === "added" && "border-4 border-success"
                      )}
                    />
                  </div>
                ) : null}
                <ul className="card-thumb-strip flex gap-2 overflow-x-auto">
                  {slots.map((slot, index) => (
                    <li key={slot.key}>
                      <button
                        type="button"
                        aria-label={`查看${slot.label}（${slot.state === "removed" ? "旧版" : slot.state === "added" ? "新版" : "未改动"}）`}
                        aria-pressed={index === activeSlot}
                        onClick={() => setActiveSlot(index)}
                        className={cn(
                          "relative block size-16 overflow-hidden rounded-md border",
                          slot.state === "removed" && "border-2 border-destructive",
                          slot.state === "added" && "border-2 border-success",
                          index === activeSlot && "ring-2 ring-primary"
                        )}
                      >
                        <img
                          src={slot.url}
                          alt=""
                          className="size-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-background/85 text-[10px]/4">
                          {slot.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label="内容对比">
                <dl className="space-y-2 text-sm">
                  {fields.map((field) => (
                    <div key={field.label} className="flex gap-3">
                      <dt className="w-20 shrink-0 text-muted-foreground">
                        {field.label}
                      </dt>
                      <dd className="min-w-0 flex-1 wrap-break-word">
                        {field.pending === null ? (
                          field.live || EMPTY
                        ) : (
                          <>
                            <span className="text-destructive line-through decoration-destructive/70">
                              {field.live || EMPTY}
                            </span>{" "}
                            <span className="text-success">
                              {field.pending || EMPTY}
                            </span>
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
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
            variant="secondary"
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
