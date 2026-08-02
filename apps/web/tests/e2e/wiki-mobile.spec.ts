import { expect, test } from "@playwright/test"

test("mobile Wiki agency switching preserves both scroll positions", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile-only Wiki interaction")

  await page.goto("/wiki/modern")

  const firstIdolCard = page
    .locator('a[aria-label][href^="/story/modern?"]')
    .first()
  await expect(firstIdolCard).toBeVisible()
  const firstIdolAvatar = firstIdolCard.getByTestId("wiki-idol-avatar")
  await expect
    .poll(async () => {
      const box = await firstIdolAvatar.boundingBox()
      return box ? Math.abs(box.width - box.height) : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual(1)
  await expect(firstIdolCard.locator('[data-slot="badge"]')).toHaveCount(0)

  const agencyRail = page.getByTestId("wiki-agency-tabs")
  const targetAgency = agencyRail.getByRole("tab", { name: /百万现场/ })
  await agencyRail.scrollIntoViewIfNeeded()
  const horizontalScrollBefore = await targetAgency.evaluate((element) => {
    const rail = element.parentElement!
    const targetLeft =
      element.getBoundingClientRect().left -
      rail.getBoundingClientRect().left +
      rail.scrollLeft
    rail.scrollLeft = targetLeft - 16
    return rail.scrollLeft
  })
  await expect(targetAgency).toBeVisible()
  await page.evaluate(() => window.scrollBy(0, 80))
  const verticalScrollBefore = await page.evaluate(() => window.scrollY)

  await targetAgency.click()

  await expect(targetAgency).toHaveAttribute("aria-selected", "true")
  await expect
    .poll(() => new URL(page.url()).searchParams.get("agency"))
    .toBe("百万现场")
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(verticalScrollBefore - 2)
  await expect
    .poll(async () =>
      Math.abs(
        (await agencyRail.evaluate((element) => element.scrollLeft)) -
          horizontalScrollBefore
      )
    )
    .toBeLessThanOrEqual(20)
})

test("classic Wiki follows the mobile content order without narrow title wraps", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile-only classic Wiki layout")

  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto("/wiki")

  const navigationButton = page.getByRole("button", {
    name: "打开企划导航",
  })
  const sidebar = page.locator(".wiki-classic-sidebar")
  const agencyRail = page.getByRole("tablist", { name: "偶像大师企划" })
  const banner = page.locator(".wiki-classic-banner")
  const inlineSearch = page.getByRole("textbox", {
    name: "搜索当前企划内容页",
  })
  const groupFilter = page.getByRole("region", { name: "组合与分类筛选" })
  const firstGroup = page.locator(".wiki-classic-group").first()
  await expect(navigationButton).toHaveAttribute("aria-expanded", "false")
  await expect(sidebar).not.toHaveClass(/is-open/)
  await expect(banner).toBeVisible()
  await expect(inlineSearch).toBeVisible()
  await expect(groupFilter).toBeVisible()
  await expect(firstGroup).toBeVisible()
  await expect(page.locator(".wiki-classic-idol-kind")).toHaveCount(0)

  const [bannerBox, searchBox, filterBox, groupBox] = await Promise.all([
    banner.boundingBox(),
    inlineSearch.boundingBox(),
    groupFilter.boundingBox(),
    firstGroup.boundingBox(),
  ])
  expect(bannerBox).not.toBeNull()
  expect(searchBox).not.toBeNull()
  expect(filterBox).not.toBeNull()
  expect(groupBox).not.toBeNull()
  expect(bannerBox!.y).toBeLessThan(searchBox!.y)
  expect(searchBox!.y).toBeLessThan(filterBox!.y)
  expect(filterBox!.y).toBeLessThan(groupBox!.y)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)

  const groupOption = groupFilter
    .locator('[role="tab"][aria-selected="false"]')
    .first()
  await expect(groupOption).toBeVisible()
  await groupOption.click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get("group"))
    .not.toBeNull()

  const columnCount = await page
    .locator(".wiki-classic-idol-grid")
    .first()
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length
    )
  expect(columnCount).toBe(3)

  await navigationButton.click()
  await expect(navigationButton).toHaveAttribute("aria-expanded", "true")
  await expect(sidebar).toHaveClass(/is-open/)
  await expect(agencyRail).toBeVisible()
  const navigationLayout = await sidebar.evaluate((element) => {
    const sidebarRect = element.getBoundingClientRect()
    const agencyButtons = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".wiki-classic-agency-button[role='tab']"
      )
    )
    const secondaryButtons = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".wiki-classic-agency-button.is-secondary"
      )
    )

    return {
      overflowingLabels: [...agencyButtons, ...secondaryButtons]
        .filter((button) => {
          const rect = button.getBoundingClientRect()
          return rect.left < sidebarRect.left || rect.right > sidebarRect.right
        })
        .map((button) => button.textContent?.trim()),
      agencyButtons: agencyButtons.map((button) => {
        const style = getComputedStyle(button)
        return {
          borderRadius: style.borderRadius,
          borderRightWidth: style.borderRightWidth,
        }
      }),
      secondaryButtons: secondaryButtons.map((button) => ({
        borderRadius: getComputedStyle(button).borderRadius,
        borderRightWidth: getComputedStyle(button).borderRightWidth,
      })),
    }
  })
  expect(navigationLayout.overflowingLabels).toEqual([])
  expect(navigationLayout.agencyButtons).toHaveLength(7)
  expect(navigationLayout.agencyButtons).toEqual(
    Array.from({ length: 7 }, () => ({
      borderRadius: "14px",
      borderRightWidth: "2px",
    }))
  )
  expect(navigationLayout.secondaryButtons).toEqual([
    { borderRadius: "14px", borderRightWidth: "0px" },
    { borderRadius: "14px", borderRightWidth: "0px" },
  ])
  const millionLive = agencyRail.getByRole("tab", { name: /百万现场/ })
  await millionLive.click()
  await expect(navigationButton).toHaveAttribute("aria-expanded", "false")
  await expect(sidebar).not.toHaveClass(/is-open/)
  await expect(banner).toHaveCSS("padding-left", "18px")
  const title = banner.locator("h1")
  await expect(title).toHaveCSS("word-break", "keep-all")
  const titleLineCount = await title.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set(
      Array.from(range.getClientRects(), (rect) => Math.round(rect.top))
    ).size
  })
  expect(titleLineCount).toBeLessThanOrEqual(2)
})

