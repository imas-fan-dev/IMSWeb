import { LanguagesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { i18n } from "~/i18n/config"
import { resolveLanguage } from "~/i18n/language"
import type { SupportedLanguage } from "~/i18n/resources"

const nextLanguage: Record<SupportedLanguage, SupportedLanguage> = {
  "zh-CN": "en",
  en: "zh-CN",
}

export function LanguageSwitcher() {
  const { i18n: activeI18n, t } = useTranslation()
  const currentLanguage = resolveLanguage([
    activeI18n.resolvedLanguage,
    activeI18n.language,
  ])
  const targetLanguage = nextLanguage[currentLanguage]
  const label = t("language.switchTo", {
    language: t(`language.names.${targetLanguage}`),
  })

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      onClick={() => void i18n.changeLanguage(targetLanguage)}
      aria-label={label}
      title={label}
    >
      <LanguagesIcon aria-hidden="true" />
    </Button>
  )
}
