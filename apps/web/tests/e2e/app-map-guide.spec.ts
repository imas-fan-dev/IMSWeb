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
  const navigation = page.locator("nav[aria-label]")
  const first = await expectGuideGeometry(page, 0)
  await expect(navigation).toBeVisible()
  await expect(navigation).toHaveAttribute("inert", "")
  await navigation.locator('a[href="/"]').click({ force: true })
  await expect(page).toHaveURL(/\/community\/exchange$/)
  await expect(card).toBeVisible()
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
    await expect(navigation).toBeVisible()
    await expect(navigation).toHaveAttribute("inert", "")
    if (step === 2 || step === 5)
      await page.screenshot({
        path: testInfo.outputPath(`app-guide-step-${step}.png`),
      })
  }
  await card.getByRole("button", { name: "上一步" }).click()
  await expectGuideGeometry(page, 4)
  await card.getByRole("button", { name: "跳过" }).click()
  await expect(card).toHaveCount(0)
  await expect(navigation).not.toHaveAttribute("inert")
})

test("App guide adapts to safe areas and short screens without motion @app-iphone @app-android @app-landscape @app-webkit", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" })
  await page.goto("/community/exchange")
  await expect(page.locator("html")).toHaveClass(/dark/)
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
  const contrast = await page
    .locator(".exchange-map-tools-menu")
    .evaluate((menu) => {
      const context = document.createElement("canvas").getContext("2d")!
      function rgba(color: string) {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return Array.from(context.getImageData(0, 0, 1, 1).data)
      }
      const css = getComputedStyle(menu)
      const background = rgba(css.backgroundColor),
        foreground = rgba(css.color)
      const luminance = (color: number[]) =>
        color
          .map((channel) => {
            const value = channel / 255
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4
          })
          .reduce(
            (total, channel, i) =>
              total + channel * [0.2126, 0.7152, 0.0722][i],
            0
          )
      return Math.min(
        ...[0, 255].map((underlay) => {
          const bg = background
            .slice(0, 3)
            .map(
              (channel) =>
                (channel * background[3]) / 255 +
                underlay * (1 - background[3] / 255)
            )
          const fg = foreground
            .slice(0, 3)
            .map(
              (channel, i) =>
                (channel * foreground[3]) / 255 +
                bg[i] * (1 - foreground[3] / 255)
            )
          const a = luminance(bg),
            b = luminance(fg)
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        })
      )
    })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await expect(card).toHaveCSS("transition-duration", "0s")
  await page.setViewportSize({ width: 390, height: 300 })
  await expectGuideGeometry(page, 5)
  await page.screenshot({
    path: testInfo.outputPath("app-guide-short-safe-area.png"),
  })
  await card.getByRole("button", { name: "开始使用" }).click()
  await expect(card).toHaveCount(0)
})
