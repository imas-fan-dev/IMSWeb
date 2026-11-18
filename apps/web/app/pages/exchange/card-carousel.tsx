import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
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
  CAROUSEL_TRANSITION_MS,
  REDUCED_MOTION_QUERY,
  carouselTeleportTarget,
  carouselTrackIndex,
  carouselTrackPosition,
  shouldStepCarousel,
} from "./card-carousel-model"

/** 一张预览页：单卡页是名片的各页，快速清单页是清单里的每张卡（只出正面）。 */
export interface CardCarouselSlide {
  key: string
  url: string
  alt: string
  /** 左下角角标，如「已拥有」。 */
  badge?: string | null
}

/** 有光标（鼠标 / 触控板）的设备才把箭头藏起来等悬停；触屏上没有悬停，藏了就点不到。 */
const HOVER_CAPABLE_QUERY = "(hover: hover)"

/**
 * 分享页的 1:1 预览轮播（prd R3/R6）。
 *
 * 自动播放 4s 一张、首尾循环；指针悬停或触摸按下时暂停；`prefers-reduced-motion: reduce` 不自动。
 * 手动切换：指针横向划动 / 触摸滑动（图片跟着光标走，松手决定换张还是弹回）、左右箭头
 * （默认隐藏，悬停或键盘聚焦时渐显）、指示点、键盘 `←`/`→`（容器可聚焦）。
 * 只有 1 张（或 0 张）时不循环、也不渲染任何控件。
 *
 * 循环靠轨道首尾各挂一个克隆格实现：拖动到两端时相邻张才露得出来；停稳后无过渡地瞬移回
 * 等价真身格，否则下一步会走出轨道。切换与瞬移的时长共用 `CAROUSEL_TRANSITION_MS`。
 */
