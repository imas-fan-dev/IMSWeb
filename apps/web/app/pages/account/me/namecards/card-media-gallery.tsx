import { ImagePlusIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"

import { Button } from "~/components/ui/button"
import { getOwnerCardMedia } from "~/lib/api"
import { useOwnerCardMedia } from "./use-owner-card-media"
import { NAMECARD_MIDDLE_IMAGE_LIMIT } from "@imsweb/contracts/fudaba/runtime"

/** One ordered artwork list: the front first, the middle pages, the back last. */
export const NAMECARD_MEDIA_LIMIT = 2 + NAMECARD_MIDDLE_IMAGE_LIMIT

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024
/** 缩略图边长与间距；插入占位的位移按这两项算。 */
const THUMB_SIZE = 80
const THUMB_GAP = 8
/** 指针移动超过这个距离才算拖拽，否则当作点击。 */
const DRAG_THRESHOLD = 6

export type MediaSlot =
  | {
      /** A page the card already stores; `index` addresses it in the saved set. */
      kind: "existing"
      index: number
      url: string
    }
  | { kind: "new"; file: File; url: string }

export function newMediaSlot(file: File): MediaSlot {
  return { kind: "new", file, url: URL.createObjectURL(file) }
}

export function releaseMediaSlot(slot: MediaSlot) {
  if (slot.kind === "new") URL.revokeObjectURL(slot.url)
}

export function mediaSlotsFromCard(card: {
  frontImageUrl: string
  middleImageUrls: readonly string[]
  backImageUrl: string | null
}): MediaSlot[] {
  const slots: MediaSlot[] = [
    { kind: "existing", index: 0, url: card.frontImageUrl },
  ]
  card.middleImageUrls.forEach((url, position) => {
    slots.push({ kind: "existing", index: position + 1, url })
  })
  slots.push({
    kind: "existing",
    index: card.middleImageUrls.length + 1,
    url: card.backImageUrl ?? card.frontImageUrl,
  })
  return card.backImageUrl ? slots : slots.slice(0, 1)
}

/**
 * The submit repeats the pages the card already has by index and sends the
 * newly chosen ones as files, so an untouched page is never re-uploaded.
 */
export function buildMediaSubmit(slots: readonly MediaSlot[]): {
  images: File[]
  order: string[]
} {
  const images: File[] = []
  const order = slots.map((slot) => {
    if (slot.kind === "existing") return `#${slot.index}`
    images.push(slot.file)
    return `@${images.length - 1}`
  })
  return { images, order }
}

/** True when the two sides are different shapes, orientation swaps included. */
export function artworkShapeMismatch(
  front: { width: number; height: number } | null,
  back: { width: number; height: number } | null
): boolean {
  if (!front || !back || front.width <= 0 || back.width <= 0) return false
  const ratio = (size: { width: number; height: number }) =>
    Math.max(size.width / size.height, size.height / size.width)
  return Math.abs(ratio(front) - ratio(back)) > 0.02
}

export function mediaSlotRole(
  position: number,
  total: number
): string | null {
  if (total < 2) return null
  if (position === 0) return "正面"
  if (position === total - 1) return "背面"
  return `中间页 ${position}`
}

async function measure(
  source: string
): Promise<{ width: number; height: number } | null> {
  const { promise, resolve } = Promise.withResolvers<{
    width: number
    height: number
  } | null>()
  const image = new Image()
  image.onload = () =>
    resolve({ width: image.naturalWidth, height: image.naturalHeight })
  image.onerror = () => resolve(null)
  image.src = source
  return promise
}

/**
 * Private artwork only decodes once its bearer header is attached, so the size
 * probe downloads the bytes for protected sources and measures the blob.
 */
async function loadSize(
  slot: MediaSlot
): Promise<{ width: number; height: number } | null> {
  if (slot.kind === "new") return measure(slot.url)
  try {
    const blob = await getOwnerCardMedia(slot.url).send()
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await measure(objectUrl)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

export async function artworkSidesMismatch(
  slots: readonly MediaSlot[]
): Promise<boolean> {
  if (slots.length < 2) return false
  const [front, back] = await Promise.all([
    loadSize(slots[0]),
    loadSize(slots[slots.length - 1]),
  ])
  return artworkShapeMismatch(front, back)
}

export function validateArtworkFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "请选择图片文件。"
  if (file.size > MAX_CARD_IMAGE_BYTES) return "单张图片不能超过 8 MB。"
  return null
}

type DragState = { slot: MediaSlot; index: number; x: number; y: number }

/**
 * The artwork area of the card window: one large preview plus a scrollable
 * strip of thumbnails that can be reordered by dragging. Roles follow the
 * order - the first page is the front and the last page is the back.
 *
 * Dragging listens on the window instead of the thumbnail: the dragged
 * thumbnail leaves the strip as soon as the drag starts, so a handler bound to
 * it would stop receiving moves. The copy that marks the landing spot is
 * rendered in the strip flow, which keeps it in the scroll area.
 */
/**
 * App builds read private artwork through the authenticated media route, so a
 * raw `/api/...` source would arrive without its bearer header and render
 * blank. Existing slots therefore borrow the same loader the inventory uses;
 * newly picked files already have a local object URL.
 */
function SlotImage({
  slot,
  className,
  alt,
  draggable = false,
  style,
}: {
  slot: MediaSlot
  className: string
  alt: string
  draggable?: boolean
  style?: CSSProperties
}) {
  const media = useOwnerCardMedia(slot.kind === "existing" ? slot.url : null)
  const src = slot.kind === "existing" ? media.src : slot.url
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`${className} grid place-items-center bg-muted/50 text-[10px] text-muted-foreground`}
      >
        {media.failed ? "加载失败" : ""}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={draggable}
      style={style}
    />
  )
}

