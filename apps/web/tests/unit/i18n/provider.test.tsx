import { act, render, screen, waitFor } from "@testing-library/react"
import { useTranslation } from "react-i18next"
import { beforeEach, describe, expect, it } from "vitest"

import { i18n } from "~/i18n/config"
import { languageStorageKey } from "~/i18n/language"
import { I18nProvider } from "~/i18n/provider"
import { defaultLanguage } from "~/i18n/resources"

function TranslationProbe() {
  const { t } = useTranslation()

  return <p>{t("navigation.home")}</p>
}

describe("I18nProvider", () => {
  beforeEach(async () => {
    window.localStorage.clear()
    document.documentElement.lang = defaultLanguage
    await i18n.changeLanguage(defaultLanguage)
  })

  it("ignores stored and requested languages while Chinese is fixed", async () => {
    window.localStorage.setItem(languageStorageKey, "en")
    await i18n.changeLanguage("en")

    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>
    )

    expect(await screen.findByText("首页")).toBeInTheDocument()
    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("zh-CN")
      expect(window.localStorage.getItem(languageStorageKey)).toBe("zh-CN")
      expect(document.documentElement.lang).toBe("zh-CN")
    })

    await act(() => i18n.changeLanguage("en"))

    expect(screen.getByText("首页")).toBeInTheDocument()
    await waitFor(() => expect(i18n.language).toBe("zh-CN"))
  })
})
