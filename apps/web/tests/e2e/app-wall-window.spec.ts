import { expect, test } from "./fixtures/test"
import "./office-wall-window.spec"

test.afterEach(async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")
})
