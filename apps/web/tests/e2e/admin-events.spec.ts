import type { EditorialArticleList } from "@imsweb/contracts/editorial"
import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installAdminEditorialMock } from "./fixtures/admin-editorial"

const longTitle =
  "【广O无料配送】交流站做了一些小偶像的钥匙扣物料，到时候会在广州 only 发，有喜欢的到时候可以找梦想之边拿。因为制作时间紧张，目前还没有成品照片。"

const posts = {
  items: [
    {
      id: 35,
      title: longTitle,
      summary: "社区线下交流。",
      cover_url: "/brand/series/wall/765pro.webp",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      body_html: "",
      status: "published",
      revision: 0,
      related_links: [],
      kind: "event",
      source_url:
        "https://example.com/events/very-long-contact-path-that-must-not-expand-the-row?source=community&campaign=offline",
    },
    {
      id: 34,
      title: "【娃娃群】",
      summary: "财布乐园线下交流。",
      cover_url: "/brand/series/wall/cinderella-girls.webp",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      body_html: "",
      status: "published",
      revision: 0,
      related_links: [],
      kind: "event",
    },
  ],
} satisfies EditorialArticleList

test.beforeEach(async ({ page, api }) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: {
      username: "event-layout-qa",
      producername: "活动布局检查",
    },
  })
  await installAdminEditorialMock(api, { posts: posts.items })
})

test("admin article rows keep actions inside the panel", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/events")

  const panel = page.getByRole("region", { name: "文章工作台" })
  await expect(panel.getByRole("article")).toHaveCount(2)

  const longRow = panel.getByRole("article").filter({ hasText: longTitle })
  const editLink = longRow.getByRole("link", { name: "编辑" })
  const publicLink = longRow.getByRole("link", {
    name: `打开${longTitle}的公开页面`,
  })
  await expect(editLink).toBeVisible()
  await expect(publicLink).toBeVisible()

  const panelBox = await panel.boundingBox()
  const rowBox = await longRow.boundingBox()
  const editLinkBox = await editLink.boundingBox()
  const publicLinkBox = await publicLink.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(rowBox).not.toBeNull()
  expect(editLinkBox).not.toBeNull()
  expect(publicLinkBox).not.toBeNull()
  const panelRight = panelBox!.x + panelBox!.width
  const rowRight = rowBox!.x + rowBox!.width
  expect(rowRight).toBeLessThanOrEqual(panelRight + 1)
  expect(editLinkBox!.x + editLinkBox!.width).toBeLessThanOrEqual(rowRight + 1)
  expect(publicLinkBox!.x + publicLinkBox!.width).toBeLessThanOrEqual(
    rowRight + 1
  )

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)

  await longRow.scrollIntoViewIfNeeded()
  if (process.env.CAPTURE_ADMIN_EVENTS_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-admin-events-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
})
