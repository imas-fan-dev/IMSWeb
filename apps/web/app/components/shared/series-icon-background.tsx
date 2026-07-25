import { useEffect, useRef } from "react"

const seriesIcons = [
  { src: "/brand/series/765pro.png", width: 193, height: 150 },
  { src: "/brand/series/cinderella-girls.png", width: 193, height: 150 },
  { src: "/brand/series/million-live.png", width: 193, height: 150 },
  { src: "/brand/series/sidem.png", width: 193, height: 150 },
  { src: "/brand/series/shiny-colors.png", width: 193, height: 150 },
  { src: "/brand/series/gakuen.png", width: 659, height: 609 },
] as const

const motifCount = 20

type MovingMotif = {
  element: HTMLImageElement
  size: number
  aspectRatio: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
}

function motifBounds(motif: MovingMotif) {
  return {
    width: motif.element.offsetWidth || motif.size,
    height: motif.element.offsetHeight || motif.size / motif.aspectRatio,
  }
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
      const size = 30 + Math.random() * 70
      const estimatedWidth = size
      const estimatedHeight = size / aspectRatio
      const x = Math.random() * Math.max(0, window.innerWidth - estimatedWidth)
      const y =
        Math.random() * Math.max(0, window.innerHeight - estimatedHeight)

      element.style.width = `${size}px`
      element.style.opacity = `${0.22 + Math.random() * 0.38}`

      return [
        {
          element,
          size,
          aspectRatio,
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

    const keepInsideViewport = (motif: MovingMotif) => {
      const bounds = motifBounds(motif)
      const maxX = Math.max(0, window.innerWidth - bounds.width)
      const maxY = Math.max(0, window.innerHeight - bounds.height)

      if (motif.x <= 0 || motif.x >= maxX) motif.vx *= -1
      if (motif.y <= 0 || motif.y >= maxY) motif.vy *= -1
      motif.x = Math.min(Math.max(0, motif.x), maxX)
      motif.y = Math.min(Math.max(0, motif.y), maxY)
    }

    const animate = () => {
      motifs.forEach((motif) => {
        motif.x += motif.vx
        motif.y += motif.vy
        motif.rotation += 0.1
        keepInsideViewport(motif)
        drawMotif(motif)
      })
      animationFrame = window.requestAnimationFrame(animate)
    }

    const repelFromPointer = (event: PointerEvent) => {
      motifs.forEach((motif) => {
        const bounds = motifBounds(motif)
        const dx = motif.x + bounds.width / 2 - event.clientX
        const dy = motif.y + bounds.height / 2 - event.clientY
        const distance = Math.hypot(dx, dy)

        if (distance > 0 && distance < 120) {
          motif.vx += dx * 0.0005
          motif.vy += dy * 0.0005
        }
      })
    }

    const handleResize = () => {
      motifs.forEach((motif) => {
        keepInsideViewport(motif)
        drawMotif(motif)
      })
    }

    motifs.forEach(drawMotif)
    window.addEventListener("resize", handleResize)
    if (!reduceMotion) {
      animationFrame = window.requestAnimationFrame(animate)
      document.addEventListener("pointermove", repelFromPointer)
    }

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", handleResize)
      document.removeEventListener("pointermove", repelFromPointer)
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
