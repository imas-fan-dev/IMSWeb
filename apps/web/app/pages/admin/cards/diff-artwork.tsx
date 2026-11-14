import { useState } from "react"

import { CardImage } from "~/components/shared/card-image"
import { cn } from "~/lib/utils"

type DiffSide = {
  /** 统一布局的页面（后台作用域）：正/反/中间由页序推导。 */
  pages?: readonly { url: string }[]
}

export interface ImageSlot {
  key: string
  url: string
  state: "same" | "removed" | "added"
  /** 旧图排在前面，替换后的新图紧跟其后。 */
  label: string
}

/**
 * 页面身份：后台 diff 两侧的 URL 只差作用域段（`/media/live/…` vs `/media/draft/…`），
 * 同一个 `page_id` + 同一个 `object_version` 就是同一份图。`?w=` 只是渲染档位，
 * 不参与身份比较，否则未改动的页会被当成「旧版 + 新版」。
 */
function slotIdentity(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw, "http://local")
    const path = url.pathname.replace(/\/media\/(?:live|draft)\//, "/media/")
    return `${path}?v=${url.searchParams.get("v") ?? ""}`
  } catch {
    return raw
  }
}

function pairSlots(
  before: string | null,
  after: string | null,
  label: string,
  key: string
): ImageSlot[] {
  if (slotIdentity(before) === slotIdentity(after)) {
    return before
      ? [{ key: `${key}-same`, url: before, state: "same", label }]
      : []
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

/** 首页是正面、末页是背面，中间页按顺序排在两者之间。 */
function faces(pages: DiffSide["pages"]): {
  front: string | null
  middles: string[]
  back: string | null
} {
  const list = [...(pages ?? [])]
  const front = list.shift()?.url ?? null
  const back = list.length > 0 ? (list.pop()?.url ?? null) : null
  return { front, middles: list.map((page) => page.url), back }
}

/**
 * 图片按页序比较：正面、中间页逐位、背面。位置不同就「旧的在前、新的在后」。
 */
export function diffImageSlots(
  live: DiffSide,
  pending: DiffSide | null
): ImageSlot[] {
  const next = pending ?? live
  const liveFaces = faces(live.pages)
  const nextFaces = faces(next.pages)
  const middles = Math.max(
    liveFaces.middles.length,
    nextFaces.middles.length
  )
  const slots: ImageSlot[] = [
    ...pairSlots(liveFaces.front, nextFaces.front, "正面", "front"),
  ]
  for (let index = 0; index < middles; index += 1) {
    slots.push(
      ...pairSlots(
        liveFaces.middles[index] ?? null,
        nextFaces.middles[index] ?? null,
        `中间页 ${index + 1}`,
        `middle-${index}`
      )
    )
  }
  slots.push(...pairSlots(liveFaces.back, nextFaces.back, "背面", "back"))
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
          <CardImage
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
              <CardImage
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
  )
}
