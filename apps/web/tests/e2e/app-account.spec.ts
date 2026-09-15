import { expect, test, type Route } from "@playwright/test"

const APP_DOCUMENT_ORIGIN = "http://localhost:1420"
const AVATAR_MEDIA_ORIGIN = "https://public-media.example.test"
const APP_ACCESS_TOKEN = "app-avatar-access-token"
const APP_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-IMS-Auth-Mode, X-CSRFToken",
  "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, POST, PUT",
  "Access-Control-Allow-Origin": APP_DOCUMENT_ORIGIN,
}

const avatarFixture = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <rect width="320" height="240" fill="#2463a8" />
    <circle cx="160" cy="120" r="72" fill="#f4c95d" />
    <path d="M92 208c19-42 48-63 68-63s49 21 68 63" fill="#ef8354" />
  </svg>`
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
    if (url.origin === AVATAR_MEDIA_ORIGIN) {
      avatarReadUrls.push(request.url())
      expect(request.headers().authorization).toBeUndefined()
      return
    }
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      remoteRequests.push(request.url())
    }
  })
  await page.route(`${AVATAR_MEDIA_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      body: avatarFixture,
      contentType: "image/svg+xml",
    })
  })
  await page.route("**/api/platform/me/avatar*", async (route) => {
    if (await fulfillPreflight(route)) return
    expectPlatformBearer(route)
    if (route.request().method() === "PUT") {
      const profile = {
        ...session.profile,
        avatarUrl: `${AVATAR_MEDIA_ORIGIN}/platform/accounts/platform-app/avatars/2.webp`,
        updatedAt: 2,
      }
      accountMocks.setProfile(profile)
      await fulfillJson(route, { success: true, profile })
      return
    }
    if (route.request().method() === "DELETE") {
      const profile = {
        ...session.profile,
        avatarUrl: null,
        updatedAt: 3,
      }
      accountMocks.setProfile(profile)
      await fulfillJson(route, { success: true, profile })
      return
    }
    await route.abort()
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

  let avatarPutRequests = 0
  let avatarDeleteRequests = 0
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/platform/me/avatar")) return
    if (request.method() === "PUT") avatarPutRequests += 1
    if (request.method() === "DELETE") avatarDeleteRequests += 1
  })

  await page.locator("#exchange-profile-avatar").setInputFiles({
    name: "avatar.svg",
    mimeType: "image/svg+xml",
    buffer: avatarFixture,
  })
  const cropDialog = page.getByRole("dialog")
  await expect(cropDialog).toContainText("使用此头像")
  const cropArea = cropDialog.locator(".reactEasyCrop_CropArea")
  await expect(cropArea).toBeVisible()
  const [dialogBox, cropBox] = await Promise.all([
    cropDialog.boundingBox(),
    cropArea.boundingBox(),
  ])
  const viewport = page.viewportSize()!
  expect(dialogBox).not.toBeNull()
  expect(cropBox).not.toBeNull()
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.y).toBeGreaterThanOrEqual(47)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width)
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
    viewport.height - 34
  )
  expect(Math.abs(cropBox!.width - cropBox!.height)).toBeLessThanOrEqual(2)
  await expect(cropArea).toHaveCSS("border-radius", "50%")

  const zoom = cropDialog.getByRole("slider", { name: "缩放" })
  const zoomBefore = await zoom.inputValue()
  await zoom.press("ArrowRight")
  await expect(zoom).not.toHaveValue(zoomBefore)
  for (const control of [
    cropDialog.getByRole("button", { name: "取消" }),
    cropDialog.getByRole("button", { name: "使用此头像" }),
  ]) {
    await expect(control).toBeVisible()
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    "App crop dialog overflow"
  ).toBe(true)

  await cropDialog.getByRole("button", { name: "使用此头像" }).click()
  const saveAvatar = page.getByRole("button", { name: "保存头像" })
  await expect(saveAvatar).toBeVisible()
  expect((await saveAvatar.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(avatarPutRequests).toBe(0)
  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-avatar-staged-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
  await Promise.all([
    page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith("/api/platform/me/avatar")
    ),
    saveAvatar.click(),
  ])
  expect(avatarPutRequests).toBe(1)
  await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible()
  await expect(page.getByRole("img", { name: "当前头像" })).toHaveAttribute(
    "src",
    `${AVATAR_MEDIA_ORIGIN}/platform/accounts/platform-app/avatars/2.webp`
  )
  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-avatar-saved-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
  await backButton.click()
  await expect(page).toHaveURL(/\/account\/me$/)

  // Recreate the packaged-App session boundary so this scenario proves a
  // persisted avatar keeps its public object URL across startup.
  await page.reload()
  await expect(
    page.getByRole("img", { name: "App 制作人的头像" })
  ).toHaveAttribute(
    "src",
    `${AVATAR_MEDIA_ORIGIN}/platform/accounts/platform-app/avatars/2.webp`
  )

  await page.getByRole("link", { name: /个人资料/ }).click()
  await expect(page).toHaveURL(/\/account\/me\/profile$/)
  await page.getByRole("button", { name: "移除头像" }).click()
  const removeDialog = page.getByRole("alertdialog")
  await expect(removeDialog).toBeVisible()
  await removeDialog.getByRole("button", { name: "取消" }).click()
  expect(avatarDeleteRequests).toBe(0)
  await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible()

  await page.getByRole("button", { name: "移除头像" }).click()
  await Promise.all([
    page.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        request.url().endsWith("/api/platform/me/avatar")
    ),
    page
      .getByRole("alertdialog")
      .getByRole("button", { name: "确认移除" })
      .click(),
  ])
  expect(avatarDeleteRequests).toBe(1)
  await backButton.click()
  await expect(page).toHaveURL(/\/account\/me$/)
  await expect(page.getByRole("img", { name: "App 制作人的头像" })).toHaveCount(
    0
  )
  expect(avatarReadUrls.length).toBeGreaterThan(0)
  expect(
    avatarReadUrls.every(
      (url) =>
        url ===
        `${AVATAR_MEDIA_ORIGIN}/platform/accounts/platform-app/avatars/2.webp`
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
