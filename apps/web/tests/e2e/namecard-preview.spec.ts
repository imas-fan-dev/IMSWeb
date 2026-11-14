import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { makeNamecard, makeNamecardPage } from "./fixtures/namecards"

const FRONT = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="

function pages(front: string, back: string) {
  return [
    {
      pageId: "page-front",
      role: "front" as const,
      order: 1,
      url: front,
      previewUrl: front,
      thumbUrl: front,
      width: 900,
      height: 500,
    },
    {
      pageId: "page-back",
      role: "back" as const,
      order: 2,
      url: back,
      previewUrl: back,
      thumbUrl: back,
      width: 900,
      height: 500,
    },
  ]
}

test.beforeEach(async ({ page, api }) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, { state: "anonymous" })
  const response = makeNamecardPage([
    makeNamecard({ id: 42, pages: pages(FRONT, BACK) }),
  ])
  await api.mockRoute(
    "/api/cards",
    (route) => route.fulfill({ status: 200, json: response }),
    "GET"
  )
  await api.mockRoute(
    "/api/reactions",
    (route) => route.fulfill({ status: 200, json: {} }),
    "GET"
  )
})

test.describe("namecard preview", () => {
  test("switches both namecard sides without rebuilding the preview", async ({
    page,
  }) => {
    await page.goto("/community/cards")
    await expect(page).toHaveURL(/\/community\/cards\?page=1&size=12$/)

    const frontTrigger = page.getByRole("button", {
      name: "查看制作人名片 42 正面",
    })
    await expect(frontTrigger.locator("img")).toBeVisible()
    await frontTrigger.click()

    const detail = page.getByRole("dialog", { name: /制作人名片\s*\d+/ })
    await expect(detail).toBeVisible()
    const previewTrigger = detail.getByRole("button", {
      name: "放大制作人名片 42 正面",
    })
    // data: 地址不会被加上 `?thumb=1`，详情窗的大图就是原图。
    await expect(previewTrigger.locator("img")).toHaveAttribute("src", FRONT)
    await previewTrigger.click()

    const preview = page.getByRole("dialog", {
      name: /制作人名片 42 · (正面|背面)/,
    })
    await expect(preview).toBeVisible()
    await expect(
      preview.getByRole("img", { name: "制作人名片 42 正面" })
    ).toHaveAttribute("src", FRONT)
    await preview
      .getByRole("button", { name: "查看第 2 张（背面）", exact: true })
      .click()
    await expect(
      preview.getByRole("img", { name: "制作人名片 42 背面" })
    ).toHaveAttribute("src", BACK)
    await expect(preview).toBeVisible()

    await preview.press("ArrowLeft")
    await expect(
      preview.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()
    await preview.getByRole("button", { name: "关闭名片预览" }).click()
    await expect(detail).toBeVisible()
    await expect(previewTrigger).toBeFocused()
  })
})
