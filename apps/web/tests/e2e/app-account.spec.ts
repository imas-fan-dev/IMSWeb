import { expect, test, type Route } from "@playwright/test"

const APP_DOCUMENT_ORIGIN = "http://localhost:1420"
const APP_API_ORIGIN = "http://127.0.0.1:1420"
const APP_ACCESS_TOKEN = "app-avatar-access-token"
const APP_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-IMS-Auth-Mode, X-CSRFToken",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST, PUT",
  "Access-Control-Allow-Origin": APP_DOCUMENT_ORIGIN,
}

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

const session = {
  success: true,
  account: { id: "platform-app", status: "active" },
  profile: {
    displayName: "App 制作人",
    avatarUrl: null as string | null,
    homeCity: "上海",
    bio: "",
  },
}

type AppProfile = typeof session.profile & { updatedAt: number }

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

async function fulfillPreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") return false
  await route.fulfill({ status: 204, headers: APP_CORS_HEADERS })
  return true
}

function expectPlatformBearer(route: Route) {
  const headers = route.request().headers()
  expect(headers.authorization).toBe(`Bearer ${APP_ACCESS_TOKEN}`)
  expect(headers["x-ims-auth-mode"]).toBe("bearer")
}

async function fulfillJson(route: Route, json: unknown) {
  await route.fulfill({ json, headers: APP_CORS_HEADERS })
}

async function installAccountMocks(page: import("@playwright/test").Page) {
  let currentProfile: AppProfile = { ...session.profile, updatedAt: 1 }
  const emptyItems = { items: [] }

  await page.route("**/api/platform/auth/session", async (route) => {
    if (await fulfillPreflight(route)) return
    expectPlatformBearer(route)
    const profile = {
      displayName: currentProfile.displayName,
      avatarUrl: currentProfile.avatarUrl,
      homeCity: currentProfile.homeCity,
      bio: currentProfile.bio,
    }
    await fulfillJson(route, { ...session, profile })
  })
  await page.route("**/api/platform/me", async (route) => {
    if (await fulfillPreflight(route)) return
    expectPlatformBearer(route)
    await fulfillJson(route, {
      ...session,
      capabilities: { fudabaWrite: true },
      profile: currentProfile,
    })
  })
  for (const path of [
    "**/api/community/exchange/me/series",
    "**/api/community/exchange/me/cards",
    "**/api/community/exchange/me/claim-envelopes",
    "**/api/community/exchange/me/offices",
  ]) {
    await page.route(path, async (route) => {
      if (await fulfillPreflight(route)) return
      await fulfillJson(route, emptyItems)
    })
  }
  await page.route("**/api/community/exchange/me/favorites*", async (route) => {
    if (await fulfillPreflight(route)) return
    await fulfillJson(route, {
      ...emptyItems,
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
  })
  await page.route("**/api/wiki/catalog", async (route) => {
    if (await fulfillPreflight(route)) return
    await fulfillJson(route, {
      status: "success",
      agencies: [],
      searchEntries: [],
      selection: null,
    })
  })

  return {
    setProfile(profile: AppProfile) {
      currentProfile = profile
    },
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !["app-iphone", "app-android", "app-webkit"].includes(
      testInfo.project.name
    ),
    "The full account flow is covered on the three portrait App projects."
  )
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
    window.localStorage.setItem("ims.platform.access-token", accessToken)
    document.cookie = "ims_platform_csrf=e2e; path=/"
  }, APP_ACCESS_TOKEN)
})

test("uses an account root and independent profile section stack", async ({
  page,
}, testInfo) => {
  const accountMocks = await installAccountMocks(page)
  const avatarReadUrls: string[] = []
  const pageErrors: string[] = []
  const remoteRequests: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      remoteRequests.push(request.url())
    }
  })
  await page.route("**/api/platform/me/avatar*", async (route) => {
    if (await fulfillPreflight(route)) return
    expectPlatformBearer(route)
    if (route.request().method() === "PUT") {
      const profile = {
        ...session.profile,
        avatarUrl: "/api/platform/me/avatar?v=2",
        updatedAt: 2,
      }
      accountMocks.setProfile(profile)
      await fulfillJson(route, { success: true, profile })
      return
    }
    avatarReadUrls.push(route.request().url())
    await route.fulfill({
      body: onePixelPng,
      contentType: "image/png",
      headers: APP_CORS_HEADERS,
    })
  })

  await page.goto("/account/me")
  expect(new URL(page.url()).origin).toBe(APP_DOCUMENT_ORIGIN)
  await applySafeArea(page)

  await expect(page.getByText("App 制作人")).toBeVisible()
  await expect(page.getByText("上海")).toBeVisible()
  const accountNavigation = page.getByRole("navigation", { name: "主导航" })
  await expect(
    accountNavigation.getByRole("link", { name: "我的" })
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
  const backButton = page.getByRole("button", { name: "返回" })
  await expect(backButton).toBeVisible()
  await expect(
    accountNavigation.getByRole("link", { name: "我的" })
  ).toHaveAttribute("aria-current", "page")

  await page.locator("#exchange-profile-avatar").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  })
  await page.getByRole("button", { name: "上传头像" }).click()
  await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible()
  await backButton.click()
  await expect(page).toHaveURL(/\/account\/me$/)

  // Recreate the packaged-App session boundary so this scenario proves a
  // persisted managed avatar survives startup and loads through Bearer auth.
  await page.reload()
  await expect(
    page.getByRole("img", { name: "App 制作人的头像" })
  ).toHaveAttribute("src", /^blob:/)
  expect(avatarReadUrls.length).toBeGreaterThan(0)
  expect(
    avatarReadUrls.every(
      (url) => url === `${APP_API_ORIGIN}/api/platform/me/avatar`
    )
  ).toBe(true)
  expect(pageErrors).toEqual([])
  expect(remoteRequests).toEqual([])

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
