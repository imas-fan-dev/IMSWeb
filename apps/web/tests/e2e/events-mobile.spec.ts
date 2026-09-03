import { expect, test, type Locator, type Page } from "@playwright/test"

const delayedCoverUrl = "/test-assets/community-delayed-cover.png"
const longTitle = `移动端社区动态${"超长标题".repeat(18)}`
const longUrl = `https://example.test/${"unbroken-segment".repeat(24)}`
const coverPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

const events = Array.from({ length: 8 }, (_, index) => ({
  id: String(index + 1),
  title: index === 0 ? longTitle : `社区动态 ${index + 1}`,
  summary: index === 0 ? longUrl : `第 ${index + 1} 条动态摘要`,
  kind: index === 0 ? "event" : "notice",
  name: index === 0 ? longUrl : "测试发布者",
  contact: index === 0 ? longUrl : null,
  image_url: index === 0 ? delayedCoverUrl : null,
  created_at: "2026-12-31T09:30:00.000Z",
  cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
}))
const nextEvents = [9, 10].map((id) => ({
  ...events[1]!,
  id: String(id),
  title: `社区动态 ${id}`,
  summary: `第 ${id} 条动态摘要`,
}))

const detail = {
  ...events[0],
  id: 1,
  article_id: 101,
  cover_url: delayedCoverUrl,
  body_json: { type: "doc", content: [] },
  body_html: `<p>${longUrl}</p><p><a href="${longUrl}">${longUrl}</a></p><pre><code>${longUrl}</code></pre><table><tbody><tr><td>${longUrl}</td></tr></tbody></table>`,
  status: "published",
  revision: 1,
  published_at: "2026-09-03T09:30:00.000Z",
  event_status: "scheduled",
  venue_name: "移动端测试会场",
  address: longUrl,
  related_links: [{ label: "打开社区动态相关页面", url: longUrl }],
  live_franchises: [],
  live_brand_codes: [],
}

async function mockCommunityApis(page: Page) {
  let releaseCover: () => void = () => undefined
  let markCoverRequested: () => void = () => undefined
  const coverRequested = new Promise<void>((resolve) => {
    markCoverRequested = resolve
  })
  const coverGate = new Promise<void>((resolve) => {
    releaseCover = resolve
  })

  await page.route(`**${delayedCoverUrl}`, async (route) => {
    markCoverRequested()
    await coverGate
    await route.fulfill({ contentType: "image/png", body: coverPng })
  })
  await page.route("**/api/events?**", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor")
    const isNextPage = cursor === "events-page-2"
    await route.fulfill({
      json: {
        items: isNextPage ? nextEvents : events,
        pageInfo: {
          nextCursor: isNextPage ? null : "events-page-2",
          hasNextPage: !isNextPage,
          snapshotAt: "10",
        },
      },
    })
  })
  await page.route("**/api/events/1", async (route) => {
    await route.fulfill({ json: detail })
  })
  await page.route("**/api/news?**", async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.route("**/api/community-posts/spotlight", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: 1,
            title: longTitle,
            image_url: delayedCoverUrl,
            category: "activity",
            sort_order: 0,
            cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          },
        ],
      },
    })
  })
  await page.route("**/api/homepage-links", async (route) => {
    await route.fulfill({
      json: { sections: { navigation: [], friend: [], support: [] } },
    })
  })

  return { coverRequested, releaseCover }
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    )
    .toBe(true)
}

async function rowPositions(page: Page) {
  return page
    .getByRole("region", { name: "社区动态列表" })
    .getByRole("listitem")
    .evaluateAll((rows) =>
      rows.slice(0, 3).map((row) => {
        const box = row.getBoundingClientRect()
        return { top: box.top, height: box.height }
      })
    )
}

async function stableRowPositions(page: Page) {
  let previous = await rowPositions(page)
  await expect
    .poll(async () => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      )
      const current = await rowPositions(page)
      const stable =
        current.length === previous.length &&
        current.every(
          (position, index) =>
            Math.abs(position.top - previous[index]!.top) <= 1 &&
            Math.abs(position.height - previous[index]!.height) <= 1
        )
      previous = current
      return stable
    })
    .toBe(true)
  return previous
}