export function CardCarousel({
  slides,
  className,
}: {
  slides: readonly CardCarouselSlide[]
  className?: string
}) {
  const count = slides.length
  const loop = count > 1
  const [track, setTrack] = useState(() => carouselTrackPosition(0, count, loop))
  const [offset, setOffset] = useState(0)
  const [instant, setInstant] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const hoverCapable = useMediaQuery(HOVER_CAPABLE_QUERY)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    lastX: number
    startedAt: number
  } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const settleRef = useRef<number | null>(null)

  const current = carouselTrackIndex(track, count, loop)
  const autoPlay = loop && !hovered && !pressed && !reduceMotion

  /** 轨道格子：循环时首尾各一个克隆（末 → 首、首 → 末）。 */
  const tiles = useMemo(() => {
    const positions = Array.from({ length: count }, (_, position) => position)
    return loop ? [count - 1, ...positions, 0] : positions
  }, [count, loop])

  const clearSettle = useCallback(() => {
    if (settleRef.current === null) return
    window.clearTimeout(settleRef.current)
    settleRef.current = null
  }, [])

  const settle = useCallback(
    (position: number) => {
      clearSettle()
      const target = carouselTeleportTarget(position, count, loop)
      if (target === null) return
      settleRef.current = window.setTimeout(
        () => {
          settleRef.current = null
          setInstant(true)
          setTrack(target)
          // 下一帧恢复过渡：瞬移这一帧必须不带动画，否则会看到一段回卷。
          window.requestAnimationFrame(() => setInstant(false))
        },
        reduceMotion ? 0 : CAROUSEL_TRANSITION_MS
      )
    },
    [clearSettle, count, loop, reduceMotion]
  )

  /** 落到某个轨道格：箭头 / 划动松手 / 键盘都走这里（`position` 可以是克隆格）。 */
  const moveTo = useCallback(
    (position: number) => {
      setInstant(false)
      setOffset(0)
      setTrack(position)
      settle(position)
    },
    [settle]
  )

  useEffect(() => {
    if (!autoPlay) return
    const timer = window.setTimeout(
      () => moveTo(track + 1),
      CAROUSEL_AUTO_ADVANCE_MS
    )
    return () => window.clearTimeout(timer)
  }, [autoPlay, moveTo, track])

  useEffect(() => clearSettle, [clearSettle])

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!loop) return
    // 按在箭头 / 指示点这类控件上时不进拖动（也不捕获指针）：捕获会把 pointerup 重定向到容器，
    // 随之产生的 click 就落到容器上，按钮的 onClick 不再触发（实测箭头点不动）。
    if ((event.target as HTMLElement | null)?.closest("button")) return
    // 触摸按下也算暂停：手指停在同一张上时不该继续自动翻页。
    setPressed(true)
    setDragging(true)
    // 拖动期间不加过渡：否则每次 pointermove 的位移都会被 300ms 动画吃掉，
    // 图片只能以「比例」追赶光标（实测拖 120px 才走 72px），看起来就是划不动。
    setInstant(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      startedAt: performance.now(),
    }
    // 抓住指针：拖到元素外面也照样收得到 move / up（否则松手落在外面就丢一次划动）。
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件或指针已失效时拿不到捕获，退回元素上的事件即可。
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.lastX = event.clientX
    // 图片跟着光标 / 手指走（像素偏移与指针位移 1:1）；松手再决定换一张还是弹回。
    setOffset(event.clientX - drag.startX)
  }

  function endPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag && drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    setPressed(false)
    if (!drag) return
    const dx = drag.lastX - drag.startX
    const width = previewRef.current?.clientWidth ?? 0
    if (
      shouldStepCarousel({
        dx,
        elapsedMs: performance.now() - drag.startedAt,
        width,
      })
    ) {
      moveTo(track + (dx < 0 ? 1 : -1))
      return
    }
    setInstant(false)
    setOffset(0)
  }

  function cancelPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (drag && drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    setPressed(false)
    setInstant(false)
    setOffset(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      moveTo(track - 1)
      return
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      moveTo(track + 1)
    }
  }

  return (
    <div
      className={cn("group/carousel min-w-0 space-y-3", className)}
      role="group"
      aria-label="名片预览"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={() => {
        // 只收悬停态：拖动由指针捕获托管，松手落在元素外面也要照常结算。
        setHovered(false)
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={cancelPointerInteraction}
    >
      <div
        ref={previewRef}
        className={cn(
          "relative aspect-square overflow-hidden rounded-xl border bg-border touch-pan-y",
          loop && (dragging ? "cursor-grabbing" : "cursor-grab")
        )}
      >
        {/*
          整条轨道横向平移：格子用百分比、拖动用像素偏移，切换（自动 / 箭头 / 指示点 / 键盘）
          与松手落位都走这一处过渡；`prefers-reduced-motion: reduce` 与克隆格瞬移都不带过渡。
        */}
        <div
          data-slot="carousel-track"
          className={cn(
            "flex size-full ease-out",
            instant
              ? "transition-none"
              : "transition-transform motion-reduce:transition-none"
          )}
          style={{
            transform: `translate3d(calc(${-track * 100}% + ${offset}px), 0, 0)`,
            ...(instant
              ? {}
              : { transitionDuration: `${CAROUSEL_TRANSITION_MS}ms` }),
          }}
        >
          {tiles.map((slideIndex, position) => {
            const item = slides[slideIndex]
            // 只挂载当前格与左右各一格：轨道要它们做过渡，其余留空占位。
            // 否则 20 张的快速清单会在打开瞬间把 20 张原图一起拉下来。
            const near = Math.abs(position - track) <= 1
            const clone = loop && (position === 0 || position === tiles.length - 1)
            return (
              <div
                key={`${item?.key ?? position}@${position}`}
                data-slot="carousel-slide"
                data-active={position === track ? "true" : undefined}
                className="relative flex size-full shrink-0 items-center justify-center"
                aria-hidden={!near || clone ? true : undefined}
              >
                {near && item ? (
                  <CardImage
                    src={item.url}
                    // 克隆是同一张的副本：空 alt 免得读屏与 `img` 查询把一张算成两张。
                    alt={clone ? "" : item.alt}
                    draggable={false}
                    className="max-h-full max-w-full border border-foreground/25 object-contain"
                  />
                ) : null}
                {near && item?.badge ? (
                  <Badge className="absolute bottom-2 left-2 z-10 gap-1 border-border bg-background/90 text-foreground shadow-sm">
                    {item.badge}
                  </Badge>
                ) : null}
              </div>
            )
          })}
        </div>
        {loop ? (
          <div
            className={cn(
              // 默认隐藏，悬停或键盘聚焦时渐显；没有悬停能力的设备一直显示。
              "pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2 transition-opacity duration-200 group-hover/carousel:opacity-100 focus-within:opacity-100 motion-reduce:transition-none",
              hoverCapable ? "opacity-0" : "opacity-100"
            )}
          >
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="上一张"
              className="pointer-events-auto"
              onClick={() => moveTo(track - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="下一张"
              className="pointer-events-auto"
              onClick={() => moveTo(track + 1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {loop ? (
          <span className="absolute right-2 bottom-2 z-10 rounded-md border bg-background/90 px-2 py-0.5 text-xs tabular-nums shadow-sm">
            {current + 1}/{count}
          </span>
        ) : null}
      </div>
      {loop ? (
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
              onClick={() => moveTo(carouselTrackPosition(position, count, loop))}
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
