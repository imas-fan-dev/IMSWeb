import { eventListQuerySchema, eventPageSchema } from "@imsweb/contracts/events"
import {
  newsListQuerySchema,
  recommendationResponseSchema,
} from "@imsweb/contracts/news"

import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { api, expect, test } from "./fixtures/test"

const events = Array.from({ length: 5 }, (_, index) => ({
  id: String(index + 1),
  title: `桌面动态 ${index + 1}`,
  name: "测试发布者",
  contact: null,
  image_url: null,
  created_at: "2026-09-21T00:00:00.000Z",
  cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
}))

const recommendations = Array.from({ length: 5 }, (_, index) => ({
  id: String(index + 1),
  title: `桌面推荐 ${index + 1}`,
  thumbnail: null,
  content: `https://example.test/recommendations/${index + 1}`,
  date: "2026-09-21T00:00:00.000Z",
}))

function installFeedMocks() {
  installEmptyWikiCatalogMock(api, { min: 1, max: 2 })
  api.expect({
    name: "desktop events feed",
    method: "GET",
    path: "/api/events",
    query: eventListQuerySchema,
    responses: { 200: eventPageSchema },
    handle: () => ({
      status: 200,
      json: {
        items: events,
        pageInfo: {
          nextCursor: null,
          hasNextPage: false,
          snapshotAt: "5",
        },
      },
    }),
  })
  api.expect({
    name: "desktop recommendations feed",
    method: "GET",
    path: "/api/news",
    query: newsListQuerySchema,
    responses: { 200: recommendationResponseSchema },
    handle: () => ({
      status: 200,
      json: {
        items: recommendations,
        pageInfo: {
          nextCursor: null,
          hasNextPage: false,
          snapshotAt: "5",
        },
      },
    }),
  })
}

async function itemGeometry(page: import("@playwright/test").Page) {
  return page.getByRole("listitem").evaluateAll((items) =>
    items.slice(0, 5).map((item) => {
      const box = item.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      }
    })
  )
}

async function headerGeometry(page: import("@playwright/test").Page) {
  return page.locator('[data-slot="public-feed-header"]').evaluate((header) => {
    const content = header.querySelector(
      '[data-slot="public-feed-header-content"]'
    )
    if (!(content instanceof HTMLElement)) return null

    const headerBox = header.getBoundingClientRect()
    const contentBox = content.getBoundingClientRect()
    const style = getComputedStyle(content)
    return {
      headerLeft: headerBox.left,
      headerRight: headerBox.right,
      contentLeft: contentBox.left,
      contentRight: contentBox.right,
      contentHeight: contentBox.height,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
    }
  })
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page
) {
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

test.describe("public feed desktop layout", () => {
  test("shares the header geometry and crosses lg between two and one columns", async ({
    page,
  }) => {
    installFeedMocks()
    await page.setViewportSize({ width: 1280, height: 900 })

    await page.goto("/events")
    await expect(page.getByRole("listitem")).toHaveCount(5)
    const eventHeader = await headerGeometry(page)
    const eventRows = await itemGeometry(page)

    expect(eventHeader).not.toBeNull()
    expect(eventRows[0]!.top).toBeCloseTo(eventRows[1]!.top, 0)
    expect(eventRows[0]!.right).toBeLessThan(eventRows[1]!.left)
    expect(eventRows[2]!.top).toBeGreaterThanOrEqual(eventRows[0]!.bottom)
    expect(eventRows[4]!.left).toBeCloseTo(eventRows[0]!.left, 0)
    await expectNoHorizontalOverflow(page)

    await page.goto("/recommendations")
    await expect(page.getByRole("listitem")).toHaveCount(5)
    const recommendationHeader = await headerGeometry(page)
    const recommendationRows = await itemGeometry(page)

    expect(recommendationHeader).toEqual(eventHeader)
    expect(recommendationRows[0]!.top).toBeCloseTo(
      recommendationRows[1]!.top,
      0
    )
    expect(recommendationRows[0]!.right).toBeLessThan(
      recommendationRows[1]!.left
    )
    expect(recommendationRows[2]!.top).toBeGreaterThanOrEqual(
      recommendationRows[0]!.bottom
    )
    expect(recommendationRows[4]!.left).toBeCloseTo(
      recommendationRows[0]!.left,
      0
    )
    await expectNoHorizontalOverflow(page)

    await page.setViewportSize({ width: 900, height: 900 })
    await expect
      .poll(async () => {
        const rows = await itemGeometry(page)
        return rows[1]!.top >= rows[0]!.bottom
      })
      .toBe(true)
    await expectNoHorizontalOverflow(page)
  })
})
