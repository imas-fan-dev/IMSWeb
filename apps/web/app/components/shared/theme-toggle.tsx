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

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      <MoonIcon className="dark:hidden" aria-hidden="true" />
      <SunIcon className="hidden dark:block" aria-hidden="true" />
    </Button>
  )
}