export function CardMediaGallery({
  slots,
  disabled,
  allowUpload = true,
  onChange,
  onError,
}: {
  slots: readonly MediaSlot[]
  disabled: boolean
  /** The backoffice may only reorder and drop pages, never add or replace. */
  allowUpload?: boolean
  onChange: (slots: MediaSlot[]) => void
  onError: (message: string) => void
}) {
  const [active, setActive] = useState(0)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<number | null>(null)
  const position = Math.min(active, Math.max(slots.length - 1, 0))
  const current = slots[position] ?? null
  const role = mediaSlotRole(position, slots.length)

  const addFiles = useCallback(
    (files: readonly File[], replaceAt: number | null) => {
      const room = replaceAt === null ? NAMECARD_MEDIA_LIMIT - slots.length : 1
      const accepted: File[] = []
      for (const file of files) {
        if (accepted.length >= room) break
        const invalid = validateArtworkFile(file)
        if (invalid) {
          onError(invalid)
          continue
        }
        accepted.push(file)
      }
      if (accepted.length === 0) return
      if (replaceAt === null) {
        onChange([...slots, ...accepted.map(newMediaSlot)])
        setActive(slots.length)
        return
      }
      const next = [...slots]
      releaseMediaSlot(next[replaceAt])
      next.splice(replaceAt, 1, ...accepted.map(newMediaSlot))
      onChange(next.slice(0, NAMECARD_MEDIA_LIMIT))
      setActive(replaceAt)
    },
    [onChange, onError, slots]
  )

  const pick = useCallback(
    (replaceAt: number | null) => {
      if (disabled) return
      replaceRef.current = replaceAt
      const input = inputRef.current
      if (!input) return
      input.value = ""
      input.click()
    },
    [disabled]
  )

  function removeAt(target: number) {
    if (disabled) return
    releaseMediaSlot(slots[target])
    onChange(slots.filter((_, index) => index !== target))
    setActive(Math.max(0, target - 1))
  }

  function move(from: number, to: number) {
    if (disabled || from === to || to < 0 || to > slots.length - 1) return
    const next = [...slots]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
    setActive(to)
  }

  /** 插入位置按「被拖走之后的列表」算，与最终的数组下标一致。 */
  function resolveDrop(x: number, from: number) {
    const strip = stripRef.current
    if (!strip) return from
    let insertion = 0
    for (const element of strip.querySelectorAll<HTMLElement>(
      "[data-thumb-pos]"
    )) {
      if (Number(element.dataset.thumbPos) === from) continue
      const rect = element.getBoundingClientRect()
      if (x > rect.left + rect.width / 2) insertion += 1
    }
    return insertion
  }

  function startDrag(index: number, event: React.PointerEvent<HTMLElement>) {
    if (disabled || slots.length < 2 || event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const dragged = slots[index]
    if (!dragged) return
    let dragging = false

    const handleMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD)
          return
        dragging = true
        dropRef.current = index
        setDropAt(index)
      } else {
        dropRef.current = resolveDrop(move.clientX, index)
        setDropAt(dropRef.current)
      }
      setDrag({ slot: dragged, index, x: move.clientX, y: move.clientY })
    }

    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("pointercancel", handleCancel)
      const target = dropRef.current ?? index
      dropRef.current = null
      setDrag(null)
      setDropAt(null)
      if (!dragging) {
        setActive(index)
        return
      }
      if (commit) move(index, target)
    }

    const handleUp = (up: PointerEvent) => {
      if (up.pointerId === pointerId) finish(true)
    }
    const handleCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === pointerId) finish(false)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("pointercancel", handleCancel)
  }

  const roleLabel = useMemo(
    () => slots.map((_, index) => mediaSlotRole(index, slots.length)),
    [slots]
  )
  const visibleSlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter((entry) => entry.index !== drag?.index)
  const dropIndex = drag && dropAt !== null ? dropAt : null

  return (
    <section aria-label="名片图片" className="min-w-0">
      {allowUpload ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="选择名片图片"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            const replaceAt = replaceRef.current
            replaceRef.current = null
            addFiles(files, replaceAt)
          }}
        />
      ) : null}

      <div
        className={`relative aspect-video w-full overflow-hidden rounded-lg border ${
          current ? "bg-muted/40" : "border-dashed bg-muted/20"
        }`}
        data-card-artwork-preview
      >
        {current ? (
          <SlotImage
            slot={current}
            alt={role ? `名片${role}` : "名片图片"}
            className="size-full object-contain"
          />
        ) : (
          <button
            type="button"
            className="group grid size-full place-items-center px-6 text-center"
            disabled={disabled}
            onClick={() => pick(null)}
          >
            <span className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full border border-dashed bg-background shadow-sm motion-safe:transition-colors group-hover:border-primary/60 group-focus-visible:border-primary/60">
                <ImagePlusIcon
                  aria-hidden="true"
                  className="size-6 text-muted-foreground group-hover:text-foreground"
                />
              </span>
              <span className="text-sm font-medium">添加名片图片</span>
              <span className="text-xs text-muted-foreground">
                点击添加，可一次选择多张图片。
              </span>
            </span>
          </button>
        )}
        {role ? (
          <span className="absolute top-2 left-2 rounded-md bg-background px-2 py-0.5 text-xs font-medium shadow-sm ring-1 ring-border">
            {role}
          </span>
        ) : null}
        {current ? (
          <div className="absolute right-2 bottom-2 z-10 flex gap-2">
            {allowUpload ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border bg-background shadow-sm ring-1 ring-border hover:bg-muted"
                disabled={disabled}
                onClick={() => pick(position)}
              >
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                更换
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="card-artwork-delete shadow-sm"
              disabled={disabled || slots.length <= 1}
              onClick={() => removeAt(position)}
            >
              <XIcon data-icon="inline-start" aria-hidden="true" />
              删除
            </Button>
          </div>
        ) : null}
      </div>

      <div
        ref={stripRef}
        className="card-thumb-strip mt-3 flex overflow-x-auto overscroll-x-contain"
        style={{ gap: THUMB_GAP }}
        role="list"
        aria-label="名片图片顺序"
      >
        {visibleSlots.slice(0, dropIndex ?? 0).map((entry) => (
          <Thumbnail
            key={slotKey(entry.slot)}
            entry={entry}
            active={entry.index === position}
            dragging={false}
            roleLabel={roleLabel[entry.index]}
            disabled={disabled}
            removable={slots.length > 1}
            onSelect={setActive}
            onRemove={removeAt}
            onPointerDown={startDrag}
          />
        ))}

        {dropIndex !== null && drag ? (
          <div
            aria-hidden="true"
            role="listitem"
            className="relative shrink-0 rounded-md border-2 border-dashed border-primary/70 bg-muted/40"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          >
            <SlotImage
              slot={drag.slot}
              alt=""
              className="size-full rounded-[4px] object-cover opacity-40"
            />
          </div>
        ) : null}

        {visibleSlots.slice(dropIndex ?? 0).map((entry) => (
          <Thumbnail
            key={slotKey(entry.slot)}
            entry={entry}
            active={entry.index === position}
            dragging={false}
            roleLabel={roleLabel[entry.index]}
            disabled={disabled}
            removable={slots.length > 1}
            onSelect={setActive}
            onRemove={removeAt}
            onPointerDown={startDrag}
          />
        ))}

        {allowUpload && slots.length < NAMECARD_MEDIA_LIMIT && !drag ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => pick(null)}
            aria-label="添加名片图片"
            className="grid shrink-0 place-items-center rounded-md border border-dashed text-muted-foreground hover:border-primary/60 hover:text-foreground"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          >
            <ImagePlusIcon aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>

      {/*
        对话框的祖先节点带 transform，会把 `position: fixed` 的包含块改成它自己，
        ghost 因此被推到指针右侧很远。挂到 body 上才按视口定位。
      */}
      {drag
        ? createPortal(
            <SlotImage
              slot={drag.slot}
              alt=""
              className="pointer-events-none fixed z-50 rounded-md border-2 border-primary object-cover shadow-xl"
              style={{
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                left: drag.x - THUMB_SIZE / 2,
                top: drag.y - THUMB_SIZE / 2,
              }}
            />,
            document.body
          )
        : null}

      <p className="mt-2 text-xs text-muted-foreground">
        {allowUpload ? (
          <>
            第一张为正面、最后一张为背面，中间为中间页；拖拽缩略图可调整顺序。
            最多 {NAMECARD_MEDIA_LIMIT} 张，单张不超过 8 MB。
          </>
        ) : (
          "只能删除或调整图片顺序，替换与新增由用户在编辑器里完成。"
        )}
      </p>
    </section>
  )
}

