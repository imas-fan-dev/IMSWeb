import type { Page, Route } from "@playwright/test"

import { expect, test, type ApiDispatcher } from "./fixtures/test"
import { settleToasts } from "./fixtures/toast"

const AVATAR_PATH = "/platform/accounts/platform-app/avatars/2.webp"
const APP_ACCESS_TOKEN = "app-avatar-access-token"

function appCorsHeaders(documentOrigin: string) {
  return {
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-IMS-Auth-Mode, X-CSRFToken",
    "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, POST, PUT",
    "Access-Control-Allow-Origin": documentOrigin,
  }
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

async function applySafeArea(page: Page) {
  await page.addInitScript(() => {
    const apply = () => {
      const root = document.documentElement
      if (!root) return
      root.style.setProperty("--safe-area-top", "47px", "important")
      root.style.setProperty("--safe-area-right", "0px", "important")
      root.style.setProperty("--safe-area-bottom", "34px", "important")
      root.style.setProperty("--safe-area-left", "0px", "important")
    }
    apply()
    document.addEventListener("DOMContentLoaded", apply, { once: true })
  })
  await page.evaluate(() => {
    const root = document.documentElement
    root.style.setProperty("--safe-area-top", "47px", "important")
    root.style.setProperty("--safe-area-right", "0px", "important")
    root.style.setProperty("--safe-area-bottom", "34px", "important")
    root.style.setProperty("--safe-area-left", "0px", "important")
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--safe-area-top")
          .trim()
      )
    )
    .toBe("47px")
}

function expectPlatformBearer(headers: Record<string, string>) {
  expect(headers.authorization).toBe(`Bearer ${APP_ACCESS_TOKEN}`)
  expect(headers["x-ims-auth-mode"]).toBe("bearer")
}

async function fulfillJson(
  route: Route,
  json: unknown,
  corsHeaders: Record<string, string>
) {
  await route.fulfill({ json, headers: corsHeaders })
}

async function installAccountMocks(
  api: ApiDispatcher,
  corsHeaders: Record<string, string>
) {
  let currentProfile: AppProfile = { ...session.profile, updatedAt: 1 }
  const emptyItems = { items: [] }

  await api.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 8 },
    },
    async (route) => {
      expectPlatformBearer(route.request().headers())
      const profile = {
        displayName: currentProfile.displayName,
        avatarUrl: currentProfile.avatarUrl,
        homeCity: currentProfile.homeCity,
        bio: currentProfile.bio,
      }
      await fulfillJson(route, { ...session, profile }, corsHeaders)
    }
  )
  await api.mock(
    {
      method: "GET",
      path: "/api/platform/me",
      times: { min: 1, max: 12 },
    },
    async (route) => {
      expectPlatformBearer(route.request().headers())
      await fulfillJson(
        route,
        {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: currentProfile,
        },
        corsHeaders
      )
    }
  )
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/cards",
  ]) {
    await api.mock(
      { method: "GET", path, times: { min: 0, max: 12 } },
      (route) => fulfillJson(route, emptyItems, corsHeaders)
    )
  }
  for (const path of [
    "/api/community/exchange/me/claim-envelopes",
    "/api/community/exchange/me/offices",
  ]) {
    await api.mock(
      { method: "GET", path, times: { min: 0, max: 12 } },
      (route) => fulfillJson(route, emptyItems, corsHeaders)
    )
  }
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/favorites",
      times: { min: 0, max: 12 },
    },
    async (route) => {
      await fulfillJson(
        route,
        {
          ...emptyItems,
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
        corsHeaders
      )
    }
  )
  await api.mock(
    {
      method: "GET",
      path: "/api/wiki/catalog",
      times: { min: 0, max: 12 },
    },
    async (route) => {
      await fulfillJson(
        route,
        {
          status: "success",
          agencies: [],
          searchEntries: [],
          selection: null,
        },
        corsHeaders
      )
    }
  )

  return {
    setProfile(profile: AppProfile) {
      currentProfile = profile
    },
  }
}

type AccountPageContext = {
  page: Page
  api: ApiDispatcher
  apiOrigins: string[]
  baseURL: string | undefined
}

/**
 * Open the App account root with the shared platform mocks installed, plus the
 * avatar transport and the request accounting both account scenarios assert.
 * `profile` seeds the session the App reads during its first startup, which is
 * how the removal scenario starts from an avatar persisted by an earlier run.
 */
