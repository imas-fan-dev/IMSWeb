import { expect, test } from "./fixtures/test"
import "./office-message-wall.spec"

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("无名片作者"))
    await page.addInitScript(() => {
      localStorage.setItem("ims.platform.access-token", "wall-app-access-token")
    })
})

test.afterEach(async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")
})
