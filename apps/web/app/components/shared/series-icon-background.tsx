import { useEffect, useRef } from "react"

const seriesIcons = [
  { src: "/brand/series/765pro.png", width: 193, height: 150 },
  { src: "/brand/series/cinderella-girls.png", width: 193, height: 150 },
  { src: "/brand/series/million-live.png", width: 193, height: 150 },
  { src: "/brand/series/sidem.png", width: 193, height: 150 },
  { src: "/brand/series/shiny-colors.png", width: 193, height: 150 },
  { src: "/brand/series/gakuen.png", width: 659, height: 609 },
] as const

const motifCount = 18
const animationFrameDuration = 1000 / 30
const mobileBreakpoint = 640

type MovingMotif = {
  element: HTMLImageElement
  width: number
  height: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
}

function drawMotif(motif: MovingMotif) {
  motif.element.style.transform =
    `translate3d(${motif.x}px, ${motif.y}px, 0) ` +
    `rotate(${motif.rotation}deg)`
}

export function SeriesIconBackground() {
  const motifElements = useRef<Array<HTMLImageElement | null>>([])

  useEffect(() => {
    const motifs = motifElements.current.flatMap((element, index) => {
      if (!element) return []

      const icon = seriesIcons[index % seriesIcons.length]
      const aspectRatio = icon.width / icon.height
      const compactViewport = window.innerWidth < mobileBreakpoint
      const size = compactViewport
        ? 40 + Math.random() * 68
        : 52 + Math.random() * 96
      const estimatedWidth = size
      const estimatedHeight = size / aspectRatio
      const columnCount = compactViewport ? 3 : 6
      const rowCount = Math.ceil(motifCount / columnCount)
      const column = index % columnCount
      const row = Math.floor(index / columnCount)
      const cellWidth = window.innerWidth / columnCount
      const cellHeight = window.innerHeight / rowCount
      const x =
        column * cellWidth +
        Math.random() * Math.max(0, cellWidth - estimatedWidth)
      const y =
        row * cellHeight +
        Math.random() * Math.max(0, cellHeight - estimatedHeight)

      element.style.width = `${size}px`
      element.style.opacity = `${0.3 + Math.random() * 0.42}`

      return [
        {
          element,
          width: estimatedWidth,
          height: estimatedHeight,
          x,
          y,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          rotation: Math.random() * 360,
        },
      ]
    })

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    let animationFrame = 0
    let lastFrameTime: number | null = null
    let pointerPosition: { x: number; y: number } | null = null
    let viewportWidth = window.innerWidth
    let viewportHeight = window.innerHeight

    const keepInsideViewport = (motif: MovingMotif) => {
      const maxX = Math.max(0, viewportWidth - motif.width)
      const maxY = Math.max(0, viewportHeight - motif.height)

      if (motif.x <= 0 || motif.x >= maxX) motif.vx *= -1
      if (motif.y <= 0 || motif.y >= maxY) motif.vy *= -1
      motif.x = Math.min(Math.max(0, motif.x), maxX)
      motif.y = Math.min(Math.max(0, motif.y), maxY)
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
        if (pointerPosition) {
          const dx = motif.x + motif.width / 2 - pointerPosition.x
          const dy = motif.y + motif.height / 2 - pointerPosition.y
          const distance = Math.hypot(dx, dy)

          if (distance > 0 && distance < 120) {
            motif.vx += dx * 0.0005
            motif.vy += dy * 0.0005
          }
        }
        motif.x += motif.vx * frameScale
        motif.y += motif.vy * frameScale
        motif.rotation += 0.1 * frameScale
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
      motifs.forEach((motif) => {
        keepInsideViewport(motif)
        drawMotif(motif)
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

    motifs.forEach(drawMotif)
    window.addEventListener("resize", handleResize)
    if (!reduceMotion) {
      scheduleAnimation()
      document.addEventListener("pointermove", repelFromPointer)
      document.addEventListener("visibilitychange", handleVisibilityChange)
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
