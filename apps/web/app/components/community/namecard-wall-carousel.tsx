import { ImagesIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

export type NamecardWallSide = "front" | "back"

/** 只画正面与背面；中间页留给详情里的全屏预览。 */
export interface NamecardWallCarouselPage {
  pageId: string
  role: "front" | "back" | "middle"
  /** 原图或预览图，缩略图加载失败时回退到它。 */
  url: string
  thumbUrl: string
}

interface Slide {
  side: NamecardWallSide
  label: string
  page: NamecardWallCarouselPage
}

function carouselSlides(
  pages: readonly NamecardWallCarouselPage[]
): Slide[] {
  const front = pages.find((page) => page.role === "front")
  const back = pages.find((page) => page.role === "back")
  return [
    front ? { side: "front" as const, label: "正面", page: front } : null,
    back ? { side: "back" as const, label: "背面", page: back } : null,
  ].filter((slide): slide is Slide => slide !== null)
}

const SWIPE_RATIO = 0.18
const TAP_SLOP_PX = 4

/**
 * 名片墙瓦片的 1:1 轮播：正/背两页，图片跟着指针走，松手决定翻页或弹回。
 *
 * 与分享页 `CardCarousel` 同一套交互：不用 `scroll-snap`（程序化滚动会被强制
 * 吸附回原位，拖动时看起来「不跟手」），而是平移轨道 + 位移阈值。
 * 单击（位移小于 4px）打开详情，键盘 Enter/Space 同样生效。
 *
 * 不自动播放：墙上是瀑布流，自动翻动会打断阅读。
 */
export function NamecardWallCarousel({
  pages,
  cardNumber,
  pageCount,
  onOpen,
  className,
}: {
  pages: readonly NamecardWallCarouselPage[]
  /** 墙上展示的编号，用于图片的可读描述。 */
  cardNumber: number
  /** 总页数（含中间页）；缺省按可见页数算，单面名片不出现角标。 */
  pageCount?: number
  onOpen: (side: NamecardWallSide) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startedAt: number
    moved: boolean
    side: NamecardWallSide
  } | null>(null)
  const suppressClickRef = useRef(false)
  const slides = carouselSlides(pages)
  const loop = slides.length > 1
  const totalPages = pageCount ?? pages.length
  // 循环：轨道首尾各挂一个克隆格（与分享页 CardCarousel 同一手法）。
  const trackSlides = loop
    ? [
        { slide: slides[slides.length - 1], clone: true },
        ...slides.map((slide) => ({ slide, clone: false })),
        { slide: slides[0], clone: true },
      ]
    : slides.map((slide) => ({ slide, clone: false }))
  const [track, setTrack] = useState(loop ? 1 : 0)
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(true)
  const index = loop
    ? ((track - 1) % slides.length + slides.length) % slides.length
    : 0

  // 停在克隆格上时无动画地瞬移回等价真身，否则下一步会走出轨道。
  useEffect(() => {
    if (!loop) return
    if (track === 0 || track === slides.length + 1) {
      const timer = window.setTimeout(() => {
        setAnimate(false)
        setTrack(track === 0 ? slides.length : 1)
      }, 320)
      return () => window.clearTimeout(timer)
    }
  }, [loop, track, slides.length])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-wall-slide]"
    )
    if (!target) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      moved: false,
      side: target.dataset.wallSlide as NamecardWallSide,
    }
    // 拖动期间关掉过渡，否则每次 move 的位移都会被动画吃掉，看起来不跟手。
    setAnimate(false)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件或指针已失效时拿不到捕获，退回元素上的事件即可。
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    if (Math.abs(dx) > TAP_SLOP_PX) drag.moved = true
    setOffset(dx)
  }

  function endPointerInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setAnimate(true)
    const dx = event.clientX - drag.startX
    const width = containerRef.current?.clientWidth ?? 0
    const flick =
      drag.moved &&
      Math.abs(dx) > Math.max(24, width * SWIPE_RATIO) &&
      performance.now() - drag.startedAt < 900
    if (flick) {
      setTrack((current) => {
        const next = current + (dx < 0 ? 1 : -1)
        return loop
          ? Math.min(Math.max(next, 0), slides.length + 1)
          : Math.min(Math.max(next, 0), slides.length - 1)
      })
    } else if (!drag.moved) {
      onOpen(drag.side)
    }
    // 指针路径已处理打开/翻页：随后的原生 click 一律吞掉，避免详情开两次。
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
    setOffset(0)
  }

  function cancelPointerInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setAnimate(true)
    setOffset(0)
  }

  function goTo(next: number) {
    setAnimate(true)
    setTrack(loop ? next + 1 : next)
    setOffset(0)
  }

  if (slides.length === 0) {
    return (
      <div
        data-namecard-carousel="empty"
        className={cn("aspect-square rounded-md bg-muted", className)}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      data-namecard-carousel={slides.length > 1 ? "multi" : "single"}
      className={cn(
        "relative aspect-square overflow-hidden rounded-md bg-muted touch-pan-y",
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={cancelPointerInteraction}
    >
      <div
        className={cn(
          "flex size-full will-change-transform",
          animate && "transition-transform duration-300 ease-out motion-reduce:transition-none",
          slides.length > 1 && "cursor-grab active:cursor-grabbing"
        )}
        style={{ transform: `translate3d(calc(${-track * 100}% + ${offset}px), 0, 0)` }}
      >
        {trackSlides.map(({ slide, clone }, position) => (
          <button
            key={`${position}-${slide.side}`}
            type="button"
            data-wall-slide={slide.side}
            aria-hidden={clone || undefined}
            tabIndex={clone ? -1 : undefined}
            aria-label={`查看制作人名片 ${cardNumber} ${slide.label}`}
            title="查看名片详情"
            className="relative size-full shrink-0 overflow-hidden bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              onOpen(slide.side)
            }}
          >
            <CarouselSlideImage
              thumbnail={slide.page.thumbUrl}
              original={slide.page.url}
              label={slide.label}
            />
          </button>
        ))}
      </div>

      {slides.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-0.5">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.side}
              type="button"
              className="grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`查看${slide.label}`}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => goTo(slideIndex)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full border border-background/70 bg-background/60 transition-colors",
                  slideIndex === index ? "bg-primary" : "hover:bg-background"
                )}
              />
            </button>
          ))}
        </div>
      ) : null}

      {totalPages > 2 ? (
        <Badge
          className="pointer-events-none absolute top-2 right-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm"
          aria-label={`共 ${totalPages} 页`}
          title={`共 ${totalPages} 页`}
        >
          <ImagesIcon aria-hidden="true" />
          {totalPages}
        </Badge>
      ) : null}
    </div>
  )
}

function CarouselSlideImage({
  thumbnail,
  original,
  label,
}: {
  thumbnail: string
  original: string
  label: string
}) {
  const [image, setImage] = useState({
    src: thumbnail,
    failed: false,
  })

  if (image.failed) {
    return (
      <span
        role="alert"
        className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground"
      >
        图片暂时无法显示
      </span>
    )
  }

  return (
    <img
      draggable={false}
      src={image.src}
      alt={`名片${label}`}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-contain"
      onError={() => {
        if (image.src === original) {
          setImage({ src: original, failed: true })
          return
        }
        setImage({ src: original, failed: false })
      }}
    />
  )
}
