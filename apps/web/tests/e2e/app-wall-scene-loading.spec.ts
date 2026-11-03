import { expect, test } from "./fixtures/test"
import "./wall-scene-loading.spec"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ims.platform.access-token", "wall-app-access-token")
  })
})

test.afterEach(async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")
})
