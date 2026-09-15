import AxeBuilder from "@axe-core/playwright"
import type { EditorialArticle } from "@imsweb/contracts/editorial"
import type { EventPage } from "@imsweb/contracts/events"
import type { NamecardPage } from "@imsweb/contracts/namecards"
import { api, expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const coverUrl = "/brand/series/wall/cinderella-girls.webp"

async function expectFullPageGlass(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator
) {
  const dialogBox = await dialog.boundingBox()
  const viewportSize = page.viewportSize()
  expect(dialogBox).not.toBeNull()
  expect(viewportSize).not.toBeNull()
  if (dialogBox && viewportSize) {
    expect(dialogBox.x).toBe(0)
    expect(dialogBox.y).toBe(0)
    expect(dialogBox.width).toBe(viewportSize.width)
    expect(dialogBox.height).toBe(viewportSize.height)
  }
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
    "backdrop-filter",
    /blur\(40px\).*saturate\(1\.5\)/
  )
}

test.beforeEach(async ({ page, api }) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, { state: "anonymous" })
})

test("public activity covers open in the full-page viewer", async ({
  page,
}, testInfo) => {
  const listResponse = {
    items: [
      {
        id: 1,
        title: "公开夏日活动",
        name: "公开活动发布者",
        contact: null,
        image_url: coverUrl,
        created_at: "2026-07-26T00:00:00.000Z",
        summary: "公开活动摘要。",
        kind: "event",
        cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      },
    ],
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
      snapshotAt: "1",
    },
  } satisfies EventPage
  const detailResponse = {
    id: 1,
    title: "公开夏日活动",
    summary: "公开活动摘要。",
    cover_url: coverUrl,
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    body_html: "<p>公开活动正文。</p>",
    status: "published",
    revision: 1,
    related_links: [],
    kind: "event",
    name: "公开活动发布者",
  } satisfies EditorialArticle

  await api.mockRoute(
    "/api/events",
    (route) => route.fulfill({ status: 200, json: listResponse }),
    "GET"
  )
  await api.mockRoute(
    "/api/events/1",
    (route) => route.fulfill({ status: 200, json: detailResponse }),
    "GET"
  )

  await page.goto("/events")
  const activityItem = page.getByRole("listitem")
  await expect(
    activityItem.getByRole("heading", { name: "公开夏日活动" })
  ).toBeVisible()
  await activityItem.getByRole("link").click()
  await page.getByRole("button", { name: "查看公开夏日活动封面" }).click()

  const dialog = page.getByRole("dialog", { name: "公开夏日活动封面" })
  await expect(dialog).toBeVisible()
  await expectFullPageGlass(page, dialog)

  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(accessibility.violations).toEqual([])

  if (process.env.CAPTURE_INFORMATION_COVER_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-public-activity-cover-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
})

test("namecard images open in the full-page viewer", async ({
  page,
}, testInfo) => {
  const cardResponse = {
    list: [
      {
        id: 42,
        seriesCode: null,
        favoriteIdols: [],
        claimStatus: "unclaimed",
        viewerClaimState: null,
        image1_url: coverUrl,
        image2_url: "/brand/series/wall/shiny-colors.webp",
        image1_thumbnail_url: coverUrl,
        image2_thumbnail_url: "/brand/series/wall/shiny-colors.webp",
        status: "approved",
        created_at: null,
      },
    ],
    total: 1,
    totalPage: 1,
  } satisfies NamecardPage

  await api.mockRoute(
    "/api/cards",
    (route) => route.fulfill({ status: 200, json: cardResponse }),
    "GET"
  )
  await api.mockRoute(
    "/api/reactions",
    (route) => route.fulfill({ status: 200, json: {} }),
    "GET"
  )

  await page.goto("/community/cards")
  const frontTrigger = page.getByRole("button", {
    name: "查看制作人名片 42 正面",
  })
  await expect(frontTrigger).toBeVisible()
  await frontTrigger.click()

  const dialog = page.getByRole("dialog", { name: "制作人名片 42 · 正面" })
  const image = dialog.getByRole("img", { name: "制作人名片 42 正面" })
  await expect(dialog).toBeVisible()
  await expectFullPageGlass(page, dialog)
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0)

  if (process.env.CAPTURE_INFORMATION_COVER_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-namecard-preview-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }

  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await expect(frontTrigger).toBeFocused()
})
