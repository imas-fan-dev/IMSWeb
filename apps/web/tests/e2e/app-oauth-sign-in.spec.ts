import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import {
  installPlatformOAuthProvidersMock,
  platformOAuthProviderFixtures,
} from "./fixtures/platform-auth"
import { api, expect, test } from "./fixtures/test"

/**
 * App-target OAuth entry.
 *
 * A browser cannot complete the system-browser round trip, so this covers the
 * half the WebView owns: the provider entry is visible inside the packaged
 * shell, where it used to be switched off entirely. The deep-link return, the
 * one-time code exchange and the bearer session still need device evidence.
 */
test.describe("app OAuth sign-in entry", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !["app-iphone", "app-android", "app-webkit"].includes(
        testInfo.project.name
      ),
      "The app OAuth entry is covered on the three portrait App projects."
    )
    await page.addInitScript(() => {
      window.localStorage.setItem("imsweb.language", "zh-CN")
    })
    // The App shell loads the Wiki catalog for its own navigation.
    installEmptyWikiCatalogMock(api)
  })

  test(
    "offers the provider entry that the app used to hide",
    { tag: ["@app-iphone", "@app-android", "@app-webkit"] },
    async ({ page }) => {
      installPlatformOAuthProvidersMock(api, 1, platformOAuthProviderFixtures)

      await page.goto("/account/login")

      await expect(page.getByText("使用第三方帐号继续")).toBeVisible()
      // In the app a provider opens the system browser, so it is a button
      // rather than the document link the Web build renders.
      await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "事务所统一登录" })
      ).toBeVisible()
    }
  )

  test(
    "surfaces a failed hand-off instead of leaving a dead provider button",
    { tag: ["@app-iphone", "@app-android", "@app-webkit"] },
    async ({ page }) => {
      installPlatformOAuthProvidersMock(api, 1, platformOAuthProviderFixtures)

      await page.goto("/account/login")
      await page.getByRole("button", { name: "GitHub" }).click()

      // A browser is not a Tauri runtime, so the system-browser hand-off cannot
      // complete here and the click must report that rather than hang. The
      // waiting state behind it needs a simulator or device.
      await expect(
        page.getByText("第三方登录未完成，请重新尝试。")
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "取消" })
      ).toHaveCount(0)
      await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible()
    }
  )
})
