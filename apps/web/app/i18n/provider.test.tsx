import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { useTranslation } from "react-i18next"
import { beforeEach, describe, expect, it } from "vitest"

import { LanguageSwitcher } from "~/components/shared/language-switcher"
import { i18n } from "./config"
import { languageStorageKey } from "./language"
import { I18nProvider } from "./provider"
import { defaultLanguage } from "./resources"

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

  it("restores, switches, and persists the selected language", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(languageStorageKey, "en")

    render(
      <I18nProvider>
        <LanguageSwitcher />
        <TranslationProbe />
      </I18nProvider>
    )

    expect(await screen.findByText("Home")).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("en")

    await user.click(screen.getByRole("button", { name: "Switch to 简体中文" }))

    expect(await screen.findByText("首页")).toBeInTheDocument()
    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("zh-CN")
      expect(window.localStorage.getItem(languageStorageKey)).toBe("zh-CN")
      expect(document.documentElement.lang).toBe("zh-CN")
    })
  })
})
