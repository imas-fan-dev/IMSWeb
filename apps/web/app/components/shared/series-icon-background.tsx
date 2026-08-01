import { useEffect, useRef } from "react"

import { seriesWallItems } from "~/lib/series-wall"

const seriesIcons = seriesWallItems.map((series) => ({
  src: series.icon,
  width: series.iconWidth,
  height: series.iconHeight,
}))

const motifCount = 12
const mobileMotifCount = 8
const animationFrameDuration = 1000 / 30
const mobileBreakpoint = 640
const pointerRadius = 120
const initialVelocityRange = 1.2
const maxVelocity = 0.96
const rotationPerFrame = 0.16

type MovingMotif = {
  element: HTMLImageElement
  index: number
  aspectRatio: number
  sizeFactor: number
  opacityFactor: number
  active: boolean
  width: number
  height: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function drawMotif(motif: MovingMotif) {
  motif.element.style.transform =
    `translate3d(${motif.x}px, ${motif.y}px, 0) ` +
    `rotate(${motif.rotation}deg)`
}

function getMotifWidth(sizeFactor: number, compactViewport: boolean) {
  return compactViewport ? 50 + sizeFactor * 48 : 68 + sizeFactor * 68
}

function updateMotifAppearance(motif: MovingMotif, compactViewport: boolean) {
  const width = getMotifWidth(motif.sizeFactor, compactViewport)
  const opacity = compactViewport
    ? 0.18 + motif.opacityFactor * 0.14
    : 0.22 + motif.opacityFactor * 0.2

  motif.width = width
  motif.height = width / motif.aspectRatio
  motif.active = motif.index < (compactViewport ? mobileMotifCount : motifCount)
  motif.element.hidden = !motif.active
  motif.element.style.width = `${width}px`
  motif.element.style.opacity = opacity.toFixed(3)
}

export function SeriesIconBackground() {
  const motifElements = useRef<Array<HTMLImageElement | null>>([])

  useEffect(() => {
    let viewportWidth = window.innerWidth
    let viewportHeight = window.innerHeight
    let compactViewport = viewportWidth < mobileBreakpoint

    const motifs = motifElements.current.flatMap((element, index) => {
      if (!element) return []

      const icon = seriesIcons[index % seriesIcons.length]
      const sizeFactor = Math.random()
      const opacityFactor = Math.random()
      const width = getMotifWidth(sizeFactor, compactViewport)
      const height = width / (icon.width / icon.height)
      const motif: MovingMotif = {
        element,
        index,
        aspectRatio: icon.width / icon.height,
        sizeFactor,
        opacityFactor,
        active: true,
        width,
        height,
        x: Math.random() * Math.max(0, viewportWidth - width),
        y: Math.random() * Math.max(0, viewportHeight - height),
        vx: (Math.random() - 0.5) * initialVelocityRange,
        vy: (Math.random() - 0.5) * initialVelocityRange,
        rotation: Math.random() * 360,
      }

      updateMotifAppearance(motif, compactViewport)
      return [motif]
    })

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    const supportsPointerRepulsion =
      window.matchMedia?.("(pointer: fine)").matches ?? true
    let animationFrame = 0
    let lastFrameTime: number | null = null
    let pointerPosition: { x: number; y: number } | null = null

    const keepInsideViewport = (motif: MovingMotif) => {
      const maxX = Math.max(0, viewportWidth - motif.width)
      const maxY = Math.max(0, viewportHeight - motif.height)

      if ((motif.x <= 0 && motif.vx < 0) || (motif.x >= maxX && motif.vx > 0)) {
        motif.vx *= -1
      }
      if ((motif.y <= 0 && motif.vy < 0) || (motif.y >= maxY && motif.vy > 0)) {
        motif.vy *= -1
      }
      motif.x = clamp(motif.x, 0, maxX)
      motif.y = clamp(motif.y, 0, maxY)
    }

    const scheduleAnimation = () => {
      if (!animationFrame && document.visibilityState !== "hidden") {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }

    const animate = (timestamp: number) => {
      animationFrame = 0
      const elapsed =
        lastFrameTime === null ? Infinity : timestamp - lastFrameTime
      if (elapsed < animationFrameDuration) {
        scheduleAnimation()
        return
      }

      const frameScale =
        lastFrameTime === null ? 1 : Math.min(3, elapsed / (1000 / 60))
      motifs.forEach((motif) => {
        if (!motif.active) return

        if (pointerPosition) {
          const dx = motif.x + motif.width / 2 - pointerPosition.x
          const dy = motif.y + motif.height / 2 - pointerPosition.y
          const distance = Math.hypot(dx, dy)

          if (distance > 0 && distance < pointerRadius) {
            motif.vx = clamp(motif.vx + dx * 0.0005, -maxVelocity, maxVelocity)
            motif.vy = clamp(motif.vy + dy * 0.0005, -maxVelocity, maxVelocity)
          }
        }
        motif.x += motif.vx * frameScale
        motif.y += motif.vy * frameScale
        motif.rotation = (motif.rotation + rotationPerFrame * frameScale) % 360
        keepInsideViewport(motif)
        drawMotif(motif)
      })
      pointerPosition = null
      lastFrameTime = timestamp
      scheduleAnimation()
    }

    const repelFromPointer = (event: PointerEvent) => {
      pointerPosition = { x: event.clientX, y: event.clientY }
    }

    const handleResize = () => {
      viewportWidth = window.innerWidth
      viewportHeight = window.innerHeight
      compactViewport = viewportWidth < mobileBreakpoint
      motifs.forEach((motif) => {
        updateMotifAppearance(motif, compactViewport)
        keepInsideViewport(motif)
        if (motif.active) drawMotif(motif)
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
        return
      }
      lastFrameTime = null
      scheduleAnimation()
    }

    motifs.forEach((motif) => {
      if (motif.active) drawMotif(motif)
    })
    window.addEventListener("resize", handleResize, { passive: true })
    if (!reduceMotion) {
      scheduleAnimation()
      document.addEventListener("visibilitychange", handleVisibilityChange)
      if (supportsPointerRepulsion) {
        document.addEventListener("pointermove", repelFromPointer, {
          passive: true,
        })
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", handleResize)
      document.removeEventListener("pointermove", repelFromPointer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return (
    <div
      className="series-icon-background"
      data-testid="series-icon-background"
      aria-hidden="true"
    >
      {Array.from({ length: motifCount }, (_, index) => {
        const icon = seriesIcons[index % seriesIcons.length]

        return (
          <img
            key={index}
            ref={(element) => {
              motifElements.current[index] = element
            }}
            className="series-icon-motif"
            src={icon.src}
            alt=""
            width={icon.width}
            height={icon.height}
            draggable={false}
            decoding="async"
            fetchPriority="low"
          />
        )
      })}
    </div>
  )
}
