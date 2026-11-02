import { useState } from "react"

import { cn } from "~/lib/utils"
import { withThumbnail } from "~/lib/media-urls"

type DiffSide = {
  frontImageUrl: string
  middleImageUrls: string[]
  backImageUrl: string | null
}

export interface ImageSlot {
  key: string
  url: string
  state: "same" | "removed" | "added"
  /** 旧图排在前面，替换后的新图紧跟其后。 */
  label: string
}

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
export function diffImageSlots(
  live: DiffSide,
  pending: DiffSide | null
): ImageSlot[] {
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

function stateLabel(state: ImageSlot["state"]) {
  if (state === "removed") return "旧版"
  if (state === "added") return "新版"
  return "未改动"
}

/**
 * 两版图片并排：未改动的缩略图保持中性，只有删掉/新增的页才戴红框/绿框。
 * 认领审核与投稿审核共用这一份展示，免得同一个概念两种长相。
 */
export function DiffArtwork({ slots }: { slots: readonly ImageSlot[] }) {
  const [activeSlot, setActiveSlot] = useState(0)
  const active = slots[Math.min(activeSlot, Math.max(slots.length - 1, 0))]

  if (!slots.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        这一份名片没有图片。
      </p>
    )
  }

  return (
    <section aria-label="图片对比" className="space-y-3">
      {active ? (
        <div className="overflow-hidden rounded-xl border bg-muted">
          <img
            src={active.url}
            alt={`${active.label}（${stateLabel(active.state)}）`}
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
              aria-label={`查看${slot.label}（${stateLabel(slot.state)}）`}
              aria-pressed={index === activeSlot}
              onClick={() => setActiveSlot(index)}
              className={cn(
                "relative block size-20 overflow-hidden rounded-md border",
                slot.state === "removed" && "border-2 border-destructive",
                slot.state === "added" && "border-2 border-success",
                index === activeSlot && "ring-2 ring-primary"
              )}
            >
              <img src={withThumbnail(slot.url)} alt="" className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-background/85 text-[10px]/4">
                {slot.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
