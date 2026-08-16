import { expect, test } from "@playwright/test"

test("namecard wall changes page size and jumps to a page", async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })

  await page.route("**/api/check", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        user: {
          id: 1,
          username: "namecard-pagination-qa",
          producername: "名片分页检查",
          dept: "op",
          adminRole: "admin",
        },
      }),
    })
  })
  await page.route("**/api/cards?**", async (route) => {
    const url = new URL(route.request().url())
    const currentPage = Number(url.searchParams.get("page"))
    const pageSize = Number(url.searchParams.get("size"))

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        list: [
          {
            id: currentPage,
            image1_url:
              "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
            image2_url:
              "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs=",
            image1_thumbnail_url:
              "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
            image2_thumbnail_url:
              "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs=",
            status: "approved",
            created_at: null,
          },
        ],
        total: 80,
        totalPage: Math.ceil(80 / pageSize),
      }),
    })
  })
  await page.route("**/api/reactions?**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "{}" })
  })

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
