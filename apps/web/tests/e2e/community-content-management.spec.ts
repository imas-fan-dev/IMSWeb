import AxeBuilder from "@axe-core/playwright"
import {
  adminCommunityContentSnapshotSchema,
  adminCommunityContentUpdateRequestSchema,
  adminCommunityContentUpdateSchema,
  communityContentSchema,
  type CommunityContent,
} from "@imsweb/contracts/community-content"
import { adminApiPath, communityApiPath } from "@imsweb/contracts/paths"
import { test, expect } from "./fixtures/test"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

test.describe("community content management", () => {
  for (const dept of ["op", "editor"] as const) {
    test(`@mobile ${dept} edits, orders and publishes community entries at desktop and phone widths`, async ({
      page,
      api,
      isMobile,
    }, testInfo) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
      await page.addInitScript(() =>
        window.localStorage.setItem("imsweb.language", "zh-CN")
      )
      installEmptyWikiCatalogMock(api, 1)
      await installAdminAuthMock(page, api, {
        user: { dept },
        csrfToken: "community-e2e-csrf",
        sessionTimes: 4,
      })
      let stored: CommunityContent = {
        version: 1,
        title: "制作人社区",
        introduction: "",
        entries: [],
        updatedAt: null,
      }
      let revision: string | null = null
      api.expect({
        name: "read community editor snapshot",
        method: "GET",
        path: adminApiPath("/community-content"),
        responses: { 200: adminCommunityContentSnapshotSchema },
        times: 3,
        handle: () => ({ status: 200, json: { content: stored, revision } }),
      })
      api.expect({
        name: "save community editor draft",
        method: "PUT",
        path: adminApiPath("/community-content"),
        body: adminCommunityContentUpdateRequestSchema,
        responses: { 200: adminCommunityContentUpdateSchema },
        times: 2,
        handle: ({ body, request }) => {
          expect(request.headers()["x-csrftoken"]).toBe("community-e2e-csrf")
          expect(body.revision).toBe(revision)
          stored = { ...body.content, updatedAt: "2026-10-06T10:00:00.000Z" }
          revision = revision ? "v2" : "v1"
          return {
            status: 200,
            json: { success: true, content: stored, revision },
          }
        },
      })
      api.expect({
        name: "read published community",
        method: "GET",
        path: communityApiPath("/content"),
        responses: { 200: communityContentSchema },
        times: 2,
        handle: () => ({
          status: 200,
          json: {
            ...stored,
            entries: stored.entries.filter((entry) => entry.enabled),
          },
        }),
      })
      const imageUrl = "/uploads/community-content/editor-test.webp"
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64"
      )
      await page.route(
        "**/uploads/community-content/editor-test.webp",
        (route) =>
          route.fulfill({ status: 200, contentType: "image/png", body: png })
      )
      await api.mockRoute(
        "**/api/admin/community-content/images",
        (route) => {
          expect(route.request().headers()["x-csrftoken"]).toBe(
            "community-e2e-csrf"
          )
          return route.fulfill({
            status: 200,
            json: { success: true, url: imageUrl },
          })
        },
        "POST",
        1
      )
      await page.goto("/admin/community")
      await expect(page.getByLabel("页面标题")).toHaveValue("制作人社区")
      await expect(
        page
          .getByRole("navigation", { name: "管理业务" })
          .getByRole("link", { name: /制作人社区/ })
      ).toBeVisible()
      if (dept === "editor")
        await expect(
          page
            .getByRole("navigation", { name: "管理业务" })
            .getByRole("link", { name: /首页板块/ })
        ).toHaveCount(0)
      await page.getByLabel("页面标题").fill("共同创作社区")
      await page.getByLabel("页面简介").fill("管理配置的简介")
      await page.getByRole("button", { name: "添加入口" }).click()
      await page.getByRole("button", { name: "添加入口" }).click()
      const first = page.getByRole("region", { name: "入口 1", exact: true })
      const second = page.getByRole("region", { name: "入口 2", exact: true })
      await first.getByLabel("名称", { exact: true }).fill("制作人名片")
      await first.getByLabel("入口 ID").fill("cards")
      await first.getByLabel("跳转地址").fill("/community/cards")
      await first.getByLabel("说明", { exact: true }).fill("浏览制作人名片")
      await second.getByLabel("名称", { exact: true }).fill("App 专属")
      await second.getByLabel("入口 ID").fill("app-only")
      await second.getByLabel("展示范围").selectOption("app")
      await second.getByRole("button", { name: "上移" }).click()
      await expect(first.getByLabel("名称", { exact: true })).toHaveValue(
        "App 专属"
      )
      await second
        .locator('input[type="file"]')
        .setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: png })
      await expect(
        second.getByRole("img", { name: "入口图片预览" })
      ).toBeVisible()
      await expect
        .poll(() =>
          second
            .getByRole("img")
            .evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBeGreaterThan(0)
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        )
        .toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath(`community-editor-${dept}.png`),
        fullPage: true,
      })
      await page.getByRole("button", { name: "保存配置" }).click()
      await expect(page.getByRole("alert")).toHaveText("已保存")
      await page.getByRole("button", { name: "重新读取" }).click()
      await expect(first.getByLabel("名称", { exact: true })).toHaveValue(
        "App 专属"
      )
      await page.goto("/community")
      await expect(
        page.getByRole("heading", { name: "共同创作社区" })
      ).toBeVisible()
      await expect(
        page.locator("main").getByRole("link", { name: /制作人名片/ })
      ).toBeVisible()
      const publicImage = page.locator(
        'main img[src*="community-content/editor-test.webp"]'
      )
      await expect(publicImage).toBeVisible()
      await expect
        .poll(() =>
          publicImage.evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBeGreaterThan(0)
      expect(
        await publicImage.evaluate((image) => ({
          width: image.getBoundingClientRect().width,
          height: image.getBoundingClientRect().height,
        }))
      ).toEqual({ width: 40, height: 40 })
      await expect(
        page.locator("main").getByRole("link", { name: /App 专属/ })
      ).toHaveCount(0)
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`community-public-${dept}.png`),
        fullPage: true,
      })
      await page.goto("/admin/community")
      await expect(first.getByLabel("名称", { exact: true })).toHaveValue(
        "App 专属"
      )
      await page
        .getByRole("region", { name: "入口 2", exact: true })
        .getByRole("button", { name: "清除图片" })
        .click()
      await expect(page.getByRole("img", { name: "入口图片预览" })).toHaveCount(
        0
      )
      for (let i = 0; i < 2; i++) {
        await page
          .getByRole("region", { name: "入口 1", exact: true })
          .getByRole("button", { name: "删除", exact: true })
          .click()
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "确认", exact: true })
          .click()
      }
      await page.getByRole("button", { name: "保存配置" }).click()
      await expect(page.getByRole("alert")).toHaveText("已保存")
      await page.goto("/community")
      await expect(
        page.getByRole("heading", { name: "共同创作社区" })
      ).toBeVisible()
      await expect(page.locator("main").getByRole("link")).toHaveCount(0)
      await expect(page.getByText("暂无内容")).toHaveCount(0)
    })
  }
})
