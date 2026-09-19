import type { EditorialSpotlight } from "@imsweb/contracts/editorial"
import { expect, test } from "./fixtures/test"

import { IDOL_FONT_URL } from "~/pages/works/brand-assets"
import { installHomepageLinksMock } from "./fixtures/homepage"
import {
  homeSeededApis,
  installSeededPublicApis,
  type SeededPublicApiRegistration,
} from "./fixtures/public-content"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

type SeededApi = SeededPublicApiRegistration

type BrowserConsoleError = {
  text: string
  sourceUrl: string
}

function unexpectedConsoleErrors(
  path: string,
  errors: BrowserConsoleError[]
): BrowserConsoleError[] {
  if (path !== "/works/sc") return errors

  const hasKnownFontCorsError = errors.some(
    (error) =>
      error.text.includes(IDOL_FONT_URL) || error.sourceUrl === IDOL_FONT_URL
  )
  if (!hasKnownFontCorsError) return errors

  return errors.filter(
    (error) =>
      !error.text.includes(IDOL_FONT_URL) &&
      error.sourceUrl !== IDOL_FONT_URL &&
      error.text !== "Failed to load resource: net::ERR_FAILED"
  )
}

const withCatalog = (path: SeededApi["path"]): SeededApi[] => [
  { path: "/api/wiki/catalog", times: 1 },
  { path, times: 1 },
]

const publicRoutes: Array<{
  path: string
  title: RegExp
  apis: SeededApi[]
}> = [
  { path: "/", title: /IMSWeb/i, apis: homeSeededApis },
  {
    path: "/about",
    title: /关于我们.*IMSWeb/i,
    apis: withCatalog("/api/about"),
  },
  {
    path: "/events",
    title: /社区动态.*IMSWeb/i,
    apis: withCatalog("/api/events"),
  },
  {
    path: "/recommendations",
    title: /向您推荐.*IMSWeb/i,
    apis: withCatalog("/api/news"),
  },
  {
    path: "/live",
    title: /Live.*IMSWeb/i,
    apis: withCatalog("/api/live-schedule"),
  },
  {
    path: "/community",
    title: /制作人社区.*IMSWeb/i,
    apis: withCatalog("/api/community/exchange/series"),
  },
  {
    path: "/account/login",
    title: /帐号登录.*IMSWeb/i,
    apis: withCatalog("/api/platform/auth/oauth/providers"),
  },
  {
    path: "/account/register",
    title: /帐号注册.*IMSWeb/i,
    apis: withCatalog("/api/platform/auth/oauth/providers"),
  },
  {
    path: "/community/exchange",
    title: /名片交换事务所.*IMSWeb/i,
    apis: [
      { path: "/api/wiki/catalog", times: 1 },
      { path: "/api/community/exchange/series", times: 1 },
      { path: "/api/community/exchange/offices", times: 1 },
      { path: "/api/community/exchange/cards", times: 1 },
      { path: "/api/community/exchange/map/config", times: 1 },
      {
        path: "/api/community/exchange/map/offices",
        times: { min: 1, max: 3 },
      },
    ],
  },
  {
    path: "/community/cards",
    title: /制作人名片墙.*IMSWeb/i,
    apis: [
      { path: "/api/wiki/catalog", times: 1 },
      { path: "/api/cards", times: 1 },
    ],
  },
  {
    path: "/works",
    title: /系列作品.*IMSWeb/i,
    apis: [{ path: "/api/wiki/catalog", times: 1 }],
  },
  {
    path: "/wiki",
    title: /剧情档案.*IMSWeb/i,
    apis: withCatalog("/api/wiki/random_bg"),
  },
  {
    path: "/wiki/modern",
    title: /剧情档案.*IMSWeb/i,
    apis: withCatalog("/api/wiki/random_bg"),
  },
  {
    path: "/wiki/classic",
    title: /经典剧情导航.*IMSWeb/i,
    apis: withCatalog("/api/wiki/random_bg"),
  },
  {
    path: "/story",
    title: /剧情详情.*IMSWeb/i,
    apis: [{ path: "/api/wiki/catalog", times: 1 }],
  },
  {
    path: "/story/modern",
    title: /剧情详情.*IMSWeb/i,
    apis: [{ path: "/api/wiki/catalog", times: 1 }],
  },
  {
    path: "/story/classic",
    title: /经典剧情详情.*IMSWeb/i,
    apis: [{ path: "/api/wiki/catalog", times: 1 }],
  },
  {
    path: "/works/sc",
    title: /SHINY COLORS.*IMSWeb/i,
    apis: [{ path: "/api/wiki/catalog", times: 1 }],
  },
  {
    path: "/chronicle",
    title: /活动编年史.*IMSWeb/i,
    apis: withCatalog("/api/chronicle"),
  },
]

