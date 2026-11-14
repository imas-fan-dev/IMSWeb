import {
  ImagePlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"

import { Button } from "~/components/ui/button"
import { getOwnerCardMedia } from "~/lib/api"
import { CardImage } from "~/components/shared/card-image"
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
      /**
       * The wall already hands out public URLs, so a preview of someone else's
       * card can load them directly instead of going through the owner route.
       */
      direct?: boolean
    }
  | { kind: "new"; file: File; url: string }

export function newMediaSlot(file: File): MediaSlot {
  return { kind: "new", file, url: URL.createObjectURL(file) }
}

export function releaseMediaSlot(slot: MediaSlot) {
  if (slot.kind === "new") URL.revokeObjectURL(slot.url)
}

/** Preview of a card the viewer does not own: every page is a public URL. */
export function publicMediaSlotsFromCard(card: {
  /** 统一布局的页面；预览图用 800 档。 */
  pages?: readonly { pageId: string; previewUrl: string }[]
}): MediaSlot[] {
  return (card.pages ?? []).map((page, index) => ({
    kind: "existing" as const,
    index,
    url: page.previewUrl,
    direct: true,
  }))
}

export function mediaSlotsFromCard(card: {
  /** 统一布局的页面；预览图用 800 档。 */
  pages?: readonly { pageId: string; previewUrl: string }[]
}): MediaSlot[] {
  return (card.pages ?? []).map((page, index) => ({
    kind: "existing" as const,
    index,
    url: page.previewUrl,
  }))
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
/** 旋转后的实际形状：奇圈数会交换宽高，比较时按最终朝向比。 */
export function turnedShape(
  size: { width: number; height: number } | null,
  turns: number
): { width: number; height: number } | null {
  if (!size) return null
  return (((turns % 4) + 4) % 4) % 2 === 1
    ? { width: size.height, height: size.width }
    : size
}

export function artworkShapeMismatch(
  front: { width: number; height: number } | null,
  back: { width: number; height: number } | null
): boolean {
  if (
    !front ||
    !back ||
    front.width <= 0 ||
    front.height <= 0 ||
    back.width <= 0 ||
    back.height <= 0
  ) {
    return false
  }
  // 90° 旋转只是交换宽高，不应把同一形状的正面/背面判成尺寸不一致。
  const ratio = (size: { width: number; height: number }) => {
    const value = size.width / size.height
    return value >= 1 ? value : 1 / value
  }
  return Math.abs(ratio(front) - ratio(back)) > 0.02
}

export function mediaSlotRole(position: number, total: number): string | null {
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
  slots: readonly MediaSlot[],
  rotations: Readonly<Record<number, number>> = {}
): Promise<boolean> {
  if (slots.length < 2) return false
  const [front, back] = await Promise.all([
    loadSize(slots[0]),
    loadSize(slots[slots.length - 1]),
  ])
  // 只转了一面时，最终落库的形状已经变了，提示要按旋转后的尺寸判断。
  return artworkShapeMismatch(
    turnedShape(front, rotations[0] ?? 0),
    turnedShape(back, rotations[slots.length - 1] ?? 0)
  )
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
  onAspect,
  onPainted,
}: {
  slot: MediaSlot
  className: string
  alt: string
  draggable?: boolean
  style?: CSSProperties
  /** 报告原图宽高比，预览按它决定旋转后要不要缩小。 */
  onAspect?: (ratio: number) => void
  /** 这张位图已经画上屏幕；用它决定何时撤掉预览里待保存的旋转。 */
  onPainted?: (url: string) => void
}) {
  return (
    <CardImage
      src={slot.url}
      alt={alt}
      className={className}
      draggable={draggable}
      style={style}
      fallback={
        <span
          aria-hidden="true"
          className={`${className} grid place-items-center bg-muted/50 text-[10px] text-muted-foreground`}
        />
      }
      failedFallback={
        <span
          aria-hidden="true"
          className={`${className} grid place-items-center bg-muted/50 text-[10px] text-muted-foreground`}
        >
          加载失败
        </span>
      }
      onLoad={(event) => {
        const image = event.currentTarget
        if (image.naturalWidth && image.naturalHeight) {
          onAspect?.(image.naturalWidth / image.naturalHeight)
        }
        onPainted?.(slot.url)
      }}
      onError={() => onPainted?.(slot.url)}
    />
  )
}

