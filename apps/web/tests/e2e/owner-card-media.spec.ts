import { test } from "./fixtures/test"

// Exercise the shared authenticated media workflow on ordinary Web too.
import "./app-owner-card-media.spec"

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
})
