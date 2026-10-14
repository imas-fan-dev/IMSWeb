import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { makeNamecard, makeNamecardPage } from "./fixtures/namecards"

const FRONT = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="
const FRONT_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs="
const BACK_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs="

test.beforeEach(async ({ page, api }) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, { state: "anonymous" })
  const response = makeNamecardPage([
    makeNamecard({
      id: 42,
      image1_url: FRONT,
      image2_url: BACK,
      image1_thumbnail_url: FRONT_THUMBNAIL,
      image2_thumbnail_url: BACK_THUMBNAIL,
    }),
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

    const detail = page.getByRole("dialog", { name: "制作人名片 42" })
    await expect(detail).toBeVisible()
    const previewTrigger = detail.getByRole("button", {
      name: "放大制作人名片 42 正面",
    })
    await expect(previewTrigger.locator("img")).toHaveAttribute(
      "src",
      FRONT_THUMBNAIL
    )
    await previewTrigger.click()

    const preview = page.getByRole("dialog", {
      name: /制作人名片 42 · (正面|背面)/,
    })
    await expect(preview).toBeVisible()
    await expect(
      preview.getByRole("img", { name: "制作人名片 42 正面" })
    ).toHaveAttribute("src", FRONT)
    await preview.getByRole("button", { name: "背面", exact: true }).click()
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
