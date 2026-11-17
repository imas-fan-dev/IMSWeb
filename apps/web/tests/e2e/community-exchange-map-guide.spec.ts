import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"
import {
  expectGuideGeometry,
  guideTitles,
  installMapGuideScene,
  sampleGuideMotion,
} from "./fixtures/map-guide"

test.use({ mapGuide: "new" })

test("animates map tools opening and closing, reverses cleanly and respects reduced motion @mobile @firefox", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "dark",
  })
  await page.goto("/community/exchange")
  await expectGuideGeometry(page, 0)
  await page.getByRole("dialog").getByRole("button", { name: "跳过" }).click()
  const more = page.getByRole("button", { name: "更多地图工具" })
  const menu = page.locator(".exchange-map-tools-menu")
  const sample = () =>
    page.evaluate(
      () =>
        new Promise<{ opacity: number | null; ending: boolean }[]>(
          (resolve) => {
            const frames: { opacity: number | null; ending: boolean }[] = []
            const capture = () => {
              const popup = document.querySelector(".exchange-map-tools-menu")
              frames.push({
                opacity: popup ? Number(getComputedStyle(popup).opacity) : null,
                ending: popup?.hasAttribute("data-ending-style") ?? false,
              })
              if (frames.length === 16) resolve(frames)
              else requestAnimationFrame(capture)
            }
            requestAnimationFrame(capture)
          }
        )
    )
  const opening = sample()
  await more.click()
  const openFrames = await opening
  await expect(menu).toHaveCSS("opacity", "1")
  expect(
    openFrames.some(
      (frame) =>
        frame.opacity !== null && frame.opacity > 0 && frame.opacity < 1
    )
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("map-tools-open.png") })
  const closing = sample()
  await more.click()
  const closeFrames = await closing
  expect(
    closeFrames.some(
      (frame) =>
        frame.ending &&
        frame.opacity !== null &&
        frame.opacity > 0 &&
        frame.opacity < 1
    )
  ).toBe(true)
  await expect(menu).toHaveCount(0)
  await more.click()
  await expect(menu).toHaveCSS("opacity", "1")
  await more.click()
  await expect(more).toHaveAttribute("aria-expanded", "false")
  await expect(menu).toHaveAttribute("data-ending-style", "")
  await more.click()
  await expect(more).toHaveAttribute("aria-expanded", "true")
  await expect(menu).toHaveCount(1)
  await expect(menu).toHaveCSS("opacity", "1")
  await more.click()
  await expect(menu).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" })
  await more.click()
  await expect(menu).toHaveCSS("opacity", "1")
  await expect(menu).toHaveCSS("transform", "none")
  await expect(menu).toHaveCSS("transition-duration", "0s")
  await expect(more.locator("svg")).toHaveCSS("transition-duration", "0s")
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()
  await testInfo.attach("map-tools-animation-frames", {
    body: JSON.stringify(
      { opening: openFrames, closing: closeFrames },
      null,
      2
    ),
    contentType: "application/json",
  })
})

test("moves from the center to each target without accidental dismissal @mobile @firefox", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/community/exchange")
  const card = page.locator("[data-guide-card]")
  const start = await expectGuideGeometry(page, 0)
  const viewport = page.viewportSize()!
  expect(Math.abs(start.x + start.width / 2 - viewport.width / 2)).toBeLessThan(
    1
  )
  expect(
    Math.abs(start.y + start.height / 2 - viewport.height / 2)
  ).toBeLessThan(1)
  await expect(card.getByRole("button", { name: "跳过" })).toBeFocused()
  await page.mouse.click(2, 2)
  await page.mouse.click(20, 200)
  await card.getByRole("heading").click()
  await page.keyboard.press("Escape")
  await expect(card).toBeVisible()
  const motion = await sampleGuideMotion(
    page,
    () => card.getByRole("button", { name: "下一步" }).click(),
    () => expectGuideGeometry(page, 1)
  )
  const end = motion.endpoint
  await testInfo.attach("animation-frames", {
    body: JSON.stringify(motion, null, 2),
    contentType: "application/json",
  })
  expect(
    motion.interpolation.some(
      (frame) =>
        Math.abs(frame.y - start.y) > 0.75 && Math.abs(frame.y - end.y) > 0.75
    )
  ).toBe(true)
  expect(
    new Set(motion.interpolation.map((frame) => Math.round(frame.holeHeight)))
      .size
  ).toBeGreaterThan(2)
  expect(
    motion.transitions.some(
      (transition) => transition.state === "running" && transition.duration > 0
    )
  ).toBe(true)
  expect(motion.frames[0]!.y).toBeCloseTo(start.y, 0)
  expect(motion.frames.at(-1)!.y).toBeCloseTo(end.y, 0)
  await page.screenshot({
    path: testInfo.outputPath("guide-follow-search.png"),
  })
  for (let step = 2; step < guideTitles.length; step++) {
    await card.getByRole("button", { name: "下一步" }).click()
    await expectGuideGeometry(page, step)
    await expect(
      card.getByRole("button", { name: step === 5 ? "开始使用" : "下一步" })
    ).toBeFocused()
    if (step === 2) {
      await page.screenshot({
        path: testInfo.outputPath("guide-follow-directory.png"),
      })
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations
      ).toEqual([])
    }
  }
  await page.keyboard.press("Enter")
  await expect(card).toHaveCount(0)
  await page.getByRole("button", { name: "更多地图工具" }).click()
  await page.getByRole("menuitem", { name: "使用帮助" }).click()
  await expectGuideGeometry(page, 0)
  await expect(card.getByRole("button", { name: "跳过" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "跳过" }).click()
  await expect(card).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem("ims:exchange-map-guide:v1"))
  ).toBe("done")
})

test("fits short viewports and enlarged text with reduced motion @mobile @firefox", async ({
  page,
  api,
}, testInfo) => {
  installMapGuideScene(api)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto("/community/exchange")
  const card = page.locator("[data-guide-card]")
  await expectGuideGeometry(page, 0)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px"
  })
  await expectGuideGeometry(page, 0)
  await page.screenshot({
    path: testInfo.outputPath("guide-320-large-text.png"),
  })
  await card.getByRole("button", { name: "下一步" }).click()
  await expectGuideGeometry(page, 1)
  await expect(card).toHaveCSS("transition-duration", "0s")
  await expect(page.locator("[data-guide-spotlight]")).toHaveCSS(
    "transition-duration",
    "0s"
  )
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ""
  })
  await page.setViewportSize({ width: 844, height: 390 })
  for (let step = 2; step < guideTitles.length; step++) {
    await card.getByRole("button", { name: "下一步" }).click()
    await expectGuideGeometry(page, step)
  }
  await page.screenshot({
    path: testInfo.outputPath("guide-landscape-account.png"),
  })
  await page.setViewportSize({ width: 390, height: 260 })
  await expectGuideGeometry(page, 5)
  await card.getByRole("button", { name: "开始使用" }).click()
  await expect(card).toHaveCount(0)
})
