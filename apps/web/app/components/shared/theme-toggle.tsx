import { MoonIcon, SunIcon } from "lucide-react"
import { useEffect } from "react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

const themeColors = {
  dark: "#171717",
  light: "#fdfdfb",
} as const

const fallbackTransitionDuration = 300
const revealTransitionDuration = 500
let themeTransitionTimer: number | undefined
let activeViewTransition: ViewTransition | undefined
let themeTransitionSequence = 0

type ThemeName = "dark" | "light"

type ThemeTransitionOrigin = {
  x: number
  y: number
}

function themeIsApplied(theme: ThemeName) {
  return (
    document.documentElement.classList.contains("dark") === (theme === "dark")
  )
}

function setThemeAndWait(theme: ThemeName, setTheme: (theme: string) => void) {
  return new Promise<void>((resolve) => {
    const timeout: { id?: number } = {}
    const observer = new MutationObserver(() => {
      if (themeIsApplied(theme)) finish()
    })
    const finish = () => {
      observer.disconnect()
      if (timeout.id !== undefined) window.clearTimeout(timeout.id)
      resolve()
    }

    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    })
    setTheme(theme)

    if (themeIsApplied(theme)) {
      finish()
      return
    }

    timeout.id = window.setTimeout(finish, 100)
  })
}

function startFallbackTransition(
  theme: ThemeName,
  setTheme: (theme: string) => void,
  sequence: number
) {
  const root = document.documentElement

  root.dataset.themeTransition = "fade"
  setTheme(theme)
  themeTransitionTimer = window.setTimeout(() => {
    if (sequence === themeTransitionSequence) {
      delete root.dataset.themeTransition
    }
    themeTransitionTimer = undefined
  }, fallbackTransitionDuration)
}

function changeThemeWithTransition(
  theme: ThemeName,
  setTheme: (theme: string) => void,
  origin: ThemeTransitionOrigin
) {
  const root = document.documentElement
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const sequence = ++themeTransitionSequence

  if (themeTransitionTimer !== undefined) {
    window.clearTimeout(themeTransitionTimer)
    themeTransitionTimer = undefined
  }
  activeViewTransition?.skipTransition()
  activeViewTransition = undefined

  if (reduceMotion) {
    delete root.dataset.themeTransition
    setTheme(theme)
    return
  }

  if (
    typeof document.startViewTransition !== "function" ||
    typeof root.animate !== "function"
  ) {
    startFallbackTransition(theme, setTheme, sequence)
    return
  }

  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y)
  )

  root.dataset.themeTransition = "circle"
  const transition = document.startViewTransition(() =>
    setThemeAndWait(theme, setTheme)
  )
  activeViewTransition = transition

  void (async () => {
    try {
      await transition.ready
      if (sequence !== themeTransitionSequence) return

      const reveal = root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: revealTransitionDuration,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      )

      await Promise.allSettled([reveal.finished, transition.finished])
    } catch {
      if (sequence === themeTransitionSequence) setTheme(theme)
    } finally {
      if (sequence === themeTransitionSequence) {
        delete root.dataset.themeTransition
        activeViewTransition = undefined
      }
    }
  })()
}

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )
    if (!themeColor || !resolvedTheme) return

    themeColor.content =
      resolvedTheme === "dark" ? themeColors.dark : themeColors.light
  }, [resolvedTheme])

  return null
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const label = t("theme.toggle")
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        changeThemeWithTransition(nextTheme, setTheme, {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        })
      }}
      aria-label={label}
      title={label}
    >
      <span className="relative flex size-4 items-center justify-center">
        <MoonIcon
          className="transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none dark:scale-75 dark:rotate-90 dark:opacity-0"
          aria-hidden="true"
        />
        <SunIcon
          className="absolute scale-75 -rotate-90 opacity-0 transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none dark:scale-100 dark:rotate-0 dark:opacity-100"
          aria-hidden="true"
        />
      </span>
    </Button>
  )
}
