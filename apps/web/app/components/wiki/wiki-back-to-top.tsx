import { ArrowUpIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "~/lib/utils"

const BACK_TO_TOP_THRESHOLD = 320

export function WikiBackToTop({ variant }: { variant: "classic" | "modern" }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > BACK_TO_TOP_THRESHOLD)
    }
    updateVisibility()
    window.addEventListener("scroll", updateVisibility, { passive: true })
    return () => window.removeEventListener("scroll", updateVisibility)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className={cn(
        "fixed right-5 bottom-5 z-40 grid size-11 place-items-center rounded-full border bg-background text-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        variant === "classic" && "wiki-classic-back-to-top"
      )}
      aria-label="回到顶部"
      title="回到顶部"
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }}
    >
      <ArrowUpIcon className="size-5" aria-hidden="true" />
    </button>
  )
}
