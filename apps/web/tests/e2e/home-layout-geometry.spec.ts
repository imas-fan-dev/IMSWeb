import { expect, test } from "./fixtures/test"

import { installHomepageLinksMock } from "./fixtures/homepage"
import {
  homeSeededApis,
  installSeededPublicApis,
} from "./fixtures/public-content"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test.describe("home layout geometry", () => {
  test(
    "work detail content stays below the sticky site header",
    {
      tag: "@mobile",
    },
    async ({ page, api, isMobile }) => {
      installSeededPublicApis(api, [{ path: "/api/wiki/catalog", times: 1 }])
      if (!isMobile) await page.setViewportSize({ width: 1600, height: 900 })
      await page.goto("/works/sc")
      const header = page.getByRole("banner")
      const title = page.getByRole("heading", {
        name: "THE IDOLM@STER",
        exact: true,
      })
      await expect(header).toBeVisible()
      await expect(title).toBeVisible()
      const headerBox = await header.boundingBox()
      const titleBox = await title.boundingBox()
      expect(headerBox).not.toBeNull()
      expect(titleBox).not.toBeNull()
      expect(titleBox!.y).toBeGreaterThanOrEqual(
        headerBox!.y + headerBox!.height
      )
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false)
      if (!isMobile) {
        const copyBox = await page.getByTestId("work-detail-copy").boundingBox()
        const navBox = await page.getByTestId("work-nav-card").boundingBox()
        expect(copyBox).not.toBeNull()
        expect(navBox).not.toBeNull()
        expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(navBox!.x)
      }
    }
  )

  test(
    "work detail keeps narrow-screen copy inside the viewport",
    { tag: "@extended" },
    async ({ page, api }) => {
      installSeededPublicApis(api, [{ path: "/api/wiki/catalog", times: 1 }])
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.goto("/works/sc")
      await expect(
        page.getByRole("heading", { name: "THE IDOLM@STER", exact: true })
      ).toBeVisible()
      const copyBox = await page.getByTestId("work-detail-copy").boundingBox()
      expect(copyBox).not.toBeNull()
      expect(copyBox!.x).toBeGreaterThanOrEqual(0)
      expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(768)
    }
  )

  test("desktop navigation marks each destination and follows a clicked link", async ({
    page,
    api,
  }) => {
    installSeededPublicApis(api, [
      { path: "/api/wiki/random_idol", times: 1 },
      { path: "/api/wiki/catalog", times: 1 },
      { path: "/api/community-posts/spotlight", times: 1 },
      { path: "/api/homepage-links", times: 1 },
      { path: "/api/news", times: 2 },
      { path: "/api/events", times: 2 },
      { path: "/api/live-schedule", times: 1 },
      { path: "/api/community/content", times: 1 },
      { path: "/api/community/exchange/series", times: 1 },
      { path: "/api/about", times: 1 },
    ])
    await page.setViewportSize({ width: 1600, height: 900 })
    const navigation = page.getByRole("navigation", {
      name: /主导航|Main navigation/,
    })
    const ready = (paths: string[]) =>
      Promise.all(
        paths.map((path) =>
          page.waitForResponse(
            (response) =>
              response.request().method() === "GET" &&
              new URL(response.url()).pathname === path &&
              response.status() === 200
          )
        )
      )
    const homePaths = homeSeededApis.map(({ path }) => path)
    const initialHome = ready(homePaths)
    await page.goto("/")
    await initialHome
    for (const [destination, paths] of [
      ["/events", ["/api/events"]],
      ["/recommendations", ["/api/news"]],
      ["/live", ["/api/live-schedule"]],
      [
        "/community",
        ["/api/community/content", "/api/community/exchange/series"],
      ],
      ["/about", ["/api/about"]],
    ] as const) {
      const contentReady = ready([...paths])
      const link = navigation.locator(`a[href="${destination}"]`)
      await link.click()
      await contentReady
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute("aria-current", "page")
    }
    await expect(page).toHaveURL(/\/about$/)
    await expect(navigation.locator('a[href="/about"]')).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
  })

  test(
    "homepage directory uses compact responsive columns",
    { tag: "@extended" },
    async ({ page, api }) => {
      installHomepageLinksMock(api)
      installSeededPublicApis(
        api,
        homeSeededApis
          .filter((registration) => registration.path !== "/api/homepage-links")
          .map((registration) =>
            registration.path === "/api/news" ||
            registration.path === "/api/events"
              ? { ...registration, times: 2 }
              : registration
          )
      )
      await page.goto("/")
      const directory = page.getByRole("region", { name: "站点导航" })
      const grid = directory.getByTestId("portal-directory-grid")
      await expect(grid.locator('a[href="/community/exchange"]')).toBeVisible()
      for (const viewport of [
        { width: 320, columns: 2 },
        { width: 375, columns: 2 },
        { width: 430, columns: 2 },
        { width: 640, columns: 2 },
        { width: 1024, columns: 3 },
      ]) {
        await page.setViewportSize({ width: viewport.width, height: 900 })
        await expect
          .poll(() =>
            grid.evaluate(
              (element) =>
                getComputedStyle(element)
                  .gridTemplateColumns.split(" ")
                  .filter(Boolean).length
            )
          )
          .toBe(viewport.columns)
        expect(
          await grid.evaluate(
            (element) => element.scrollWidth > element.clientWidth
          )
        ).toBe(false)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth
          )
        ).toBe(false)
      }
    }
  )

  test(
    "default wiki hero exposes the classic view without overflow",
    { tag: "@mobile" },
    async ({ page, api }) => {
      installSeededPublicApis(api, [
        { path: "/api/wiki/catalog", times: { min: 0, max: 1 } },
        { path: "/api/wiki/random_bg", times: { min: 0, max: 1 } },
      ])
      await page.goto("/wiki")
      const hero = page.getByRole("region", { name: "剧情档案视觉" })
      await expect(hero).toBeVisible()
      await expect(hero.getByRole("link", { name: "经典视图" })).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false)
    }
  )

  test("home random idol exposes its agency and archive link", async ({
    page,
    api,
  }) => {
    installSeededPublicApis(api, homeSeededApis)
    await page.goto("/")
    const randomIdol = page.getByRole("region", { name: "随机担当" })
    await expect(randomIdol.getByTestId("random-idol-avatar")).toBeVisible()
    await expect(
      randomIdol.getByTestId("random-idol-agency-marker")
    ).toBeVisible()
    await expect(
      randomIdol.getByRole("link", { name: "查看剧情档案" })
    ).toBeVisible()
  })
})