function slotKey(slot: MediaSlot): string {
  return slot.kind === "existing" ? `existing-${slot.index}` : slot.url
}

function Thumbnail({
  entry,
  active,
  dragging,
  roleLabel,
  disabled,
  removable,
  onSelect,
  onRemove,
  onPointerDown,
}: {
  entry: { slot: MediaSlot; index: number }
  active: boolean
  dragging: boolean
  roleLabel: string | null
  disabled: boolean
  removable: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onPointerDown: (index: number, event: React.PointerEvent<HTMLElement>) => void
}) {
  const { slot, index } = entry
  return (
    <div
      role="listitem"
      data-thumb-pos={index}
      className="group relative shrink-0 touch-none select-none"
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      onPointerDown={(event) => onPointerDown(index, event)}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-label={
          roleLabel ? `第 ${index + 1} 张（${roleLabel}）` : `第 ${index + 1} 张`
        }
        aria-current={active}
        className={`block size-full overflow-hidden rounded-md border ${
          active ? "ring-2 ring-primary" : ""
        } ${dragging ? "opacity-40" : ""}`}
      >
        <SlotImage
          slot={slot}
          alt=""
          className="size-full object-cover"
        />
      </button>
      {!disabled && removable ? (
        <button
          type="button"
          aria-label={`删除第 ${index + 1} 张图片`}
          className="absolute -top-1.5 -right-1.5 hidden size-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-sm group-focus-within:grid group-hover:grid"
          onClick={() => onRemove(index)}
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      ) : null}
      {roleLabel ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-md bg-background px-1 text-center text-[10px]/4 ring-1 ring-border/60">
          {roleLabel}
        </span>
      ) : null}
    </div>
  )
}