test("classic story portrait cards use two readable mobile columns", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile-only classic story layout")

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(
    "/story/classic?agency=%E7%99%BE%E4%B8%87%E7%8E%B0%E5%9C%BA&idol=%E6%98%A5%E6%97%A5%E6%9C%AA%E6%9D%A5"
  )

  const portraitSection = page.getByRole("region", { name: /竖卡/ })
  const portraitGrid = portraitSection.locator(".wiki-classic-story-grid")
  await expect(portraitSection).toBeVisible()
  await portraitSection.scrollIntoViewIfNeeded()

  const columns = await portraitGrid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ")
  )
  expect(columns).toHaveLength(2)
  expect(Number.parseFloat(columns[0])).toBeGreaterThan(120)
})

test("classic text-only story cards do not render nested frames", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only classic story framing")

  await page.goto(
    "/story/classic?agency=%E5%AD%A6%E5%9B%AD%E5%81%B6%E5%83%8F%E5%A4%A7%E5%B8%88&idol=%E8%91%9B%E5%9F%8E%E8%8E%89%E8%8E%89%E5%A8%85"
  )

  const textOnlyBody = page
    .locator(
      ".wiki-classic-story-card.is-text-only .wiki-classic-story-card-body"
    )
    .first()
  await expect(textOnlyBody).toBeVisible()

  const textOnlyStyles = await textOnlyBody.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderWidth: style.borderWidth,
      margin: style.margin,
    }
  })

  expect(textOnlyStyles).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderWidth: "0px",
    margin: "0px",
  })

  await page.goto(
    "/story/classic?agency=%E7%99%BE%E4%B8%87%E7%8E%B0%E5%9C%BA&idol=%E6%98%A5%E6%97%A5%E6%9C%AA%E6%9D%A5"
  )

  const imageBody = page
    .locator(
      ".wiki-classic-story-card:not(.is-text-only) .wiki-classic-story-card-body"
    )
    .first()
  await expect(imageBody).toBeVisible()

  const imageStyles = await imageBody.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderWidth: style.borderWidth,
      margin: style.margin,
    }
  })

  expect(imageStyles).toEqual({
    backgroundColor: "rgb(250, 249, 251)",
    borderWidth: "1px",
    margin: "8px",
  })
})

test("new story cards without sources render in gray", async ({ page }) => {
  await page.goto(
    "/story/modern?agency=876PRO&idol=%E4%B8%8A%E6%B0%B4%E6%B5%81%E5%AE%87%E5%AE%99"
  )

  const imageCard = page.locator('[id^="story-card-"]:has(img)').first()
  const textOnlyCard = page
    .locator('[id^="story-card-"]:not(:has(img))')
    .first()
  await expect(imageCard).toBeVisible()
  await expect(textOnlyCard).toBeVisible()
  await expect(imageCard).toHaveCSS("opacity", "0.6")
  await expect(imageCard).toHaveCSS("filter", "grayscale(1)")
  await expect(textOnlyCard).toHaveCSS("opacity", "0.6")
  await expect(textOnlyCard).toHaveCSS("filter", "grayscale(1)")

  await expect(imageCard).toHaveAttribute("data-source-state", "empty")
  await expect(textOnlyCard).toHaveAttribute("data-source-state", "empty")

  await textOnlyCard.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByText("暂无可用剧情来源")).toBeVisible()
})

