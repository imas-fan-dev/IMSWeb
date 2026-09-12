import AxeBuilder from "@axe-core/playwright"
import type { Page, TestInfo } from "@playwright/test"

import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installPlatformOAuthProvidersMock } from "./fixtures/platform-auth"
import { api, expect, test } from "./fixtures/test"

const session = {
  success: true,
  account: { id: "platform-browser", status: "active" },
  profile: {
    displayName: "浏览器制作人",
    avatarUrl: null,
    homeCity: null,
    bio: "",
  },
}

async function mockOwnerWorkspace() {
  await api.mockRoute(
    "**/api/platform/me",
    async (route) => {
      await route.fulfill({
        json: {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: { ...session.profile, updatedAt: 1 },
        },
      })
    },
    "GET"
  )
  await api.mockRoute(
    "**/api/community/exchange/me/series",
    async (route) => {
      await route.fulfill({ json: { items: [] } })
    },
    "GET"
  )
  await api.mockRoute(
    "**/api/community/exchange/me/cards",
    async (route) => {
      await route.fulfill({ json: { items: [] } })
    },
    "GET"
  )
  await api.mockRoute(
    "/api/community/exchange/me/favorites",
    (route) =>
      route.fulfill({
        json: {
          items: [],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      }),
    "GET"
  )
  await api.mockRoute(
    "/api/community/exchange/me/claim-envelopes",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET"
  )
  await api.mockRoute(
    "/api/community/exchange/me/offices",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET"
  )
}

async function expectAccessibleAuthPage(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(accessibility.violations).toEqual([])
}

async function captureStableAuthScreenshot(
  page: Page,
  testInfo: TestInfo,
  interfaceName: "login" | "register"
) {
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.waitForTimeout(300)
  await page.screenshot({
    path: testInfo.outputPath(
      `auth-${interfaceName}-${testInfo.project.name}.png`
    ),
    fullPage: true,
  })
}

test.beforeEach(async ({ page, api }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  installEmptyWikiCatalogMock(api)
  installPlatformOAuthProvidersMock(api)
  await mockOwnerWorkspace()
})

test("logs in and adopts the returned Platform session", async ({
  page,
}, testInfo) => {
  let loginBody: unknown
  let sessionRequests = 0
  await api.mockRoute(
    "**/api/platform/auth/login",
    async (route) => {
      loginBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, json: session })
    },
    "POST"
  )
  await api.mockRoute(
    "**/api/platform/auth/session",
    async (route) => {
      sessionRequests += 1
      await route.fulfill({
        status: 401,
        json: { success: false, code: "PLATFORM_AUTH_REQUIRED" },
      })
    },
    "GET",
    0
  )

  await page.goto("/account/login")
  await expect(page).toHaveTitle(/帐号登录.*IMSWeb/i)
  await expect(
    page.getByRole("heading", { name: "登录站点帐号" })
  ).toBeVisible()
  await expectAccessibleAuthPage(page)
  await captureStableAuthScreenshot(page, testInfo, "login")

  await page.getByLabel("邮箱").fill("  Producer@Example.COM ")
  await page.getByLabel("密码", { exact: true }).fill("correct-horse-battery")
  await page.getByRole("button", { name: "登录", exact: true }).click()

  await expect(page).toHaveURL(/\/community\/exchange\/me$/)
  await expect(
    page.getByRole("heading", { name: "个人档案", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "帐号：浏览器制作人" })
  ).toBeVisible()
  expect(loginBody).toEqual({
    email: "producer@example.com",
    password: "correct-horse-battery",
  })
  expect(sessionRequests).toBe(0)
})

test("registers after a conflict is corrected and keeps errors user-safe", async ({
  page,
}, testInfo) => {
  let attempts = 0
  let registrationBody: unknown
  let verificationBody: unknown
  await api.mockRoute(
    "**/api/platform/auth/register/verification-code",
    async (route) => {
      verificationBody = route.request().postDataJSON()
      await route.fulfill({
        status: 202,
        json: { success: true, retryAfterSeconds: 60 },
      })
    },
    "POST"
  )
  await api.mockRoute(
    "**/api/platform/auth/register",
    async (route) => {
      attempts += 1
      registrationBody = route.request().postDataJSON()
      if (attempts === 1) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            code: "PLATFORM_EMAIL_CONFLICT",
          },
        })
        return
      }
      await route.fulfill({ status: 201, json: session })
    },
    "POST",
    2
  )

  await page.goto("/account/register")
  await expect(page).toHaveTitle(/帐号注册.*IMSWeb/i)
  await expect(
    page.getByRole("heading", { name: "注册站点帐号" })
  ).toBeVisible()
  await expectAccessibleAuthPage(page)
  await captureStableAuthScreenshot(page, testInfo, "register")

  await page.getByLabel("显示名称").fill("  浏览器制作人  ")
  await page.getByLabel("邮箱", { exact: true }).fill("  New@Example.COM ")
  await page.getByRole("button", { name: "发送验证码" }).click()
  await expect(page.getByText("验证码已发送至 new@example.com。")).toBeVisible()
  await expect(page.getByRole("button", { name: "60 秒后重发" })).toBeDisabled()
  await page.getByLabel("邮箱验证码").fill("012345")
  await page.getByLabel("密码", { exact: true }).fill("correct-horse-battery")
  await page.getByLabel("确认密码").fill("correct-horse-battery")
  await page.getByRole("button", { name: "注册" }).click()

  await expect(page.getByText("该邮箱已经注册，请直接登录。")).toBeVisible()
  await expect(page.getByText(/unique constraint/)).toHaveCount(0)
  await page.getByRole("button", { name: "注册" }).click()

  await expect(page).toHaveURL(/\/community\/exchange\/me$/)
  await expect(
    page.getByRole("heading", { name: "个人档案", exact: true })
  ).toBeVisible()
  expect(registrationBody).toEqual({
    email: "new@example.com",
    password: "correct-horse-battery",
    displayName: "浏览器制作人",
    code: "012345",
  })
  expect(verificationBody).toEqual({ email: "new@example.com" })
})
