import { ArrowUpIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

const BACK_TO_TOP_THRESHOLD = 320

export function BackToTop({ className }: { className?: string }) {
  const { t } = useTranslation()
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

  const label = t("accessibility.backToTop")

  return (
    <button
      type="button"
      className={cn(
        "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 grid size-11 place-items-center rounded-full border bg-background text-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className
      )}
      aria-label={label}
      title={label}
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