test.describe("home smoke", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders a healthy IMSWeb document`, async ({
      page,
      api,
    }) => {
      installSeededPublicApis(api, route.apis)
      const consoleErrors: BrowserConsoleError[] = []
      const pageErrors: string[] = []

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push({
            text: message.text(),
            sourceUrl: message.location().url,
          })
        }
      })
      page.on("pageerror", (error) => {
        pageErrors.push(error.message)
      })

      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      })

      expect(
        response,
        "the document request should return a response"
      ).not.toBeNull()
      expect(
        response!.status(),
        `${route.path} should be reachable`
      ).toBeLessThan(400)
      await expect(page).toHaveTitle(route.title)
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
      await expect(page.locator("main#main-content")).toBeVisible()
      await expect(page.locator("main#main-content")).not.toBeEmpty()
      if (
        route.path === "/wiki/classic" ||
        route.path === "/story/classic" ||
        route.path === "/community/exchange"
      ) {
        await expect(page.getByTestId("series-icon-background")).toHaveCount(0)
      } else {
        await expect(
          page.getByRole("link", { name: "跳到主要内容" })
        ).toHaveAttribute("href", "#main-content")
        const background = page.getByTestId("series-icon-background")
        await expect(background).toBeVisible()
        await expect(background).toHaveCount(1)
        await expect(background.locator(".series-icon-motif")).toHaveCount(12)
      }
      await page.waitForLoadState("networkidle")

      expect(
        unexpectedConsoleErrors(route.path, consoleErrors),
        "the page should not log unexpected console errors"
      ).toEqual([])
      expect(pageErrors, "the page should not raise uncaught errors").toEqual(
        []
      )
    })
  }

  test("the interface stays Chinese when an English preference is stored", async ({
    page,
    api,
  }) => {
    installSeededPublicApis(api, homeSeededApis)
    await page.addInitScript(() => {
      window.localStorage.setItem("imsweb.language", "en")
    })
    await page.goto("/")

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
    await expect(
      page.locator(
        'button[aria-label*="切换至"], button[aria-label^="Switch to"]'
      )
    ).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("imsweb.language")))
      .toBe("zh-CN")
  })

  test.skip("work detail loads its character directly from R2", async ({
    page,
    api,
  }) => {
    installSeededPublicApis(api, [
      { path: "/api/wiki/catalog", times: { min: 0, max: 1 } },
    ])
    const legacyAssetRequests: string[] = []
    page.on("request", (request) => {
      const url = request.url()
      if (
        url.includes("/assets/images/Production/") ||
        url.includes("/assets/font/IrisIdol.ttf")
      ) {
        legacyAssetRequests.push(url)
      }
    })
    const characterResponse = page.waitForResponse((response) =>
      response
        .url()
        .startsWith("https://imas-assets.texasoct.tech/brand/works/sc/")
    )

    await page.goto("/works/sc")

    const character = page.getByRole("img", {
      name: "SHINY COLORS 角色立绘",
    })
    await expect(character).toBeVisible()
    await expect(character).toHaveAttribute(
      "src",
      /^https:\/\/imas-assets\.texasoct\.tech\/brand\/works\/sc\//
    )
    await expect
      .poll(() =>
        character.evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBeGreaterThan(0)
    expect((await characterResponse).status()).toBe(200)
    expect(legacyAssetRequests).toEqual([])
  })

  // The idolFont face does not actually render anywhere today. R2 serves
  // iris-idol.ttf without an Access-Control-Allow-Origin header, and webfonts are
  // always fetched in CORS mode, so every engine rejects it and /works/* silently
  // falls back to Georgia. `font-display: swap` hides the failure, which is why it
  // went unnoticed.
  //
  // This test previously lived inside the R2 sourcing test as a bare
  // `document.fonts.check()` poll. That call does not trigger a load, so it
  // returned true on Chromium while the font was never fetched -- a vacuous pass
  // that made the suite look like it covered rendering. Requesting the load first
  // makes the real failure visible on every engine.
  //
  // Fix belongs in the bucket/CDN config, not here: send CORS headers for
  // /brand/fonts/**. Un-fixme once that ships.
  test.fixme("work detail actually renders the idolFont face", async ({
    page,
  }) => {
    await page.goto("/works/sc")

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            // load() requests the face; check() alone never does.
            await document.fonts.load("16px idolFont")
            return document.fonts.check("16px idolFont")
          }),
        { timeout: 15000 }
      )
      .toBe(true)
  })

  test(
    "mobile navigation keeps link semantics and closes after routing",
    {
      tag: "@mobile",
    },
    async ({ page, api, isMobile }) => {
      test.skip(!isMobile, "mobile navigation is hidden on desktop")
      installSeededPublicApis(
        api,
        homeSeededApis.map((registration) =>
          registration.path === "/api/events"
            ? { ...registration, times: 2 }
            : registration
        )
      )

      const consoleErrors: string[] = []
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
      })

      await page.goto("/")
      const trigger = page.getByRole("button", {
        name: /打开导航|Open navigation/,
      })
      await expect(trigger).toBeEnabled()
      await trigger.click()

      const dialog = page.getByRole("dialog", {
        name: /站点导航|Site navigation/,
      })
      await expect(dialog).toBeVisible()
      const navigation = dialog.getByRole("navigation", {
        name: /移动端主导航|Mobile navigation/,
      })
      const eventsLink = navigation.getByRole("link", {
        name: /社区动态|Events/,
        exact: true,
      })

      await expect(eventsLink).toHaveAttribute("href", "/events")
      await eventsLink.click()
      await expect(page).toHaveURL(/\/events$/)
      await expect(
        page.getByRole("dialog", { name: /站点导航|Site navigation/ })
      ).toBeHidden()
      // The events page fetches its first page from an effect, so the URL change
      // alone does not prove the request reached the network. Without this wait
      // the /api/events expectation above can race the teardown. The empty state
      // renders only once the response has arrived, which makes the second call a
      // fact rather than a matter of scheduling.
      await expect(page.getByText("当前没有已发布社区动态")).toBeVisible()
      expect(consoleErrors).toEqual([])
    }
  )

  test(
    "homepage navigation keeps secondary destinations in the directory",
    {
      tag: ["@mobile", "@firefox"],
    },
    async ({ page, api, isMobile }) => {
      if (process.env.CAPTURE_HEADER_QA === "1") {
        await page.addInitScript(() => {
          localStorage.setItem("imsweb.language", "zh-CN")
        })
      }
      installHomepageLinksMock(api)
      installSeededPublicApis(
        api,
        homeSeededApis.filter(
          (registration) => registration.path !== "/api/homepage-links"
        )
      )
      await page.goto("/")

      if (isMobile) {
        const trigger = page.getByRole("button", {
          name: /打开导航|Open navigation/,
        })
        await expect(trigger).toBeEnabled()
        await trigger.click()
      }

      const navigation = isMobile
        ? page
            .getByRole("dialog", { name: /站点导航|Site navigation/ })
            .getByRole("navigation", {
              name: /移动端主导航|Mobile navigation/,
            })
        : page.getByRole("navigation", { name: /主导航|Main navigation/ })
      await expect(navigation.locator("a")).toHaveCount(isMobile ? 7 : 6)

      for (const primaryHref of [
        "/",
        "/events",
        "/recommendations",
        "/live",
        "/community",
        "/about",
      ]) {
        await expect(
          navigation.locator(`a[href="${primaryHref}"]`)
        ).toBeVisible()
      }
      for (const secondaryHref of [
        "/community/exchange",
        "/community/cards",
        "/producer-map",
        "/works",
        "/chronicle",
      ]) {
        await expect(
          navigation.locator(`a[href="${secondaryHref}"]`)
        ).toHaveCount(0)
      }
      await expect(page.locator('a[href="/runninggame/"]')).toHaveCount(0)
      await expect(
        (isMobile ? navigation : page.getByRole("banner")).getByRole("link", {
          name: /剧情站|Story Archive/,
        })
      ).toHaveAttribute("href", "/wiki")
      if (isMobile) {
        await page.keyboard.press("Escape")
        await expect(navigation).toBeHidden()
      }

      const directory = page.getByRole("region", { name: "站点导航" })
      for (const href of [
        "/community/exchange",
        "/community/cards",
        "/producer-map",
        "/works",
        "/chronicle",
      ]) {
        await expect(directory.locator(`a[href="${href}"]`)).toBeVisible()
      }
      await expect(
        directory.getByRole("link", { name: /剧情站/ })
      ).toHaveAttribute("href", "/wiki")

      await expect(
        page.getByRole("contentinfo").getByRole("link", {
          name: /剧情站|Story Archive/,
        })
      ).toHaveAttribute("href", "/wiki/")
      if (process.env.CAPTURE_HEADER_QA === "1") {
        await page.getByRole("contentinfo").scrollIntoViewIfNeeded()
        await page.screenshot({
          path: `/tmp/imsweb-footer-story-site-${isMobile ? "mobile" : "desktop"}.png`,
        })
      }
      await expect(
        directory.locator('a[href="/community/cards"]')
      ).toBeVisible()
      await expect(directory.locator('a[href="/producer-map"]')).toBeVisible()

      const friendLinksBox = await page
        .getByRole("region", { name: "友情链接" })
        .boundingBox()
      const siteSupportBox = await page
        .getByRole("region", { name: "网站支持" })
        .boundingBox()
      expect(friendLinksBox).not.toBeNull()
      expect(siteSupportBox).not.toBeNull()
      expect(friendLinksBox!.y).toBeLessThan(siteSupportBox!.y)
    }
  )

  test("theme toggle persists the selected color scheme", async ({
    page,
    api,
  }) => {
    installSeededPublicApis(
      api,
      homeSeededApis.map((registration) => ({
        ...registration,
        times: { min: 1, max: 3 },
      }))
    )
    await page.goto("/")
    await page.evaluate(() => localStorage.setItem("theme", "light"))
    await page.reload()

    const root = page.locator("html")
    const toggle = page.getByRole("button", {
      name: /切换亮色或暗色模式|Toggle light or dark mode/,
    })

    await expect(root).not.toHaveClass(/dark/)
    await page.evaluate(() => {
      const root = document.documentElement
      const observer = new MutationObserver(() => {
        if (root.dataset.themeTransition !== "circle") return

        root.dataset.themeTransitionObserved = "circle"
        observer.disconnect()

        const captureReveal = () => {
          const animation = document.getAnimations().find((candidate) => {
            const effect = candidate.effect
            return (
              effect instanceof KeyframeEffect &&
              effect.pseudoElement === "::view-transition-new(root)"
            )
          })
          const effect = animation?.effect

          if (!(effect instanceof KeyframeEffect)) {
            requestAnimationFrame(captureReveal)
            return
          }

          const keyframes = effect.getKeyframes()
          root.dataset.themeTransitionDuration = String(
            effect.getTiming().duration
          )
          root.dataset.themeTransitionStart = String(keyframes[0]?.clipPath)
          root.dataset.themeTransitionEnd = String(keyframes.at(-1)?.clipPath)
        }
        requestAnimationFrame(captureReveal)
      })
      observer.observe(root, { attributes: true })
    })
    await toggle.click()
    await expect(root).toHaveClass(/dark/)
    await expect(root).toHaveAttribute(
      "data-theme-transition-observed",
      "circle"
    )
    await expect(root).toHaveAttribute("data-theme-transition-duration", "500")
    await expect(root).toHaveAttribute(
      "data-theme-transition-start",
      /circle\(0px at [\d.]+px [\d.]+px\)/
    )
    await expect(root).toHaveAttribute(
      "data-theme-transition-end",
      /circle\([\d.]+px at [\d.]+px [\d.]+px\)/
    )
    await expect(root).not.toHaveAttribute("data-theme-transition")
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("theme")))
      .toBe("dark")

    await page.reload()
    await expect(root).toHaveClass(/dark/)
    await page.waitForLoadState("networkidle")
  })

  test(
    "home exposes current discovery and birthday interactions",
    {
      tag: "@mobile",
    },
    async ({ page, api, isMobile }) => {
      installHomepageLinksMock(api)
      installSeededPublicApis(
        api,
        homeSeededApis
          .filter(
            (registration) =>
              registration.path !== "/api/homepage-links" &&
              registration.path !== "/api/community-posts/spotlight"
          )
          .map((registration) =>
            registration.path === "/api/wiki/random_idol"
              ? { ...registration, times: 2 }
              : registration
          )
      )
      api.mockRoute(
        "/api/community-posts/spotlight",
        async (route) => {
          const response = { items: [] } satisfies EditorialSpotlight
          await route.fulfill({ status: 200, json: response })
        },
        "GET"
      )

      await page.goto("/")

      const brandBackground = page.getByTestId("series-icon-background")
      await expect(brandBackground).toBeVisible()
      await expect(brandBackground.locator(".series-icon-motif")).toHaveCount(
        12
      )
      const firstMotif = brandBackground.locator(".series-icon-motif").first()
      await expect(firstMotif).toHaveCSS("filter", "none")
      const initialTransform = await firstMotif.evaluate(
        (element) => element.style.transform
      )
      await expect
        .poll(() => firstMotif.evaluate((element) => element.style.transform))
        .not.toBe(initialTransform)

      const seriesWall = page.getByRole("region", {
        name: "THE iDOLM@STER",
      })
      await expect(seriesWall.getByRole("link")).toHaveCount(6)
      await expect(seriesWall.getByTestId("series-band")).toHaveCount(6)
      await expect(seriesWall.locator("img")).toHaveCount(6)
      await expect(seriesWall.locator("img").first()).toHaveAttribute(
        "src",
        "/brand/series/wall/765pro.webp"
      )
      if (!isMobile) {
        const viewportWidth = page.viewportSize()?.width ?? 0
        const lastSeriesBand = await seriesWall
          .getByTestId("series-band")
          .last()
          .boundingBox()
        expect(lastSeriesBand).not.toBeNull()
        expect(lastSeriesBand!.x + lastSeriesBand!.width).toBeGreaterThan(
          viewportWidth * 0.95
        )
      }

      const directory = page.getByRole("region", { name: "站点导航" })
      await expect(
        directory.getByRole("link", { name: /活动中心/ })
      ).toHaveAttribute("href", "/events")
      await expect(
        directory.locator('a[href="/community/cards"]')
      ).toBeVisible()
      await expect(directory.locator('a[href="/producer-map"]')).toBeVisible()
      await expect(
        directory.getByRole("link", { name: /关于 IMSWeb/ })
      ).toHaveAttribute("href", "/about")

      const calendar = page.getByRole("region", { name: "偶像生日日历" })
      const visibleMonth = calendar.getByTestId("calendar-month")
      const initialMonth = await visibleMonth.innerText()
      await calendar.getByRole("button", { name: "下个月" }).click()
      await expect(visibleMonth).not.toHaveText(initialMonth)
      await calendar.getByRole("button", { name: "今日" }).click()
      await expect(visibleMonth).toHaveText(initialMonth)

      const friendLinks = page.getByRole("region", { name: "友情链接" })
      await expect(
        friendLinks.getByRole("link", { name: /偶像大师 SP 汉化/ })
      ).toHaveAttribute("href", "https://sp.idolmaster.top/")

      const highlights = page.getByRole("region", {
        name: "活动资讯与同人活动",
      })
      await expect(
        highlights.getByRole("status", { name: "正在加载活动资讯" })
      ).toHaveCount(0)
      await expect(highlights.getByRole("link")).toHaveCount(0)
      await expect(
        highlights.getByText("当前没有已发布的活动资讯。")
      ).toBeVisible()

      const randomIdol = page.getByRole("region", { name: "随机担当" })
      await randomIdol.getByRole("button", { name: "随机选择" }).click()
      await expect(randomIdol.getByRole("link")).toHaveCount(1)
      await expect(randomIdol.getByTestId("random-idol-avatar")).toBeVisible()
      await expect(
        randomIdol.getByRole("link", { name: "查看剧情档案" })
      ).toHaveAttribute("href", /^\/story\?agency=.+&idol=.+/)
      await expect(randomIdol.getByText(/剧情站收录/)).toHaveCount(0)

      const siteSupport = page.getByRole("region", { name: "网站支持" })
      await expect(siteSupport.getByRole("link")).toHaveAttribute(
        "href",
        "https://app.rainyun.com/"
      )

      const friendLinksBox = await friendLinks.boundingBox()
      const siteSupportBox = await siteSupport.boundingBox()
      expect(friendLinksBox).not.toBeNull()
      expect(siteSupportBox).not.toBeNull()
      expect(friendLinksBox!.y).toBeLessThan(siteSupportBox!.y)
    }
  )
})
