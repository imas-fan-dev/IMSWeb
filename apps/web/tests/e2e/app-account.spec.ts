import { expect, test } from "@playwright/test"

const session = {
  success: true,
  account: { id: "platform-app", status: "active" },
  profile: {
    displayName: "App 制作人",
    avatarUrl: null,
    homeCity: "上海",
    bio: "",
  },
}

async function applySafeArea(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      :root {
        --safe-area-top: 47px;
        --safe-area-right: 0px;
        --safe-area-bottom: 34px;
        --safe-area-left: 0px;
      }
    `,
  })
}

async function installAccountMocks(page: import("@playwright/test").Page) {
  await page.route("**/api/platform/auth/session", async (route) => {
    await route.fulfill({ json: session })
  })
  await page.route("**/api/platform/me", async (route) => {
    await route.fulfill({
      json: {
        ...session,
        capabilities: { fudabaWrite: true },
        profile: { ...session.profile, updatedAt: 1 },
      },
    })
  })
  await page.route("**/api/community/exchange/me/series", async (route) => {
    await route.fulfill({ json: { items: [] } })
  })
  await page.route("**/api/community/exchange/me/cards", async (route) => {
    await route.fulfill({ json: { items: [] } })
  })
  await page.route("**/api/wiki/catalog", async (route) => {
    await route.fulfill({
      json: {
        status: "success",
        agencies: [],
        searchEntries: [],
        selection: null,
      },
    })
  })
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "app-iphone",
    "The full account flow is covered on the portrait App project."
  )
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=e2e; path=/"
  })
  await installAccountMocks(page)
})

test("uses an account root and independent profile section stack", async ({
  page,
}, testInfo) => {
  await page.goto("/account/me")
  await applySafeArea(page)

  await expect(page.getByText("App 制作人")).toBeVisible()
  await expect(page.getByText("上海")).toBeVisible()
  const accountNavigation = page.getByRole("navigation", { name: "主导航" })
  await expect(
    accountNavigation.getByRole("link", { name: "帐号" })
  ).toHaveAttribute("aria-current", "page")

  for (const [name, href] of [
    ["个人资料", "/account/me/profile"],
    ["交换名片", "/account/me/cards"],
    ["收藏夹", "/account/me/favorites"],
    ["事务所与位置", "/account/me/offices"],
    ["认领消息", "/account/me/claims"],
  ] as const) {
    const link = page.locator(`a[href="${href}"]`)
    await expect(link).toContainText(name)
  }

  await expect(
    page.getByRole("button", { name: "切换亮色或暗色模式" })
  ).toHaveCount(1)
  await page.getByRole("link", { name: /个人资料/ }).click()
  await expect(page).toHaveURL(/\/account\/me\/profile$/)
  await expect(page.getByRole("heading", { name: "个人资料" })).toBeVisible()
  await expect(
    page.locator('[data-account-section-layout="stack"]')
  ).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "个人档案菜单" })
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "返回" })).toBeVisible()
  await expect(
    accountNavigation.getByRole("link", { name: "帐号" })
  ).toHaveAttribute("aria-current", "page")

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)

  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-account-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
})
