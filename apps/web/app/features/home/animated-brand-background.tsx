import { useEffect, useRef } from "react"

const backgroundLogos = [
  "/assets/images/Production/765PRO.png",
  "/assets/images/Production/CinderellaGirls.png",
  "/assets/images/Production/Million.png",
  "/assets/images/Production/SideM.png",
  "/assets/images/Production/Shinycolors.png",
  "/assets/images/Production/Gakuen.png",
] as const

const motifCount = 20

type MovingMotif = {
  element: HTMLImageElement
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
}

function drawMotif(motif: MovingMotif) {
  motif.element.style.transform = `translate(${motif.x}px, ${motif.y}px) rotate(${motif.rotation}deg)`
}

export function AnimatedBrandBackground() {
  const motifElements = useRef<Array<HTMLImageElement | null>>([])

  useEffect(() => {
    const motifs = motifElements.current.flatMap((element) => {
      if (!element) return []

      const source =
        backgroundLogos[Math.floor(Math.random() * backgroundLogos.length)]
      const size = 30 + Math.random() * 70
      const x = Math.random() * window.innerWidth
      const y = Math.random() * window.innerHeight
      const opacity = 0.3 + Math.random() * 0.7

      element.src = source
      element.style.width = `${size}px`
      element.style.opacity = `${opacity}`

      return [
        {
          element,
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

    const animate = () => {
      motifs.forEach((motif) => {
        motif.x += motif.vx
        motif.y += motif.vy
        motif.rotation += 0.1

        if (
          motif.x < 0 ||
          motif.x > window.innerWidth - motif.element.offsetWidth
        ) {
          motif.vx *= -1
        }
        if (
          motif.y < 0 ||
          motif.y > window.innerHeight - motif.element.offsetHeight
        ) {
          motif.vy *= -1
        }

        drawMotif(motif)
      })
      animationFrame = window.requestAnimationFrame(animate)
    }

    const repelFromPointer = (event: MouseEvent) => {
      motifs.forEach((motif) => {
        const dx = motif.x - event.clientX
        const dy = motif.y - event.clientY
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < 120) {
          motif.vx += dx * 0.0005
          motif.vy += dy * 0.0005
        }
      })
    }

    if (reduceMotion) {
      motifs.forEach(drawMotif)
    } else {
      animate()
      document.addEventListener("mousemove", repelFromPointer)
    }

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener("mousemove", repelFromPointer)
    }
  }, [])

  return (
    <div
      className="home-brand-background"
      data-testid="home-brand-background"
      aria-hidden="true"
    >
      {Array.from({ length: motifCount }, (_, index) => (
        <img
          key={index}
          ref={(element) => {
            motifElements.current[index] = element
          }}
          src={backgroundLogos[index % backgroundLogos.length]}
          alt=""
          width="193"
          height="150"
          draggable={false}
          decoding="async"
          fetchPriority="low"
          className="home-brand-motif"
        />
      ))}
    </div>
  )
}
