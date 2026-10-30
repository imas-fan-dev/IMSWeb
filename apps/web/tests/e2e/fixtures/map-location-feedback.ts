import type { Locator, Page } from "@playwright/test"
import { installMapGuideScene } from "./map-guide"
import { expect, test } from "./test"

declare global {
  interface Window {
    __mapLocationFeedback: {
      mode: "pending" | 1 | 2 | 3
      resolve(): void
    }
  }
}

async function installLocationFixture(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    const pending: PositionCallback[] = []
    const coords = {
      longitude: 121.4,
      latitude: 31.2,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({ longitude: 121.4, latitude: 31.2 }),
    }
    const position = {
      coords,
      timestamp: Date.now(),
      toJSON: () => ({ coords, timestamp: Date.now() }),
    }
    window.__mapLocationFeedback = {
      mode: 2,
      resolve: () => {
        for (const success of pending.splice(0)) success(position)
      },
    }
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure?: PositionErrorCallback
        ) {
          const mode = window.__mapLocationFeedback.mode
          if (mode === "pending") pending.push(success)
          else
            failure?.({
              code: mode,
              message: "Browser location fixture",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            })
        },
      },
    })
  })
}

async function rotationFrames(control: Locator) {
  return control.locator("svg").evaluate(async (icon) => {
    const frames: string[] = []
    for (let i = 0; i < 12; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
      frames.push(getComputedStyle(icon).transform)
    }
    return [...new Set(frames)]
  })
}

export function registerMapLocationFeedbackTests() {
  const tags = ["@mobile", "@app-iphone", "@app-android", "@app-landscape"]

  test(
    "map location feedback retries, dismisses and clears controls",
    { tag: tags },
    async ({ page, api }, info) => {
      installMapGuideScene(api)
      await installLocationFixture(page)
      await page.goto("/community/exchange")
      const locate = page.getByRole("button", { name: "回到我的位置" })
      await expect(locate).toBeEnabled()
      await page.evaluate(() => {
        window.__mapLocationFeedback.mode = 1
      })
      await locate.click()
      const notice = page.locator("[data-map-location-notice]")
      await expect(notice).toContainText("未获得位置权限")
      await expect(
        notice.getByRole("button", { name: "重试定位" })
      ).toBeVisible()
      const fit = await notice.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const obstacles = [
          document.querySelector('[data-map-guide="search"]'),
          document.querySelector('[aria-label="回到我的位置"]'),
          document.querySelector('nav[aria-label="主导航"]'),
        ].filter((element): element is Element => element !== null)
        return {
          inside:
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.top >= 0 &&
            box.bottom <= innerHeight,
          clear: obstacles.every((element) => {
            const other = element.getBoundingClientRect()
            return (
              box.right <= other.left ||
              box.left >= other.right ||
              box.bottom <= other.top ||
              box.top >= other.bottom
            )
          }),
          touch: [...node.querySelectorAll("button")].every(
            (button) =>
              button.getBoundingClientRect().height >= 44 &&
              button.getBoundingClientRect().width >= 44
          ),
        }
      })
      expect(fit).toEqual({ inside: true, clear: true, touch: true })
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--safe-area-right", "44px")
        document.documentElement.style.setProperty("--safe-area-top", "44px")
      })
      const safeFit = await notice.evaluate((node) => {
        const box = node.getBoundingClientRect()
        return box.right <= innerWidth - 108 && box.top >= 44
      })
      expect(safeFit).toBe(true)
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("--safe-area-right")
        document.documentElement.style.removeProperty("--safe-area-top")
      })
      await page.screenshot({
        path: info.outputPath("location-permission-feedback.png"),
      })
      await page.evaluate(() => {
        window.__mapLocationFeedback.mode = "pending"
      })
      try {
        await notice.getByRole("button", { name: "重试定位" }).click()
        await expect(locate).toHaveAttribute("aria-busy", "true")
        await expect(locate).toBeDisabled()
        await expect(notice).toHaveCount(0)
        expect((await rotationFrames(locate)).length).toBeGreaterThan(2)
        await page.emulateMedia({ reducedMotion: "reduce" })
        expect(
          await locate
            .locator("svg")
            .evaluate((icon) => getComputedStyle(icon).animationName)
        ).toBe("none")
      } finally {
        await page.evaluate(() => window.__mapLocationFeedback.resolve())
      }
      await expect(locate).toBeEnabled()
      await expect(locate).toHaveAttribute("aria-busy", "false")
      await expect(notice).toHaveCount(0)
      await page.evaluate(() => {
        window.__mapLocationFeedback.mode = 3
      })
      await locate.click()
      await expect(notice).toContainText("获取位置超时，请重试")
      await notice.getByRole("button", { name: "关闭定位提示" }).click()
      await expect(notice).toHaveCount(0)
      if (await page.locator("[data-app-search]").count()) {
        await page.getByRole("button", { name: "展开地点查找" }).click()
        await expect(locate).toBeHidden()
        await page.getByRole("button", { name: "取消", exact: true }).click()
        await expect(locate).toBeVisible()
      }
    }
  )

  test(
    "map directory refresh keeps spinning until its request finishes",
    { tag: tags },
    async ({ page, api }) => {
      let hold = false
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      installMapGuideScene(api, {
        beforeDirectory: () => (hold ? pending : undefined),
      })
      await installLocationFixture(page)
      await page.goto("/community/exchange")
      const refresh = page.getByRole("button", {
        name: /^刷新(名录|地图结果)$/,
      })
      await expect(refresh).toBeEnabled()
      hold = true
      try {
        await refresh.click()
        await expect(refresh).toHaveAttribute("aria-busy", "true")
        await expect(refresh).toBeDisabled()
        expect((await rotationFrames(refresh)).length).toBeGreaterThan(2)
        await page.emulateMedia({ reducedMotion: "reduce" })
        expect(
          await refresh
            .locator("svg")
            .evaluate((icon) => getComputedStyle(icon).animationName)
        ).toBe("none")
      } finally {
        release()
      }
      await expect(refresh).not.toHaveAttribute("aria-busy", "true")
      await expect(refresh).toBeEnabled()
    }
  )
}
