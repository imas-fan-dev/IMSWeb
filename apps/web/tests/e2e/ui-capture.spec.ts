import fs from "node:fs"

import { expect, test } from "./fixtures/test"
import {
  captureRecipe,
  installCaptureApis,
  visibleImageFailures,
} from "./fixtures/ui-capture"

type CaptureScene = {
  id: string
  pageId: string
  scenarioId: string
  recipe: string
  path: string
  title?: string
}
const input = process.env.IMS_UI_CAPTURE_PLAN
const scenes: CaptureScene[] = input
  ? (
      JSON.parse(fs.readFileSync(input, "utf8")) as {
        scenarios: CaptureScene[]
      }
    ).scenarios
  : []

for (const scene of scenes) {
  const recipe = captureRecipe(scene.recipe)
  if (recipe.path !== scene.path)
    throw new Error(`Capture recipe/path mismatch: ${scene.id}`)
  test(`ui-capture:${scene.id} @mobile`, async ({
    page,
    api,
    browser,
    baseURL,
  }, info) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await info.attach("ui-capture-meta", {
      body: JSON.stringify({
        pageId: scene.pageId,
        scenarioId: scene.scenarioId,
        viewport: page.viewportSize(),
        browser: browser.version(),
        origin: baseURL ? new URL(baseURL).origin : null,
        project: info.project.name,
      }),
      contentType: "application/json",
    })
    installCaptureApis(api, scene.recipe)
    await page.addInitScript(() =>
      localStorage.setItem("imsweb.language", "zh-CN")
    )
    try {
      const ready = Promise.all(
        recipe.apis.map(({ path }) =>
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === path &&
              response.status() === 200
          )
        )
      )
      const response = await page.goto(recipe.path, {
        waitUntil: "domcontentloaded",
      })
      expect(response?.status()).toBeLessThan(400)
      await expect(page).toHaveTitle(recipe.title)
      await expect(page.locator("main#main-content")).toBeVisible()
      await expect(page.locator("main#main-content")).not.toBeEmpty()
      await ready
      await page.evaluate(() => document.fonts.ready)
      await expect.poll(() => visibleImageFailures(page)).toEqual([])
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          )
        )
        .toBe(true)
      await info.attach("ui-viewport", {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      })
      const height = await page.evaluate(
        () => document.documentElement.scrollHeight
      )
      expect(height, "Full-page capture must remain bounded").toBeLessThan(
        30000
      )
      const step = page.viewportSize()!.height
      for (let offset = step; offset < height; offset += step) {
        await page.evaluate((y) => window.scrollTo(0, y), offset)
        await expect.poll(() => visibleImageFailures(page)).toEqual([])
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      await info.attach("ui-full-page", {
        body: await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      })
      expect(errors, "No uncaught page exceptions").toEqual([])
    } catch (error) {
      try {
        await info.attach("ui-diagnostic", {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        })
      } catch {
        /* Keep the original failure if the browser has already closed. */
      }
      throw error
    }
  })
}
