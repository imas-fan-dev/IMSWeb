import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { expect, test } from "./fixtures/test"
import "./community-exchange.spec"

test.afterEach(async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")
})

test.beforeEach(async ({ api, page }, testInfo) => {
  if (!testInfo.title.includes("discovers an exchange office"))
    installEmptyWikiCatalogMock(api)
  if (testInfo.title.includes("card owner"))
    await page.addInitScript(() => {
      localStorage.setItem("ims.platform.access-token", "wall-app-access-token")
    })
})
