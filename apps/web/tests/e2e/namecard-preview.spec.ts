import { expect, test } from "@playwright/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { makeNamecard, makeNamecardPage } from "./fixtures/namecards"

const FRONT = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="
const FRONT_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs="
const BACK_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs="

test.beforeEach(async ({ page }) => {
  await installAdminAuthMock(page, { state: "anonymous" })
  const response = makeNamecardPage([
    makeNamecard({
      id: 42,
      image1_url: FRONT,
      image2_url: BACK,
      image1_thumbnail_url: FRONT_THUMBNAIL,
      image2_thumbnail_url: BACK_THUMBNAIL,
    }),
  ])
  await page.route(
    (url) => url.pathname === "/api/cards",
    (route) => route.fulfill({ status: 200, json: response })
  )
  await page.route(
    (url) => url.pathname === "/api/reactions",
    (route) => route.fulfill({ status: 200, json: {} })
  )
})

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

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 42 正面" })
  ).toHaveAttribute("src", FRONT)

  await dialog.getByRole("button", { name: "背面", exact: true }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 42 背面" })
  ).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(1)

  await dialog.press("ArrowLeft")
  await expect(
    dialog.getByRole("img", { name: "制作人名片 42 正面" })
  ).toBeVisible()
})
