import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { makeNamecard, makeNamecardPage } from "./fixtures/namecards"

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

      const response = makeNamecardPage([makeNamecard({ id: currentPage })], {
        total: 80,
        totalPage: Math.ceil(80 / pageSize),
      })
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
    3
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
