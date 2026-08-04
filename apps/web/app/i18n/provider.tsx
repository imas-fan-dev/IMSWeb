import { useEffect, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { i18n } from "./config"
import { persistLanguage } from "./language"
import { defaultLanguage, defaultNamespace } from "./resources"

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      persistLanguage(defaultLanguage)
      if (language !== defaultLanguage) {
        void i18n.changeLanguage(defaultLanguage)
      }
    }

    i18n.on("languageChanged", handleLanguageChanged)
    handleLanguageChanged(i18n.language)

    return () => {
      i18n.off("languageChanged", handleLanguageChanged)
    }
  }, [])

  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  )
}
