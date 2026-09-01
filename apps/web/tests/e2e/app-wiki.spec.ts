import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }, testInfo) => {
  const landscape = testInfo.project.name === "app-landscape"
  await page.addInitScript(
    ({ top, right, bottom, left }) => {
      window.localStorage.setItem("imsweb.language", "zh-CN")
      document.documentElement.style.setProperty("--safe-area-top", top)
      document.documentElement.style.setProperty("--safe-area-right", right)
      document.documentElement.style.setProperty("--safe-area-bottom", bottom)
      document.documentElement.style.setProperty("--safe-area-left", left)
    },
    landscape
      ? { top: "0px", right: "47px", bottom: "21px", left: "47px" }
      : { top: "47px", right: "0px", bottom: "34px", left: "0px" }
  )
})

test("keeps the modern Wiki dial and search inside the App viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/wiki")
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")

  const dialTrigger = page.getByRole("button", { name: "打开企划拨盘" })
  const searchTrigger = page.getByRole("button", { name: "打开全屏搜索" })
  await expect(dialTrigger).toBeVisible()
  await expect(searchTrigger).toBeVisible()

  await dialTrigger.click()
  const dialDialog = page.getByRole("dialog", { name: "选择企划" })
  const dial = page.getByRole("group", { name: "企划拨盘" })
  await expect(dialDialog).toBeVisible()
  await expect(dial).toBeVisible()
  const minimumDialWidth = Math.min(
    280,
    (page.viewportSize()?.height ?? 844) * 0.48
  )
  await expect
    .poll(() =>
      dial.evaluate((element) => element.getBoundingClientRect().width)
    )
    .toBeGreaterThanOrEqual(minimumDialWidth)
  const dialGeometry = await dial.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      appViewportHeight: style.getPropertyValue("--app-viewport-height").trim(),
      appBottomClearance: style
        .getPropertyValue("--app-bottom-clearance")
        .trim(),
    }
  })
  expect(dialGeometry.appViewportHeight).not.toBe("")
  expect(dialGeometry.appBottomClearance).not.toBe("")
  expect(dialGeometry.width).toBeGreaterThanOrEqual(minimumDialWidth)
  expect(
    Math.abs(dialGeometry.width - dialGeometry.height)
  ).toBeLessThanOrEqual(1)
  expect(dialGeometry.left).toBeGreaterThanOrEqual(-1)
  expect(dialGeometry.right).toBeLessThanOrEqual(dialGeometry.viewportWidth + 1)
  expect(dialGeometry.top).toBeGreaterThanOrEqual(-1)
  expect(dialGeometry.bottom).toBeLessThanOrEqual(
    dialGeometry.viewportHeight + 1
  )

  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-wiki-dial-${testInfo.project.name}.png`,
    })
  }

  await page.keyboard.press("Escape")
  await expect(dialDialog).toBeHidden()

  await searchTrigger.click()
  const searchDialog = page.getByRole("dialog", { name: "搜索 Wiki" })
  await expect(searchDialog).toBeVisible()
  await expect(
    searchDialog.getByPlaceholder("搜索全站偶像或内容页")
  ).toBeVisible()
  const searchGeometry = await searchDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      viewportHeight: window.innerHeight,
      appHeaderInset: style.getPropertyValue("--app-header-inset").trim(),
      appViewportHeight: style.getPropertyValue("--app-viewport-height").trim(),
    }
  })
  expect(searchGeometry.appHeaderInset).not.toBe("")
  expect(searchGeometry.appViewportHeight).not.toBe("")
  expect(searchGeometry.top).toBeGreaterThanOrEqual(0)
  expect(searchGeometry.bottom).toBeLessThanOrEqual(
    searchGeometry.viewportHeight + 1
  )
  expect(searchGeometry.height).toBeGreaterThan(
    searchGeometry.viewportHeight * 0.7
  )

  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-wiki-search-${testInfo.project.name}.png`,
    })
  }
})