async function openAccountRoot(
  { page, api, apiOrigins, baseURL }: AccountPageContext,
  options: { profile?: Partial<AppProfile> } = {}
) {
  if (!baseURL || apiOrigins.length !== 1) {
    throw new Error("App account E2E requires one page and API origin")
  }
  const documentOrigin = new URL(baseURL).origin
  const apiOrigin = apiOrigins[0]!
  const avatarUrl = new URL(AVATAR_PATH, apiOrigin).href
  const corsHeaders = appCorsHeaders(documentOrigin)
  const accountMocks = await installAccountMocks(api, corsHeaders)
  if (options.profile) {
    accountMocks.setProfile({
      ...session.profile,
      updatedAt: 1,
      ...options.profile,
    })
  }

  const allowedRequestOrigins = new Set([documentOrigin, apiOrigin])
  const avatarReadUrls: string[] = []
  const apiRequestOrigins: string[] = []
  const pageErrors: string[] = []
  const remoteRequests: string[] = []
  const avatarWrites = { put: 0, delete: 0 }

  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      apiRequestOrigins.push(url.origin)
    }
    if (url.pathname === "/api/platform/me/avatar") {
      if (request.method() === "PUT") avatarWrites.put += 1
      if (request.method() === "DELETE") avatarWrites.delete += 1
    }
    if (request.url() === avatarUrl) {
      avatarReadUrls.push(request.url())
      expect(request.headers().authorization).toBeUndefined()
      return
    }
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !allowedRequestOrigins.has(url.origin)
    ) {
      remoteRequests.push(request.url())
    }
  })
  await page.route(avatarUrl, async (route) => {
    await route.fulfill({
      body: avatarFixture,
      contentType: "image/svg+xml",
    })
  })

  await page.goto("/account/me")
  expect(new URL(page.url()).origin).toBe(documentOrigin)
  await applySafeArea(page)

  return {
    documentOrigin,
    apiOrigin,
    avatarUrl,
    corsHeaders,
    accountMocks,
    avatarReadUrls,
    apiRequestOrigins,
    pageErrors,
    remoteRequests,
    avatarWrites,
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
test.describe("app account", () => {
  test(
    "uses an account root and uploads an avatar in the profile section",
    {
      tag: ["@app-iphone", "@app-android", "@app-webkit"],
    },
    async ({ page, api, apiOrigins, baseURL }, testInfo) => {
      const {
        documentOrigin,
        apiOrigin,
        avatarUrl,
        corsHeaders,
        accountMocks,
        avatarWrites,
      } = await openAccountRoot({ page, api, apiOrigins, baseURL })

      await api.mock(
        { method: "PUT", path: "/api/platform/me/avatar", times: 1 },
        async (route) => {
          expectPlatformBearer(route.request().headers())
          const profile = {
            ...session.profile,
            avatarUrl: AVATAR_PATH,
            updatedAt: 2,
          }
          accountMocks.setProfile(profile)
          await fulfillJson(route, { success: true, profile }, corsHeaders)
        }
      )

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
      await expect(
        page.getByRole("heading", { name: "个人资料" })
      ).toBeVisible()
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
        name: "avatar.svg",
        mimeType: "image/svg+xml",
        buffer: avatarFixture,
      })
      const cropDialog = page.getByRole("dialog")
      await expect(cropDialog).toContainText("使用此头像")
      const cropArea = cropDialog.locator(".reactEasyCrop_CropArea")
      await expect(cropArea).toBeVisible()
      if (process.env.CAPTURE_APP_QA === "1") {
        await cropDialog.screenshot({
          path: `/tmp/imsweb-app-avatar-crop-${testInfo.project.name}.png`,
        })
      }
      const [dialogBox, cropBox] = await Promise.all([
        cropDialog.boundingBox(),
        cropArea.boundingBox(),
      ])
      const viewport = page.viewportSize()!
      expect(dialogBox).not.toBeNull()
      expect(cropBox).not.toBeNull()
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
      expect(dialogBox!.y).toBeGreaterThanOrEqual(47)
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
        viewport.width
      )
      expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
        viewport.height - 34
      )
      expect(Math.abs(cropBox!.width - cropBox!.height)).toBeLessThanOrEqual(2)
      await expect(cropArea).toHaveCSS("border-radius", "50%")

      const zoom = cropDialog.getByRole("slider", { name: "缩放" })
      await expect(zoom).toHaveAttribute("min", "0.5")
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
      expect((await saveAvatar.boundingBox())!.height).toBeGreaterThanOrEqual(
        44
      )
      expect(avatarWrites.put).toBe(0)
      if (process.env.CAPTURE_APP_QA === "1") {
        await page.screenshot({
          path: `/tmp/imsweb-app-avatar-staged-${testInfo.project.name}.png`,
          fullPage: true,
        })
      }
      const avatarPutResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).origin === apiOrigin &&
          response.url().endsWith("/api/platform/me/avatar")
      )
      await saveAvatar.click()
      const avatarPutResponse = await avatarPutResponsePromise
      expect(
        await avatarPutResponse.headerValue("access-control-allow-origin")
      ).toBe(documentOrigin)
      expect(avatarWrites.put).toBe(1)
      await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible()
      await expect(page.getByRole("img", { name: "当前头像" })).toHaveAttribute(
        "src",
        avatarUrl
      )
      const avatarUpdatedToast = page.getByText("头像已更新", { exact: true })
      await expect(avatarUpdatedToast).toBeVisible()
      await settleToasts(page)
      await expect(avatarUpdatedToast).toHaveCount(0)
      if (process.env.CAPTURE_APP_QA === "1") {
        await page.screenshot({
          path: `/tmp/imsweb-app-avatar-saved-${testInfo.project.name}.png`,
          fullPage: true,
        })
      }
      await backButton.click()
      await expect(page).toHaveURL(/\/account\/me$/)
    }
  )

  test(
    "serves the persisted avatar at startup and removes it from the profile section",
    {
      tag: ["@app-iphone", "@app-android", "@app-webkit"],
    },
    async ({ page, api, apiOrigins, baseURL }, testInfo) => {
      const {
        documentOrigin,
        apiOrigin,
        avatarUrl,
        corsHeaders,
        accountMocks,
        avatarReadUrls,
        apiRequestOrigins,
        pageErrors,
        remoteRequests,
        avatarWrites,
      } = await openAccountRoot(
        { page, api, apiOrigins, baseURL },
        { profile: { avatarUrl: AVATAR_PATH, updatedAt: 2 } }
      )

      await api.mock(
        { method: "DELETE", path: "/api/platform/me/avatar", times: 1 },
        async (route) => {
          expectPlatformBearer(route.request().headers())
          const profile = {
            ...session.profile,
            avatarUrl: null,
            updatedAt: 3,
          }
          accountMocks.setProfile(profile)
          await fulfillJson(route, { success: true, profile }, corsHeaders)
        }
      )

      // The avatar belongs to a profile persisted by an earlier session, so this
      // startup must resolve it from the public object URL again, without an
      // Authorization header on the image read.
      await expect(
        page.getByRole("img", { name: "App 制作人的头像" })
      ).toHaveAttribute("src", avatarUrl)

      await page.getByRole("link", { name: /个人资料/ }).click()
      await expect(page).toHaveURL(/\/account\/me\/profile$/)
      await page.getByRole("button", { name: "移除头像" }).click()
      const removeDialog = page.getByRole("alertdialog")
      await expect(removeDialog).toBeVisible()
      await removeDialog.getByRole("button", { name: "取消" }).click()
      expect(avatarWrites.delete).toBe(0)
      await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible()

      await page.getByRole("button", { name: "移除头像" }).click()
      const avatarDeleteResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "DELETE" &&
          new URL(response.url()).origin === apiOrigin &&
          response.url().endsWith("/api/platform/me/avatar")
      )
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "确认移除" })
        .click()
      const avatarDeleteResponse = await avatarDeleteResponsePromise
      expect(
        await avatarDeleteResponse.headerValue("access-control-allow-origin")
      ).toBe(documentOrigin)
      expect(avatarWrites.delete).toBe(1)
      const avatarRemovedToast = page.getByText("头像已移除", { exact: true })
      await expect(avatarRemovedToast).toBeVisible()
      await settleToasts(page)
      await expect(avatarRemovedToast).toHaveCount(0)
      const backButton = page.getByRole("button", { name: "返回" })
      await backButton.click()
      await expect(page).toHaveURL(/\/account\/me$/)
      await expect(
        page.getByRole("img", { name: "App 制作人的头像" })
      ).toHaveCount(0)
      expect(avatarReadUrls.length).toBeGreaterThan(0)
      expect(avatarReadUrls.every((url) => url === avatarUrl)).toBe(true)
      expect(apiRequestOrigins.length).toBeGreaterThan(0)
      expect([...new Set(apiRequestOrigins)]).toEqual([apiOrigin])
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
    }
  )

  test.describe("我的资料 submenu", () => {
    test.use({ viewport: { width: 320, height: 568 } })

    test(
      "switches all five sections at a 320px viewport without horizontal overflow",
      {
        tag: ["@app-iphone", "@app-android", "@app-webkit"],
      },
      async ({ page, api, apiOrigins, baseURL }) => {
        await openAccountRoot({ page, api, apiOrigins, baseURL })
        await expect(page.getByText("App 制作人")).toBeVisible()

        const sections = [
          ["profile", "个人资料"],
          ["cards", "交换名片"],
          ["favorites", "收藏夹"],
          ["offices", "事务所与位置"],
          ["claims", "认领消息"],
        ] as const
        const panelIds = sections.map(([id]) => id)

        for (const [section, label] of sections) {
          const link = page.locator(`a[href="/account/me/${section}"]`)
          await expect(link).toContainText(label)
          await link.click()
          await expect(page).toHaveURL(
            (url) => url.pathname === `/account/me/${section}`
          )

          for (const panelId of panelIds) {
            const panel = page.locator(`#profile-workspace-section-${panelId}`)
            if (panelId === section) {
              await expect(
                panel,
                `${panelId} is the active panel`
              ).toBeVisible()
            } else {
              await expect(panel, `${panelId} stays hidden`).toBeHidden()
            }
          }

          await expect
            .poll(
              () =>
                page.evaluate(
                  () =>
                    document.documentElement.scrollWidth === window.innerWidth
                ),
              { message: `${section} fits the 320px viewport` }
            )
            .toBe(true)

          await page.goBack()
          await expect(page).toHaveURL(/\/account\/me$/)
        }
      }
    )
  })
})
