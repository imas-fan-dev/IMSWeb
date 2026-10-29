import { expect, test } from "./fixtures/test"
import {
  expectGuideGeometry,
  guideTitles,
  installMapGuideScene,
  sampleGuideMotion,
} from "./fixtures/map-guide"

test.use({ mapGuide: "new" })

test("App guide follows targets and keeps its actions accessible @app-iphone @app-android @app-landscape @app-webkit", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/community/exchange")
  const card = page.locator("[data-guide-card]")
  const first = await expectGuideGeometry(page, 0)
  await expect(card).toHaveAttribute("data-guide-compact", "true")
  await page.mouse.click(2, 2)
  await page.keyboard.press("Escape")
  await expect(card).toBeVisible()
  const sampling = sampleGuideMotion(page)
  await card.getByRole("button", { name: "下一步" }).click()
  const frames = await sampling
  const second = await expectGuideGeometry(page, 1)
  expect(
    frames.some(
      (frame) =>
        Math.abs(frame.y - first.y) > 0.75 &&
        Math.abs(frame.y - second.y) > 0.75
    )
  ).toBe(true)
  await testInfo.attach("animation-frames", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  })
  for (let step = 2; step < guideTitles.length; step++) {
    await card.getByRole("button", { name: "下一步" }).click()
    await expectGuideGeometry(page, step)
    if (step === 2 || step === 5)
      await page.screenshot({
        path: testInfo.outputPath(`app-guide-step-${step}.png`),
      })
  }
  await card.getByRole("button", { name: "上一步" }).click()
  await expectGuideGeometry(page, 4)
  await card.getByRole("button", { name: "跳过" }).click()
  await expect(card).toHaveCount(0)
})

test("App guide adapts to safe areas and short screens without motion @app-iphone @app-android @app-landscape @app-webkit", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/community/exchange")
  await expectGuideGeometry(page, 0)
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-top", "47px")
    document.documentElement.style.setProperty("--safe-area-bottom", "34px")
    document.documentElement.style.fontSize = "24px"
    window.dispatchEvent(new Event("resize"))
  })
  const card = page.locator("[data-guide-card]")
  for (let step = 0; step < guideTitles.length; step++) {
    if (step) await card.getByRole("button", { name: "下一步" }).click()
    await expectGuideGeometry(page, step)
  }
  await expect(card).toHaveCSS("transition-duration", "0s")
  await page.setViewportSize({ width: 390, height: 300 })
  await expectGuideGeometry(page, 5)
  await page.screenshot({
    path: testInfo.outputPath("app-guide-short-safe-area.png"),
  })
  await card.getByRole("button", { name: "开始使用" }).click()
  await expect(card).toHaveCount(0)
})
