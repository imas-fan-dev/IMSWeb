import {
  namecardListQuerySchema,
  namecardPageSchema,
  namecardReactionListQuerySchema,
  reactionSchema,
} from "@imsweb/contracts/namecards"
import { apiPath } from "@imsweb/contracts/paths"

import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { makeNamecard, makeNamecardPage } from "./fixtures/namecards"

test.describe("namecard pagination", () => {
  test(
    "keeps the operator shortcut in the header and aligns the floating wall actions",
    { tag: "@mobile" },
    async ({ page, api, isMobile }, testInfo) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
      installEmptyWikiCatalogMock(api)
      await installAdminAuthMock(page, api)
      const cards = Array.from({ length: 12 }, (_, index) =>
        makeNamecard({
          id: index + 1,
          cardId: `card-${index + 1}`,
          // 墙上的可访问名跟随公开卡号；默认值会让 12 张卡都叫「1」。
          cardNumber: index + 1,
        })
      )
      api.expect({
        method: "GET",
        path: apiPath("/cards"),
        query: namecardListQuerySchema,
        responses: { 200: namecardPageSchema },
        times: 1,
        handle: () => ({ status: 200, json: makeNamecardPage(cards) }),
      })
      api.expect({
        method: "GET",
        path: apiPath("/reactions"),
        query: namecardReactionListQuerySchema,
        responses: { 200: reactionSchema },
        times: cards.length,
        handle: () => ({ status: 200, json: {} }),
      })

      await page.goto("/community/cards?page=1&size=12")
      const admin = page.getByRole("link", { name: "返回管理工作台" })
      const create = page.getByRole("button", { name: "新建名片" })
      const back = page.getByRole("button", { name: "返回顶部" })
      await expect(
        page.getByRole("banner").getByRole("link", { name: "返回管理工作台" })
      ).toBeVisible()
      await expect(admin).toHaveAttribute("href", "/admin")
      await expect(create).toBeInViewport()
      await expect(back).toHaveCount(0)
      const createBeforeScroll = await create.boundingBox()

      await expect(
        page.getByRole("button", { name: "查看制作人名片 1 正面" })
      ).toBeVisible()
      await page.evaluate(() =>
        window.scrollTo({ top: 500, behavior: "instant" })
      )
      await expect(back).toBeInViewport()
      await expect(admin).toBeInViewport({ ratio: 1 })
      await expect(create).toBeInViewport({ ratio: 1 })
      const [createBox, backBox] = await Promise.all([
        create.boundingBox(),
        back.boundingBox(),
      ])
      expect(createBox).toEqual(createBeforeScroll)
      expect(backBox!.x + backBox!.width).toBeCloseTo(
        createBox!.x + createBox!.width,
        0
      )
      expect(
        createBox!.y - backBox!.y - backBox!.height
      ).toBeGreaterThanOrEqual(7.5)
      await testInfo.attach("namecard-wall-actions", {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })

      await back.click()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      await expect(back).toHaveCount(0)
    }
  )

  test("namecard wall changes page size and jumps to a page", async ({
    page,
    api,
  }) => {
    installEmptyWikiCatalogMock(api)
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })

    await installAdminAuthMock(page, api, {
      user: {
        username: "namecard-pagination-qa",
        producername: "名片分页检查",
      },
    })
    await api.mockRoute(
      "**/api/cards?**",
      async (route) => {
        const url = new URL(route.request().url())
        const currentPage = Number(url.searchParams.get("page"))
        const pageSize = Number(url.searchParams.get("size"))

        const response = makeNamecardPage(
          // 墙上的可访问名跟随公开卡号：第 N 页只有第 N 张。
          [makeNamecard({ id: currentPage, cardNumber: currentPage })],
          {
            total: 80,
            totalPage: Math.ceil(80 / pageSize),
          }
        )
        await route.fulfill({ status: 200, json: response })
      },
      "GET",
      3
    )
    await api.mockRoute(
      "**/api/reactions?**",
      async (route) => {
        await route.fulfill({ contentType: "application/json", body: "{}" })
      },
      "GET",
      2
    )

    await page.goto("/community/cards")

    await expect(page.getByText("第 1 / 7 页，共 80 张")).toBeVisible()
    await page.getByRole("combobox", { name: "每页显示" }).click()
    await page.getByRole("option", { name: "24 张" }).click()
    await expect(page.getByText("第 1 / 4 页，共 80 张")).toBeVisible()

    await page.getByRole("spinbutton", { name: "跳至" }).fill("3")
    await page.getByRole("button", { name: "跳转" }).click()

    await expect(page.getByText("第 3 / 4 页，共 80 张")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "查看制作人名片 3 正面" })
    ).toBeVisible()
    await expect(page.getByText("制作人名片 #3")).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  })
})
