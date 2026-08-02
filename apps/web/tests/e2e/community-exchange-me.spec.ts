import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const profile = {
  displayName: "浏览器制作人",
  avatarUrl: null,
  homeCity: "上海",
  bio: "周末参加线下交换",
  updatedAt: 10,
}

const card = {
  id: "card-1",
  producerName: "浏览器制作人",
  displayName: "浏览器交换名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "上海地区制作人",
  tradeNote: "周末现场交换",
  available: true,
  mediaRightsStatus: "approved",
  publicationStatus: "draft",
  revision: 3,
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "ims_platform_csrf",
      value: "exchange-me-csrf",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route("**/api/platform/auth/session", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        account: { id: "platform-browser", status: "active" },
        profile: {
          displayName: profile.displayName,
          avatarUrl: null,
          homeCity: profile.homeCity,
          bio: profile.bio,
        },
      },
    })
  })
  await page.route("**/api/platform/me", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          success: true,
          account: { id: "platform-browser", status: "active" },
          capabilities: { fudabaWrite: true },
          profile,
        },
      })
      return
    }
    const submission = route.request().postDataJSON()
    await route.fulfill({
      json: {
        success: true,
        profile: {
          ...profile,
          displayName: submission.displayName,
          updatedAt: 11,
        },
      },
    })
  })
  await page.route("**/api/community/exchange/me/series", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            code: "765as",
            displayName: "本家 / 765AS",
            displayOrder: 0,
            activeOfficeCount: 1,
          },
        ],
      },
    })
  })
  await page.route("**/api/community/exchange/me/cards", async (route) => {
    await route.fulfill({ json: { items: [card] } })
  })
  await page.route(
    "**/api/community/exchange/me/cards/card-1",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { card } })
        return
      }
      const submission = route.request().postDataJSON()
      await route.fulfill({
        json: {
          success: true,
          card: {
            ...card,
            displayName: submission.displayName,
            revision: 4,
            updatedAt: "2026-08-02T10:00:00.000Z",
          },
        },
      })
    }
  )
})

test("edits the authenticated profile and card without viewport overflow", async ({
  page,
  isMobile,
}) => {
  await page.goto("/community/exchange/me")

  await expect(
    page.getByRole("heading", { name: "我的交换名片", exact: true })
  ).toBeVisible()
  await expect(page.getByText("浏览器交换名片")).toBeVisible()
  await expect(page.getByText("素材已核准")).toBeVisible()
  await expect(
    page.getByLabel("编辑名片").getByText("草稿", { exact: true })
  ).toBeVisible()

  const accountTrigger = page.getByRole("button", {
    name: "帐号：浏览器制作人",
  })
  await accountTrigger.click()
  await expect(
    page.getByRole("link", { name: "我的交换名片" })
  ).toHaveAttribute("href", "/community/exchange/me")
  await page.keyboard.press("Escape")

  const profileName = page.getByRole("textbox", { name: "显示名称" })
  await profileName.fill("更新后的浏览器制作人")
  await page.getByRole("button", { name: "保存资料" }).click()
  await expect(page.getByText("制作人资料已保存。")).toBeVisible()

  const cardName = page.getByRole("textbox", { name: "名片标题" })
  await cardName.fill("更新后的浏览器名片")
  await page.getByRole("button", { name: "保存名片资料" }).click()
  await expect(page.getByText("名片资料已保存。")).toBeVisible()

  await page.getByRole("tab", { name: "背面预览" }).click()
  await expect(
    page.getByRole("button", { name: "查看更新后的浏览器名片背面" })
  ).toBeVisible()

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    `${isMobile ? "mobile" : "desktop"} exchange-me overflow`
  ).toBe(true)

  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(accessibility.violations).toEqual([])
})
