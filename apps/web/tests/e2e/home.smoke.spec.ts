import { expect, test } from "@playwright/test"

const publicRoutes = [
  { path: "/", title: /IMSWeb/i },
  { path: "/about", title: /关于我们.*IMSWeb/i },
  { path: "/events", title: /活动.*IMSWeb/i },
  { path: "/recommendations", title: /向您推荐.*IMSWeb/i },
  { path: "/live", title: /Live.*IMSWeb/i },
  { path: "/community", title: /制作人社区.*IMSWeb/i },
  { path: "/community/cards", title: /制作人名片墙.*IMSWeb/i },
  { path: "/works", title: /同人作品.*IMSWeb/i },
  { path: "/wiki", title: /剧情档案.*IMSWeb/i },
  { path: "/wiki/classic", title: /经典剧情导航.*IMSWeb/i },
  { path: "/works/sc", title: /SHINY COLORS.*IMSWeb/i },
  { path: "/chronicle", title: /活动编年史.*IMSWeb/i },
]

for (const route of publicRoutes) {
  test(`${route.path} renders a healthy IMSWeb document`, async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text())
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
    await expect(
      page.getByRole("link", { name: "跳到主要内容" })
    ).toHaveAttribute("href", "#main-content")

    expect(consoleErrors, "the page should not log console errors").toEqual([])
    expect(pageErrors, "the page should not raise uncaught errors").toEqual([])
  })
}

test("mobile navigation keeps link semantics and closes after routing", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile navigation is hidden on desktop")

  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })

  await page.goto("/")
  await page.getByRole("button", { name: "打开导航" }).click()

  const navigation = page.getByRole("navigation", {
    name: /移动端主导航|Mobile navigation/,
  })
  const eventsLink = navigation.getByRole("link", {
    name: /活动|Events/,
    exact: true,
  })

  await expect(eventsLink).toHaveAttribute("href", "/events")
  await eventsLink.click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(
    page.getByRole("dialog", { name: /站点导航|Site navigation/ })
  ).toBeHidden()
  expect(consoleErrors).toEqual([])
})

test("theme toggle persists the selected color scheme", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.setItem("theme", "light"))
  await page.reload()

  const root = page.locator("html")
  const toggle = page.getByRole("button", {
    name: /切换亮色或暗色模式|Toggle light or dark mode/,
  })

  await expect(root).not.toHaveClass(/dark/)
  await toggle.click()
  await expect(root).toHaveClass(/dark/)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("dark")

  await page.reload()
  await expect(root).toHaveClass(/dark/)
})

test("wiki hero gives story artwork an expanded frame", async ({
  page,
  isMobile,
}) => {
  await page.goto("/wiki")

  const hero = page.getByRole("region", { name: "剧情档案视觉" })
  await expect(hero).toBeVisible()
  const heroBox = await hero.boundingBox()
  expect(heroBox).not.toBeNull()
  expect(heroBox!.height).toBeGreaterThanOrEqual(isMobile ? 448 : 480)

  const artwork = hero.locator("img")
  if ((await artwork.count()) > 0) {
    await expect(artwork).toHaveCSS("opacity", "1")
    await expect(artwork).toHaveCSS("object-fit", "cover")
    await expect(artwork).toHaveCSS("object-position", "50% 25%")
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
})

test("home exposes current discovery and birthday interactions", async ({
  page,
  isMobile,
}) => {
  await page.goto("/")

  const brandBackground = page.getByTestId("series-icon-background")
  await expect(brandBackground).toBeVisible()
  await expect(brandBackground.locator(".series-icon-motif")).toHaveCount(20)
  const firstMotif = brandBackground.locator(".series-icon-motif").first()
  const initialTransform = await firstMotif.evaluate(
    (element) => element.style.transform
  )
  await expect
    .poll(() => firstMotif.evaluate((element) => element.style.transform))
    .not.toBe(initialTransform)

  const seriesWall = page.getByRole("region", {
    name: "偶像大师交流站",
  })
  await expect(seriesWall.getByRole("link")).toHaveCount(0)
  await expect(seriesWall.getByTestId("series-band")).toHaveCount(6)
  await expect(seriesWall.locator("img")).toHaveCount(6)
  await expect(seriesWall.locator("img").first()).toHaveAttribute(
    "src",
    "/brand/series/wall/765pro.png"
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
  await expect(directory.getByRole("link")).toHaveCount(6)
  await expect(
    directory.getByRole("link", { name: /活动中心/ })
  ).toHaveAttribute("href", "/events")
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
  await expect(friendLinks.getByRole("link")).toHaveCount(6)
  await expect(
    friendLinks.getByRole("link", { name: /偶像大师 SP 汉化/ })
  ).toHaveAttribute("href", "https://sp.idolmaster.top/")

  const highlights = page.getByRole("region", {
    name: "活动资讯与同人活动",
  })
  await expect(highlights.getByRole("link")).toHaveCount(6)

  const randomIdol = page.getByRole("region", { name: "随机担当" })
  await randomIdol.getByRole("button", { name: "随机选择" }).click()
  await expect(randomIdol.getByRole("link")).toHaveCount(1)

  const siteSupport = page.getByRole("region", { name: "网站支持" })
  await expect(siteSupport.getByRole("link")).toHaveCount(3)
})