test("classic desktop idol groups align incomplete rows to the left", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only classic Wiki alignment")

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto("/wiki/classic?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9")

  const group = page.locator(".wiki-classic-group").filter({
    has: page.getByRole("heading", {
      name: "illumination STARS",
      exact: true,
    }),
  })
  const cards = group.locator(".wiki-classic-idol-card")
  await expect(group).toBeVisible()
  await expect(cards).toHaveCount(3)

  const [groupBox, firstCardBox, secondCardBox, lastCardBox] =
    await Promise.all([
      group.boundingBox(),
      cards.first().boundingBox(),
      cards.nth(1).boundingBox(),
      cards.last().boundingBox(),
    ])
  expect(groupBox).not.toBeNull()
  expect(firstCardBox).not.toBeNull()
  expect(secondCardBox).not.toBeNull()
  expect(lastCardBox).not.toBeNull()

  await expect(group.locator(".wiki-classic-idol-grid")).toHaveCSS(
    "justify-content",
    "start"
  )

  const leftGap = firstCardBox!.x - groupBox!.x
  const firstCardGap =
    secondCardBox!.x - (firstCardBox!.x + firstCardBox!.width)
  const secondCardGap =
    lastCardBox!.x - (secondCardBox!.x + secondCardBox!.width)
  const rightGap =
    groupBox!.x + groupBox!.width - (lastCardBox!.x + lastCardBox!.width)
  expect(leftGap).toBeLessThanOrEqual(48)
  expect(firstCardGap).toBeLessThanOrEqual(32)
  expect(secondCardGap).toBeLessThanOrEqual(32)
  expect(rightGap).toBeGreaterThan(lastCardBox!.width)
})

test("classic Wiki styles survive returning from a story", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop-only classic Wiki return regression")

  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(
    "/wiki/classic?agency=%E5%AD%A6%E5%9B%AD%E5%81%B6%E5%83%8F%E5%A4%A7%E5%B8%88"
  )
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "初星学园",
      exact: true,
    })
  ).toBeVisible()

  const readLayoutStyles = () =>
    page.evaluate(() => {
      const pattern = getComputedStyle(
        document.querySelector(".wiki-classic-pattern")!
      )
      const window = getComputedStyle(
        document.querySelector(".wiki-classic-window")!
      )
      const sidebar = getComputedStyle(
        document.querySelector(".wiki-classic-sidebar")!
      )
      const activeAgency = getComputedStyle(
        document.querySelector(".wiki-classic-agency-button.is-active")!
      )
      const secondaryAgency = getComputedStyle(
        document.querySelector(".wiki-classic-agency-button.is-secondary")!
      )

      return {
        pattern: {
          backgroundColor: pattern.backgroundColor,
          backgroundImage: pattern.backgroundImage,
        },
        window: {
          gridTemplateColumns: window.gridTemplateColumns,
          padding: window.padding,
          width: window.width,
        },
        sidebar: {
          padding: sidebar.padding,
          position: sidebar.position,
          width: sidebar.width,
        },
        activeAgency: {
          backgroundColor: activeAgency.backgroundColor,
          borderRightWidth: activeAgency.borderRightWidth,
          gridTemplateColumns: activeAgency.gridTemplateColumns,
          padding: activeAgency.padding,
        },
        secondaryAgency: {
          borderRadius: secondaryAgency.borderRadius,
          borderRightWidth: secondaryAgency.borderRightWidth,
        },
      }
    })

  const directStyles = await readLayoutStyles()
  await page.locator(".wiki-classic-idol-card").first().click()
  await expect(page).toHaveURL(/\/story\?/)
  await page.getByRole("link", { name: "返回上一页", exact: true }).click()
  await expect(page).toHaveURL(/\/wiki\?/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "初星学园",
      exact: true,
    })
  ).toBeVisible()

  expect(await readLayoutStyles()).toEqual(directStyles)
  expect(directStyles.pattern).toEqual({
    backgroundColor: "rgba(255, 248, 251, 0.38)",
    backgroundImage: "none",
  })
  expect(directStyles.sidebar.position).toBe("fixed")
  expect(directStyles.activeAgency.backgroundColor).toBe("rgb(243, 152, 0)")
  expect(directStyles.activeAgency.borderRightWidth).toBe("0px")
  expect(directStyles.secondaryAgency).toEqual({
    borderRadius: "14px 0px 0px 14px",
    borderRightWidth: "0px",
  })
})
