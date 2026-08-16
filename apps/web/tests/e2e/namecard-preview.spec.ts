import { expect, test } from "@playwright/test"

const FRONT = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const BACK =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="
const FRONT_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs="
const BACK_THUMBNAIL =
  "data:image/gif;base64,R0lGODlhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs="

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cards?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        list: [
          {
            id: 42,
            image1_url: FRONT,
            image2_url: BACK,
            image1_thumbnail_url: FRONT_THUMBNAIL,
            image2_thumbnail_url: BACK_THUMBNAIL,
            status: "approved",
            created_at: null,
          },
        ],
        total: 1,
        totalPage: 1,
      }),
    })
  })
  await page.route("**/api/reactions?**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "{}" })
  })
})

test("switches both namecard sides without rebuilding the preview", async ({
  page,
}) => {
  await page.goto("/community/cards")
  await expect(page).toHaveURL(/\/community\/cards\?page=1&size=12$/)

  const frontTrigger = page.getByRole("button", {
    name: "查看制作人名片 42 正面",
  })
  await expect(frontTrigger.locator("img")).toHaveAttribute(
    "src",
    FRONT_THUMBNAIL
  )
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

  await dialog.getByRole("button", { name: "放大名片" }).click()
  await dialog.press("ArrowRight")
  await expect(dialog.getByRole("button", { name: "正面" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("blank space closes the preview and restores its trigger", async ({
  page,
}) => {
  await page.goto("/community/cards?page=1&size=12")
  const trigger = page.getByRole("button", {
    name: "查看制作人名片 42 正面",
  })
  await trigger.click()

  await page.getByLabel("名片查看区域").click({ position: { x: 2, y: 2 } })

  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/\/community\/cards\?page=1&size=12$/)
})
