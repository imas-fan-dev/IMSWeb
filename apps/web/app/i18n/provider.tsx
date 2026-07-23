import { useEffect, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { i18n } from "./config"
import {
  detectBrowserLanguage,
  persistLanguage,
  resolveLanguage,
} from "./language"
import { defaultNamespace } from "./resources"

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      persistLanguage(resolveLanguage([language]))
    }

    i18n.on("languageChanged", handleLanguageChanged)
    void i18n.changeLanguage(detectBrowserLanguage())

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