/**
 * 只读预览：认领、补充、详情与审核窗都只是「看清楚这张卡」，区别仅在于
 * 要不要角标、从哪一页开始、要不要点开全屏。把这层配置收在这里，
 * 各调用点不必再重复 disabled / readOnly / allowUpload 三个开关。
 */
export function CardMediaPreview({
  slots,
  roleLabels = true,
  initialIndex = 0,
  onOpenPreview,
  previewLabel,
  rotations,
  onRotate,
}: {
  slots: readonly MediaSlot[]
  roleLabels?: boolean
  initialIndex?: number
  onOpenPreview?: (index: number, element: HTMLButtonElement) => void
  previewLabel?: (index: number) => string
  /** 审核前的旋转提案：只改预览，随提交一起写入。 */
  rotations?: Readonly<Record<number, number>>
  onRotate?: (position: number, direction: "left" | "right") => void
}) {
  return (
    <CardMediaGallery
      slots={slots}
      disabled
      readOnly
      allowUpload={false}
      roleLabels={roleLabels}
      initialIndex={initialIndex}
      onOpenPreview={onOpenPreview}
      previewLabel={previewLabel}
      rotations={rotations}
      onRotate={onRotate}
      onChange={() => undefined}
      onError={() => undefined}
    />
  )
}

