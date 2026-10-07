import AxeBuilder from "@axe-core/playwright"
import {
  adminCommunityContentSnapshotSchema,
  adminCommunityContentUpdateRequestSchema,
  adminCommunityContentUpdateSchema,
  communityContentSchema,
  communityContentErrorResponseSchema,
  type CommunityContent,
} from "@imsweb/contracts/community-content"
import { adminApiPath, communityApiPath } from "@imsweb/contracts/paths"
import { test, expect } from "./fixtures/test"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const imageUrl = "/uploads/community-content/editor-test.webp"
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64"
)

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
        sessionTimes: 2,
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
        times: 2,
        handle: () => ({ status: 200, json: { content: stored, revision } }),
      })
      api.expect({
        name: "save community editor draft",
        method: "PUT",
        path: adminApiPath("/community-content"),
        body: adminCommunityContentUpdateRequestSchema,
        responses: { 200: adminCommunityContentUpdateSchema },
        times: 1,
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
        times: 1,
        handle: () => ({
          status: 200,
          json: {
            ...stored,
            entries: stored.entries.filter((entry) => entry.enabled),
          },
        }),
      })
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
      await page.getByRole("button", { name: "新增入口" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("名称", { exact: true }).fill("取消的新入口")
      await dialog.getByRole("button", { name: "取消", exact: true }).click()
      await expect(page.getByText("取消的新入口")).toHaveCount(0)
      await page.getByRole("button", { name: "新增入口" }).click()
      await dialog.getByLabel("入口 ID").fill("Invalid ID")
      await dialog
        .getByRole("button", { name: "添加入口", exact: true })
        .click()
      await expect(dialog.getByRole("alert")).toBeVisible()
      if (!isMobile) {
        const name = await dialog
          .getByLabel("名称", { exact: true })
          .boundingBox()
        const icon = await dialog
          .getByRole("button", { name: "图标：users", exact: true })
          .boundingBox()
        expect(name!.x).toBeLessThan(icon!.x)
      }
      await dialog.getByLabel("名称", { exact: true }).fill("制作人名片")
      await dialog.getByLabel("入口 ID").fill("cards")
      await dialog.getByLabel("跳转地址").fill("/community/cards")
      await dialog.getByLabel("说明", { exact: true }).fill("浏览制作人名片")
      await dialog
        .getByRole("button", { name: "添加入口", exact: true })
        .click()
      await page.getByRole("button", { name: "新增入口" }).click()
      await dialog.getByLabel("名称", { exact: true }).fill("App 专属")
      await dialog.getByLabel("入口 ID").fill("app-only")
      await dialog.getByLabel("展示范围").click()
      await page.getByRole("option", { name: "App", exact: true }).click()
      await dialog
        .getByRole("button", { name: "添加入口", exact: true })
        .click()
      const first = page.getByRole("row", { name: "入口 1", exact: true })
      if (isMobile) {
        await page.getByRole("button", { name: "更多操作 App 专属" }).click()
        await expect(page.getByRole("menu")).toBeVisible()
        for (const item of await page.getByRole("menuitem").all())
          expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await page.keyboard.press("Escape")
        await expect(
          page.getByRole("button", { name: "更多操作 App 专属" })
        ).toBeFocused()
        await page.getByRole("button", { name: "更多操作 App 专属" }).click()
        await page.getByRole("menuitem", { name: "上移", exact: true }).click()
      } else await page.getByRole("button", { name: "上移 App 专属" }).click()
      await expect(first.getByText("App 专属", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "编辑 制作人名片" }).click()
      await dialog.getByLabel("名称", { exact: true }).fill("取消编辑")
      await page.keyboard.press("Escape")
      await expect(
        page.getByRole("button", { name: "编辑 制作人名片" })
      ).toBeFocused()
      await page.getByRole("button", { name: "编辑 制作人名片" }).click()
      await dialog.getByLabel("入口 ID").fill("cards-renamed")
      await dialog
        .locator('input[type="file"]')
        .setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: png })
      await expect(
        dialog.getByRole("img", { name: "入口图片预览" })
      ).toBeVisible()
      await expect
        .poll(() =>
          dialog
            .getByRole("img")
            .evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBeGreaterThan(0)
      await dialog.evaluate(async (element) => {
        await Promise.allSettled(
          element
            .getAnimations({ subtree: true })
            .filter(
              (a) => a.effect?.getComputedTiming().iterations !== Infinity
            )
            .map((a) => a.finished)
        )
      })
      if (isMobile) {
        const footer = dialog.locator('[data-slot="dialog-footer"]')
        const close = dialog.getByRole("button", { name: "关闭入口编辑器" })
        const scrollTop = await page.evaluate(
          () => document.scrollingElement!.scrollTop
        )
        const before = {
          footer: await footer.boundingBox(),
          close: await close.boundingBox(),
        }
        const body = dialog.locator('[data-slot="dialog-body"]')
        await expect
          .poll(() =>
            body.evaluate(
              (element) => element.scrollHeight > element.clientHeight
            )
          )
          .toBe(true)
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await expect
          .poll(() => body.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0)
        expect(
          await page.evaluate(() => document.scrollingElement!.scrollTop)
        ).toBe(scrollTop)
        expect(await footer.boundingBox()).toEqual(before.footer)
        expect(await close.boundingBox()).toEqual(before.close)
        expect(before.close!.width).toBeGreaterThanOrEqual(44)
        expect(before.close!.height).toBeGreaterThanOrEqual(44)
        await expect(
          dialog.getByRole("button", { name: "完成编辑" })
        ).toBeInViewport()
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568)
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath(`community-dialog-${dept}.png`),
        fullPage: true,
      })
      await dialog.getByRole("button", { name: "完成编辑" }).click()
      await expect(
        page.getByRole("button", { name: "编辑 制作人名片" })
      ).toBeFocused()
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
      await expect(first.getByText("App 专属", { exact: true })).toBeVisible()
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
    })

    test(`@mobile ${dept} clears an image and publishes an empty community`, async ({
      page,
      api,
      isMobile,
    }) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
      await page.addInitScript(() =>
        window.localStorage.setItem("imsweb.language", "zh-CN")
      )
      installEmptyWikiCatalogMock(api, 1)
      await installAdminAuthMock(page, api, {
        user: { dept },
        csrfToken: "community-e2e-csrf",
        sessionTimes: 2,
      })
      let stored: CommunityContent = {
        version: 1,
        title: "共同创作社区",
        introduction: "管理配置的简介",
        entries: [
          {
            id: "app-only",
            title: "App 专属",
            description: "",
            href: "/community",
            icon: "users",
            imageUrl: null,
            enabled: true,
            audience: "app",
            availability: "always",
          },
          {
            id: "cards-renamed",
            title: "制作人名片",
            description: "浏览制作人名片",
            href: "/community/cards",
            icon: "users",
            imageUrl,
            enabled: true,
            audience: "all",
            availability: "always",
          },
        ],
        updatedAt: "2026-10-06T10:00:00.000Z",
      }
      api.expect({
        name: "read configured community editor snapshot",
        method: "GET",
        path: adminApiPath("/community-content"),
        responses: { 200: adminCommunityContentSnapshotSchema },
        times: 1,
        handle: () => ({
          status: 200,
          json: { content: stored, revision: "v1" },
        }),
      })
      api.expect({
        name: "publish empty community draft",
        method: "PUT",
        path: adminApiPath("/community-content"),
        body: adminCommunityContentUpdateRequestSchema,
        responses: { 200: adminCommunityContentUpdateSchema },
        times: 1,
        handle: ({ body, request }) => {
          expect(request.headers()["x-csrftoken"]).toBe("community-e2e-csrf")
          expect(body.revision).toBe("v1")
          expect(body.content.entries).toEqual([])
          stored = { ...body.content, updatedAt: "2026-10-06T10:00:00.000Z" }
          return {
            status: 200,
            json: { success: true, content: stored, revision: "v2" },
          }
        },
      })
      api.expect({
        name: "read empty published community",
        method: "GET",
        path: communityApiPath("/content"),
        responses: { 200: communityContentSchema },
        times: 1,
        handle: () => ({ status: 200, json: stored }),
      })
      await page.route(
        "**/uploads/community-content/editor-test.webp",
        (route) =>
          route.fulfill({ status: 200, contentType: "image/png", body: png })
      )
      await page.goto("/admin/community")
      const first = page.getByRole("row", { name: "入口 1", exact: true })
      await expect(first.getByText("App 专属", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "编辑 制作人名片" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByRole("button", { name: "清除图片" }).click()
      await expect(
        dialog.getByRole("img", { name: "入口图片预览" })
      ).toHaveCount(0)
      await dialog.getByRole("button", { name: "完成编辑" }).click()
      for (const title of ["App 专属", "制作人名片"]) {
        if (isMobile) {
          await page.getByRole("button", { name: `更多操作 ${title}` }).click()
          await expect(page.getByRole("menu")).toBeVisible()
          await page
            .getByRole("menuitem", { name: "删除", exact: true })
            .click()
        } else await page.getByRole("button", { name: `删除 ${title}` }).click()
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
  test("@mobile preserves local edits on conflict and blocks saving after a failed reread", async ({
    page,
    api,
    isMobile,
  }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
    await page.addInitScript(() =>
      window.localStorage.setItem("imsweb.language", "zh-CN")
    )
    installEmptyWikiCatalogMock(api, 1)
    await installAdminAuthMock(page, api, { sessionTimes: 1 })
    let reads = 0
    api.expect({
      name: "community snapshot then failed reread",
      method: "GET",
      path: adminApiPath("/community-content"),
      times: 2,
      responses: {
        200: adminCommunityContentSnapshotSchema,
        500: communityContentErrorResponseSchema,
      },
      handle: () =>
        ++reads === 1
          ? {
              status: 200,
              json: {
                content: {
                  version: 1,
                  title: "服务器标题",
                  introduction: "",
                  entries: [],
                  updatedAt: null,
                },
                revision: "v1",
              },
            }
          : { status: 500, json: { error: "read failed" } },
    })
    api.expect({
      name: "community revision conflict",
      method: "PUT",
      path: adminApiPath("/community-content"),
      body: adminCommunityContentUpdateRequestSchema,
      responses: { 409: communityContentErrorResponseSchema },
      handle: ({ body }) => {
        expect(body.revision).toBe("v1")
        expect(body.content.title).toBe("本地修改")
        return { status: 409, json: { error: "conflict" } }
      },
    })
    await page.goto("/admin/community")
    await page.getByLabel("页面标题").fill("本地修改")
    await page.getByRole("button", { name: "保存配置" }).click()
    await expect(page.getByRole("alert")).toContainText("本地草稿已保留")
    await expect(page.getByRole("button", { name: "保存配置" })).toBeDisabled()
    await expect(page.getByLabel("页面标题")).toHaveValue("本地修改")
    await page.getByRole("button", { name: "重新读取" }).click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "确认" })
      .click()
    await expect(page.getByRole("alert")).toContainText("无法读取")
    await expect(page.getByLabel("页面标题")).toHaveValue("本地修改")
    await expect(page.getByLabel("页面标题")).toBeDisabled()
    await expect(page.getByRole("button", { name: "新增入口" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "保存配置" })).toBeDisabled()
  })
})