async function expectMinimumHeight(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  expect(box.height).toBeGreaterThanOrEqual(44)
}

async function expectEventRowLayout(row: Locator, metadataCount: number) {
  const geometry = await row.evaluate((listItem) => {
    const article = listItem.querySelector("article")
    const columns = article
      ? Array.from(article.children).filter(
          (element) => element.tagName === "DIV"
        )
      : []
    const cover = columns[0] as HTMLElement | undefined
    const content = columns[1] as HTMLElement | undefined
    const title = content?.querySelector("h2") as HTMLElement | null
    const category = title?.nextElementSibling as HTMLElement | null
    const metadata = category?.nextElementSibling as HTMLElement | null
    const metadataRows = metadata
      ? Array.from(metadata.children).filter(
          (element): element is HTMLElement => element instanceof HTMLElement
        )
      : []

    if (!article || !cover || !content || !title || !category) return null

    const articleRect = article.getBoundingClientRect()
    const coverRect = cover.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const categoryRect = category.getBoundingClientRect()
    const metadataRects = metadataRows.map((row) => {
      const rect = row.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    })
    const finalMetadataRect = metadataRects.at(-1)
    const titleLineHeight = Number.parseFloat(
      getComputedStyle(title).lineHeight
    )

    const textMeasurements = metadataRows.map((metadataRow) => {
      const rowRect = metadataRow.getBoundingClientRect()
      const textElement = metadataRow.querySelector("span")
      let textRect: DOMRect | null =
        textElement?.getBoundingClientRect() ?? null

      if (!textRect) {
        const textNode = Array.from(metadataRow.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        )
        if (textNode) {
          const range = document.createRange()
          range.selectNodeContents(textNode)
          textRect = range.getBoundingClientRect()
        }
      }

      return {
        fullWidth: textRect?.width ?? 0,
        visibleWidth: textRect
          ? Math.max(
              0,
              Math.min(rowRect.right, textRect.right) -
                Math.max(rowRect.left, textRect.left)
            )
          : 0,
      }
    })

    return {
      rowHeight: articleRect.height,
      articleTop: articleRect.top,
      articleBottom: articleRect.bottom,
      articleCenter: articleRect.top + articleRect.height / 2,
      coverWidth: coverRect.width,
      coverHeight: coverRect.height,
      expectedCoverWidth: window.innerWidth >= 640 ? 144 : 104,
      coverCenter: coverRect.top + coverRect.height / 2,
      textCenter: finalMetadataRect
        ? (titleRect.top + finalMetadataRect.bottom) / 2
        : 0,
      coverRight: coverRect.right,
      contentLeft: contentRect.left,
      contentRight: contentRect.right,
      titleTop: titleRect.top,
      titleHeight: titleRect.height,
      titleLineHeight,
      titleBottom: titleRect.bottom,
      categoryLeft: categoryRect.left,
      categoryRight: categoryRect.right,
      categoryTop: categoryRect.top,
      finalMetadataBottom: finalMetadataRect?.bottom ?? articleRect.top,
      metadataCount: metadataRows.length,
      metadataRects,
      textMeasurements,
    }
  })

  expect(geometry).not.toBeNull()
  if (!geometry) return

  expect(geometry.rowHeight).toBeCloseTo(144, 0)
  expect(geometry.coverWidth).toBeCloseTo(geometry.expectedCoverWidth, 0)
  expect(geometry.coverWidth / geometry.coverHeight).toBeCloseTo(4 / 3, 2)
  expect(
    Math.abs(geometry.coverCenter - geometry.articleCenter)
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(geometry.textCenter - geometry.articleCenter)
  ).toBeLessThanOrEqual(1)
  expect(geometry.categoryTop).toBeGreaterThanOrEqual(geometry.titleBottom)
  expect(geometry.categoryLeft).toBeGreaterThanOrEqual(geometry.coverRight)
  expect(geometry.categoryLeft).toBeGreaterThanOrEqual(geometry.contentLeft)
  expect(geometry.categoryRight).toBeLessThanOrEqual(geometry.contentRight + 1)
  expect(geometry.titleHeight).toBeLessThanOrEqual(geometry.titleLineHeight + 1)
  expect(geometry.titleTop).toBeGreaterThanOrEqual(geometry.articleTop)
  expect(geometry.finalMetadataBottom).toBeLessThanOrEqual(
    geometry.articleBottom
  )
  expect(geometry.metadataCount).toBe(metadataCount)
  geometry.metadataRects.slice(1).forEach((rect, index) => {
    expect(rect.top).toBeGreaterThanOrEqual(
      geometry.metadataRects[index]!.bottom - 1
    )
  })
  expect(geometry.textMeasurements[0]!.visibleWidth).toBeGreaterThanOrEqual(40)
  expect(geometry.textMeasurements[1]!.visibleWidth).toBeGreaterThanOrEqual(80)
  expect(geometry.textMeasurements[1]!.visibleWidth).toBeGreaterThanOrEqual(
    geometry.textMeasurements[1]!.fullWidth - 1
  )
  if (metadataCount === 3) {
    expect(geometry.textMeasurements[2]!.visibleWidth).toBeGreaterThanOrEqual(
      40
    )
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test("mobile Web keeps community discovery, list, and detail stable", async ({
  page,
  isMobile,
}, testInfo) => {
  const { coverRequested, releaseCover } = await mockCommunityApis(page)

  await page.goto("/")
  const latest = page.getByRole("region", { name: "站内动态" })
  const eventsSection = latest.getByRole("region", { name: "社区动态" })
  const allEventsLink = eventsSection.getByRole("link", {
    name: "查看全部动态",
  })
  await expect(eventsSection.getByText(longTitle)).toBeVisible()
  await expectMinimumHeight(allEventsLink)
  await expectNoPageOverflow(page)

  await allEventsLink.click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "社区动态",
      exact: true,
    })
  ).toBeVisible()
  const list = page.getByRole("region", { name: "社区动态列表" })
  await expect(list.getByRole("heading", { name: longTitle })).toBeVisible()
  await coverRequested

  const firstRow = list.getByRole("listitem").first()
  const secondRow = list.getByRole("listitem").nth(1)
  const category = firstRow.getByText("具体活动")
  await expect(category).toHaveCSS("opacity", "1")
  if (!isMobile) {
    await firstRow.getByRole("link").focus()
    await expect(firstRow.getByRole("link")).toBeFocused()
  }
  await expectEventRowLayout(firstRow, 3)
  await expectEventRowLayout(secondRow, 2)
  await expect(list.getByText("第 2 条动态摘要")).toHaveCount(0)

  const before = await stableRowPositions(page)
  before.forEach((position) => expect(position.height).toBeCloseTo(144, 0))
  const scrollBefore = await page.evaluate(() => window.scrollY)
  releaseCover()
  await expect
    .poll(() =>
      firstRow
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).complete)
    )
    .toBe(true)
  const after = await stableRowPositions(page)
  const scrollAfter = await page.evaluate(() => window.scrollY)
  expect(after).toHaveLength(before.length)
  after.forEach((position, index) => {
    expect(Math.abs(position.top - before[index]!.top)).toBeLessThanOrEqual(2)
    expect(
      Math.abs(position.height - before[index]!.height)
    ).toBeLessThanOrEqual(2)
  })
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(2)
  await expectNoPageOverflow(page)
  await page.screenshot({
    path: `/tmp/imsweb-events-list-${testInfo.project.name}.png`,
  })

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )
  await expect(page.getByRole("heading", { name: "社区动态 10" })).toBeVisible()
  await expect(
    list.locator('[role="listitem"][aria-setsize="10"]').last()
  ).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 0))
  const firstItem = list.locator('[role="listitem"][aria-posinset="1"]')
  await expect(firstItem).toBeVisible()
  await firstItem.getByRole("link").click()
  await expect(page).toHaveURL(/\/events\/1$/)
  await expect(page.getByRole("link", { name: "返回社区动态" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "移动端社区动态"
  )
  const relatedLink = page.getByRole("link", {
    name: "打开社区动态相关页面",
  })
  await relatedLink.scrollIntoViewIfNeeded()
  await expectMinimumHeight(relatedLink)
  await expect(relatedLink).toHaveAttribute("href", longUrl)
  await expectNoPageOverflow(page)

  await page.screenshot({
    path: `/tmp/imsweb-events-mobile-${testInfo.project.name}.png`,
    fullPage: true,
  })
})