export function CardMediaGallery({
  slots,
  disabled,
  allowUpload = true,
  /** 审核窗的纯预览：不提供任何编辑动作，也不显示编辑说明。 */
  readOnly = false,
  /** 详情窗口不需要「正面/背面」这类角标与缩略图说明。 */
  roleLabels = true,
  /** 从墙上某一面打开时直接停在那张图上。 */
  initialIndex = 0,
  /** 只读预览里点大图放大；给元素是为了让全屏预览从它开始做动画。 */
  onOpenPreview,
  /** 放大按钮的无障碍名称；详情窗要带上编号与正反面。 */
  previewLabel,
  onChange,
  onError,
  /** 旋转当前这张图 90°；给了才显示旋转按钮。 */
  onRotate,
  /** 每一页待保存的旋转圈数（0-3），只在前端用 CSS 预览。 */
  rotations = {},
  /** 独立于只读/上传禁用，允许审核前的旋转预览。 */
}: {
  slots: readonly MediaSlot[]
  disabled: boolean
  /** The backoffice may only reorder and drop pages, never add or replace. */
  allowUpload?: boolean
  readOnly?: boolean
  roleLabels?: boolean
  initialIndex?: number
  onOpenPreview?: (index: number, element: HTMLButtonElement) => void
  previewLabel?: (index: number) => string
  onChange: (slots: MediaSlot[]) => void
  onError: (message: string) => void
  onRotate?: (position: number, direction: "left" | "right") => void
  rotations?: Readonly<Record<number, number>>
}) {
  const [active, setActive] = useState(() => Math.max(0, initialIndex))
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<number | null>(null)
  const position = Math.min(active, Math.max(slots.length - 1, 0))
  const current = slots[position] ?? null
  const role = roleLabels ? mediaSlotRole(position, slots.length) : null

  /*
    位图换新对象是异步的：新图解码完成之前，屏幕上画着的还是旧位图。所以在它真的
    换上之前要沿用换图前的圈数顶着——先撤角度就会变成「先复位、再换图」两步。
  */
  const [paintedObjects, setPaintedObjects] = useState<ReadonlySet<string>>(
    () => new Set(slots.map((slot) => slot.url))
  )
  /** 屏幕上那张位图用过的圈数；位图全部换上后追上当前值。 */
  const [heldTurns, setHeldTurns] =
    useState<Readonly<Record<number, number>>>(rotations)
  const markPainted = useCallback(
    (url: string) => {
      if (paintedObjects.has(url)) return
      const next = new Set(paintedObjects).add(url)
      setPaintedObjects(next)
      // 全部画上屏幕后，冻结的圈数追上当前值。
      if (slots.every((slot) => next.has(slot.url))) setHeldTurns(rotations)
    },
    [paintedObjects, rotations, slots]
  )
  /** 点旋转时预览先切到新圈数；这一版位图还留在屏幕上，记下来供换图时顶着用。 */
  function rotate(position: number, direction: "left" | "right") {
    setHeldTurns((current) => ({
      ...current,
      [position]:
        (pendingTurns(rotations, position) + (direction === "right" ? 1 : 3)) %
        4,
    }))
    onRotate?.(position, direction)
  }
  /** 该槽位的待保存圈数：对象还没画上屏幕时沿用换图前的值。 */
  function slotTurns(index: number, url: string): number {
    return paintedObjects.has(url)
      ? pendingTurns(rotations, index)
      : pendingTurns(heldTurns, index)
  }

  const turn = current ? slotTurns(position, current.url) : 0
  const targetDeg = turn * 90
  // 每一页都可以旋转：中间页与正反面是同一套 slot。
  const rotatable = slots.length > 0

  /*
    动画先从「当前角度」沿最短方向转到目标角，再在动画结束后归一回 0/90/180/270。
    直接写归一后的值会让 270→0 这类变化倒着转一大圈，看起来像抖动。
  */
  const [shownDeg, setShownDeg] = useState(targetDeg)
  const [spinning, setSpinning] = useState(false)
  const shownRef = useRef(targetDeg)
  // 归一时必须落在「这次动画的目标」上；快速连点会让旧目标作废。
  const targetRef = useRef(targetDeg)
  useEffect(() => {
    targetRef.current = targetDeg
  }, [targetDeg])

  /** 动画跑完（或兜底超时）后把角度归一，避免 270/360 这类跨圈值累积。 */
  const settle = useCallback(() => {
    const settled = targetRef.current
    shownRef.current = settled
    setSpinning(false)
    setShownDeg(settled)
  }, [])

  useEffect(() => {
    const current = shownRef.current
    const delta = ((((targetDeg - current) % 360) + 540) % 360) - 180
    if (delta === 0) {
      // 已经停在同余角度：补一次归一，别让 `spinning` 挂住。
      if (shownRef.current !== targetDeg) settle()
      return undefined
    }
    const next = current + delta
    shownRef.current = next
    setSpinning(true)
    setShownDeg(next)
    /*
      兜底 400ms：真实收尾靠 transitionend。固定 220ms 会在掉帧时抢在
      动画完成前归一，画面从中间角度直接跳到终点，看起来就是反向抖一下。
    */
    const timer = setTimeout(settle, 400)
    return () => clearTimeout(timer)
  }, [targetDeg, settle])

  // 换到别的页时直接落位，不做跨图动画。
  const lastPositionRef = useRef(position)
  useEffect(() => {
    if (lastPositionRef.current === position) return
    lastPositionRef.current = position
    shownRef.current = targetDeg
    setSpinning(false)
    setShownDeg(targetDeg)
  }, [position, targetDeg])

  /*
    新对象画上屏幕后立刻落位（不做过渡）：服务端已把旋转写进图里，再补一次动画就
    会多转一次。放在 layout 效果里，保证它和位图换上是同一帧。
  */
  const objectKey = current?.url ?? ""
  const objectPainted = paintedObjects.has(objectKey)
  const lastObjectRef = useRef(objectKey)
  useLayoutEffect(() => {
    if (!objectPainted || lastObjectRef.current === objectKey) return
    lastObjectRef.current = objectKey
    targetRef.current = targetDeg
    shownRef.current = targetDeg
    setSpinning(false)
    setShownDeg(targetDeg)
  }, [objectKey, objectPainted, targetDeg])

  /*
    旋转 90°/270° 后画面框变成 9:16 的形状，按 object-contain 的绘制尺寸重算
    缩放，目标是「刚好填满、不裁切」——宽图要缩，竖图要放大：
      r >= 16/9 → 旋转后顶满高度，缩到 9/16；
      9/16 < r < 16/9 → 缩/放到 1/r；
      r <= 9/16 → 放到 16/9 顶满宽度。
  */
  const [previewAspect, setPreviewAspect] = useState<{
    key: string
    ratio: number
  } | null>(null)
  const aspectRatio =
    previewAspect && previewAspect.key === (current?.url ?? "")
      ? previewAspect.ratio
      : null
  const frame = 16 / 9
  const fittedScale =
    aspectRatio === null
      ? 1
      : aspectRatio >= frame
        ? 1 / frame
        : aspectRatio <= 1 / frame
          ? frame
          : 1 / aspectRatio
  const scaled = turn % 2 === 1 ? fittedScale : 1
  /*
    动画进行中必须保留内联的 transition：目标刚好归一为 0° 时若把整个 style
    摘掉，浏览器就没有可过渡的声明，90→0 会直接瞬移。
  */
  const rotationStyle =
    !spinning && shownDeg === 0 && scaled === 1
      ? undefined
      : {
          transform: `rotate(${shownDeg}deg) scale(${scaled})`,
          transition: spinning ? "transform 200ms ease-out" : "none",
        }

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
        if (
          Math.hypot(move.clientX - startX, move.clientY - startY) <
          DRAG_THRESHOLD
        )
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
    () =>
      slots.map((_, index) =>
        roleLabels ? mediaSlotRole(index, slots.length) : null
      ),
    [roleLabels, slots]
  )
  const visibleSlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter((entry) => entry.index !== drag?.index)
  const dropIndex = drag && dropAt !== null ? dropAt : null

  return (
    <section aria-label="名片图片" className="min-w-0">
      {allowUpload && !disabled ? (
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

      {/*
        放大按钮必须绝对定位：作为普通 grid 子项时 `size-full` 的高度百分比
        无处可依，图片会按原始高度撑出 16:9 的框，被 overflow 裁掉上下。
      */}
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-lg border ${
          current ? "bg-muted/40" : "border-dashed bg-muted/20"
        }`}
        data-card-artwork-preview
      >
        {current && onRotate && rotatable ? (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8 shadow-sm"
              aria-label="向左旋转 90 度"
              onClick={(event) => {
                event.stopPropagation()
                rotate(position, "left")
              }}
            >
              <RotateCcwIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8 shadow-sm"
              aria-label="向右旋转 90 度"
              onClick={(event) => {
                event.stopPropagation()
                rotate(position, "right")
              }}
            >
              <RotateCwIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : null}
        {current ? (
          onOpenPreview ? (
            <button
              type="button"
              className="absolute inset-0 grid place-items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              aria-label={
                previewLabel ? previewLabel(position) : "放大名片图片"
              }
              onClick={(event) => onOpenPreview(position, event.currentTarget)}
            >
              <span
                className="absolute inset-0 block"
                style={rotationStyle}
                onTransitionEnd={(event) => {
                  if (event.propertyName !== "transform") return
                  if (spinning) settle()
                }}
              >
                <SlotImage
                  slot={current}
                  alt={role ? `名片${role}` : "名片图片"}
                  className="size-full object-contain"
                  onAspect={(ratio) =>
                    setPreviewAspect({ key: current.url, ratio })
                  }
                  onPainted={markPainted}
                />
              </span>
            </button>
          ) : (
            <span
              className="block size-full"
              style={rotationStyle}
              onTransitionEnd={(event) => {
                if (event.propertyName !== "transform") return
                if (spinning) settle()
              }}
            >
              <SlotImage
                slot={current}
                alt={role ? `名片${role}` : "名片图片"}
                className="size-full object-contain"
                onAspect={(ratio) =>
                  setPreviewAspect({ key: current.url, ratio })
                }
                onPainted={markPainted}
              />
            </span>
          )
        ) : (
          <button
            type="button"
            className="group grid size-full place-items-center px-6 text-center"
            disabled={disabled}
            onClick={() => pick(null)}
          >
            <span className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full border border-dashed bg-background shadow-sm group-hover:border-primary/60 group-focus-visible:border-primary/60 motion-safe:transition-colors">
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
        {current && !readOnly ? (
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
            turns={slotTurns(entry.index, entry.slot.url)}
            onPainted={markPainted}
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
              style={
                pendingTurns(rotations, drag.index) === 0
                  ? undefined
                  : {
                      transform: `rotate(${pendingTurns(rotations, drag.index) * 90}deg)`,
                    }
              }
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
            turns={slotTurns(entry.index, entry.slot.url)}
            onPainted={markPainted}
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

      {readOnly ? null : (
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
      )}
    </section>
  )
}

function pendingTurns(
  rotations: Readonly<Record<number, number>>,
  index: number
): number {
  return (((rotations[index] ?? 0) % 4) + 4) % 4
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
  turns,
  onPainted,
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
  /** 待保存的旋转圈数；缩略图与预览保持同一朝向。 */
  turns: number
  /** 该槽位的位图已经画上屏幕。 */
  onPainted: (url: string) => void
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
          roleLabel
            ? `第 ${index + 1} 张（${roleLabel}）`
            : `第 ${index + 1} 张`
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
          style={
            turns === 0 ? undefined : { transform: `rotate(${turns * 90}deg)` }
          }
          onPainted={onPainted}
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
