import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import { CardImage } from "~/components/shared/card-image"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { useMediaQuery } from "~/lib/use-media-query"
import { cn } from "~/lib/utils"

import {
  CAROUSEL_AUTO_ADVANCE_MS,
  CAROUSEL_SWIPE_THRESHOLD_PX,
  REDUCED_MOTION_QUERY,
  clampCarouselIndex,
  nextAutoCarouselIndex,
  stepCarouselIndex,
} from "./card-carousel-model"

/** 一张预览页：单卡页是名片的各页，快速清单页是清单里的每张卡（只出正面）。 */
export interface CardCarouselSlide {
  key: string
  url: string
  alt: string
  /** 左下角角标，如「已拥有」。 */
  badge?: string | null
}

/**
 * 分享页的 1:1 预览轮播（prd R3）。
 *
 * 自动播放 4s 一张；指针悬停或触摸按下时暂停；`prefers-reduced-motion: reduce` 不自动。
 * 手动切换：指针横向划动 / 触摸滑动、左右箭头、指示点、键盘 `←`/`→`（容器可聚焦）。
 * 只有 1 张（或 0 张）时不渲染任何控件。
 *
 * 切换用整条轨道的 `translate3d` 过渡（300ms），自动与手动共用同一处；减少动态效果时不做过渡。
 */
export function CardCarousel({
  slides,
  className,
}: {
  slides: readonly CardCarouselSlide[]
  className?: string
}) {
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const current = clampCarouselIndex(index, count)
  const interactive = count > 1
  const autoPlay = interactive && !hovered && !pressed && !reduceMotion
  const swipeStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (!autoPlay) return
    const timer = window.setInterval(() => {
      setIndex((value) => nextAutoCarouselIndex(value, count) ?? value)
    }, CAROUSEL_AUTO_ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [autoPlay, count])

  function step(delta: number) {
    setIndex(stepCarouselIndex(current, delta, count))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // 触摸按下也算暂停：手指停在同一张上时不该继续自动翻页。
    setPressed(true)
    swipeStartRef.current = event.clientX
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current
    if (start === null) return
    const delta = event.clientX - start
    if (Math.abs(delta) < CAROUSEL_SWIPE_THRESHOLD_PX) return
    // 一次手势可以连续划过几张：锚点跟着指针走，把划动量留在开始位置会让第二张再也触发不了。
    swipeStartRef.current = event.clientX
    step(delta < 0 ? 1 : -1)
  }

  function endPointerInteraction() {
    swipeStartRef.current = null
    setPressed(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      step(-1)
      return
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      step(1)
    }
  }

  return (
    <div
      className={cn("min-w-0 space-y-3", className)}
      role="group"
      aria-label="名片预览"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        endPointerInteraction()
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={endPointerInteraction}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border bg-border touch-pan-y">
        {/*
          整条轨道横向平移一页的位置，切换（自动 / 划动 / 箭头 / 指示点 / 键盘）都走这一处过渡；
          `prefers-reduced-motion: reduce` 时不加过渡，直接落位。
        */}
        <div
          className="flex size-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(${-current * 100}%, 0, 0)` }}
        >
          {slides.map((item, position) => {
            // 只挂载当前页与左右各一页：轨道要它们来做过渡，其余留空占位。
            // 否则 20 张的快速清单会在打开瞬间把 20 张原图一起拉下来。
            const mounted = Math.abs(position - current) <= 1
            return (
              <div
                key={item.key}
                className="relative flex size-full shrink-0 items-center justify-center"
                aria-hidden={mounted ? undefined : true}
              >
                {mounted ? (
                  <CardImage
                    src={item.url}
                    alt={item.alt}
                    draggable={false}
                    className="max-h-full max-w-full border border-foreground/25 object-contain"
                  />
                ) : null}
                {mounted && item.badge ? (
                  <Badge className="absolute bottom-2 left-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
                    {item.badge}
                  </Badge>
                ) : null}
              </div>
            )
          })}
        </div>
        {interactive ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="上一张"
              disabled={current === 0}
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2"
              onClick={() => step(-1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="下一张"
              disabled={current === count - 1}
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
              onClick={() => step(1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
            <span className="absolute right-2 bottom-2 z-10 rounded-md border bg-background/90 px-2 py-0.5 text-xs tabular-nums shadow-sm">
              {current + 1}/{count}
            </span>
          </>
        ) : null}
      </div>
      {interactive ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {slides.map((item, position) => (
            <Button
              key={item.key}
              type="button"
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`第 ${position + 1} 张，共 ${count} 张`}
              aria-current={position === current ? "true" : undefined}
              onClick={() => setIndex(clampCarouselIndex(position, count))}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block size-2 rounded-full",
                  position === current ? "bg-primary" : "bg-border"
                )}
              />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
