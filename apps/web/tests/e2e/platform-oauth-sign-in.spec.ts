import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import {
  installPlatformOAuthProvidersMock,
  installRecoveringPlatformOAuthProvidersMock,
  platformOAuthProviderFixtures,
} from "./fixtures/platform-auth"
import { api, expect, test } from "./fixtures/test"

/**
 * The OAuth entry on the login screen.
 *
 * The provider round trip needs a real provider, so these tests stop at what the
 * Web build owns: which providers are offered, where a button sends the
 * browser, and what the user sees when the provider list cannot be read or when
 * the API hands a failed round trip back through `?oauth=<reason>`.
 *
 * The provider list is installed per test rather than in `beforeEach`, because
 * the retry case needs two registrations for the same endpoint.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  installEmptyWikiCatalogMock(api)
})

test(
  "offers every enabled provider and links it to its start route",
  { tag: "@playwright" },
  async ({ page }) => {
    installPlatformOAuthProvidersMock(api, 1, platformOAuthProviderFixtures)

    await page.goto("/account/login")

    await expect(page.getByText("使用第三方帐号继续")).toBeVisible()

    const github = page.getByRole("link", { name: "GitHub" })
    await expect(github).toBeVisible()
    await expect(github).toHaveAttribute(
      "href",
      /\/api\/platform\/auth\/oauth\/github\/start\?returnPath=%2Fcommunity%2Fexchange%2Fme$/
    )
    await expect(
      page.getByRole("link", { name: "事务所统一登录" })
    ).toBeVisible()
  }
)

test(
  "keeps a retryable failure when the provider list cannot be read",
  { tag: "@playwright" },
  async ({ page }) => {
    installRecoveringPlatformOAuthProvidersMock(api)

    await page.goto("/account/login")

    // The entry must not disappear silently; the failure has to be visible and
    // recoverable on the spot.
    const failure = page.getByText("第三方登录列表载入失败，请重试。")
    await expect(failure).toBeVisible()

    await page.getByRole("button", { name: "重试" }).click()

    await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible()
    await expect(failure).toHaveCount(0)
  }
)

const oauthReasons = [
  { reason: "denied", copy: "你取消了第三方登录。" },
  { reason: "expired", copy: "登录链接已过期，请重新尝试。" },
  { reason: "unavailable", copy: "暂未配置第三方登录" },
  { reason: "unexpected", copy: "第三方登录未完成，请重新尝试。" },
] as const

for (const { reason, copy } of oauthReasons) {
  test(
    `explains ?oauth=${reason} on the login screen`,
    { tag: "@playwright" },
    async ({ page }) => {
      installPlatformOAuthProvidersMock(api)

      await page.goto(`/account/login?oauth=${reason}`)

      await expect(page.getByText(copy)).toBeVisible()
      // An unmapped reason must never surface the i18n key itself.
      await expect(page.getByText(/platformAuth\./)).toHaveCount(0)

      // The parameter is consumed once so a refresh cannot repeat the message.
      await expect
        .poll(() => new URL(page.url()).searchParams.has("oauth"))
        .toBe(false)
    }
  )
}

test.describe("phone viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test(
    "keeps the OAuth entry visible and reachable on a phone",
    { tag: "@mobile" },
    async ({ page }) => {
      installPlatformOAuthProvidersMock(api, 1, platformOAuthProviderFixtures)

      await page.goto("/account/login")

      const github = page.getByRole("link", { name: "GitHub" })
      await expect(github).toBeVisible()
      await expect(github).toBeInViewport()
    }
  )
})
