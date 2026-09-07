import type {
  AdminEditorialSpotlight,
  EditorialArticleList,
} from "@imsweb/contracts/editorial"
import { expect, test } from "@playwright/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import {
  installAdminEditorialMock,
  type AdminSpotlightSelection,
} from "./fixtures/admin-editorial"

const posts = {
  items: [
    {
      id: 41,
      title: "活动资讯第一项",
      summary: "活动资讯摘要。",
      cover_url: "/brand/series/wall/765pro.webp",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      body_html: "",
      status: "published",
      revision: 1,
      related_links: [],
      kind: "event",
    },
    {
      id: 42,
      title: "同人活动第二项",
      summary: "同人活动摘要。",
      cover_url: "/brand/series/wall/cinderella-girls.webp",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      body_html: "",
      status: "published",
      revision: 1,
      related_links: [],
      kind: "event",
    },
  ],
} satisfies EditorialArticleList

let spotlight = {
  items: [
    {
      post_id: 41,
      category: "activity",
      sort_order: 0,
      title: "活动资讯第一项",
      status: "published",
      image_url: "/brand/series/wall/765pro.webp",
      kind: "event",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    },
    {
      post_id: 42,
      category: "fan",
      sort_order: 1,
      title: "同人活动第二项",
      status: "published",
      image_url: "/brand/series/wall/cinderella-girls.webp",
      kind: "event",
      cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    },
  ],
} satisfies AdminEditorialSpotlight

function applySpotlightOrder(items: AdminSpotlightSelection[]) {
  const byId = new Map(spotlight.items.map((entry) => [entry.post_id, entry]))
  spotlight = {
    items: items.map((item, index) => ({
      ...byId.get(Number(item.postId))!,
      category: item.category,
      sort_order: index,
    })),
  }
}

test.beforeEach(() => {
  spotlight = {
    items: spotlight.items
      .slice()
      .sort((left, right) => left.post_id - right.post_id)
      .map((entry, index) => ({ ...entry, sort_order: index })),
  }
})

test("admin reorders homepage spotlight entries", async ({ page }) => {
  await installAdminAuthMock(page, {
    csrfToken: "information-order-e2e",
    user: {
      username: "information-operator",
      producername: "活动运营",
    },
  })
  const editorial = await installAdminEditorialMock(page, {
    posts: posts.items,
    getSpotlight: () => spotlight.items,
    onReplaceSpotlight: applySpotlightOrder,
  })

  await page.goto("/admin/events")
  await page.getByRole("tab", { name: "首页精选" }).click()

  const panel = page.getByRole("region", { name: "首页精选顺序" })
  await expect(panel.getByText("活动资讯第一项", { exact: true })).toBeVisible()
  await expect(panel.getByText("同人活动第二项", { exact: true })).toBeVisible()

  await panel.getByRole("button", { name: "下移" }).first().click()
  const titles = panel.locator("p.font-medium")
  await expect(titles).toHaveText(["同人活动第二项", "活动资讯第一项"])

  await panel.getByRole("button", { name: "保存精选" }).click()
  await expect
    .poll(() => editorial.replacements.at(-1))
    .toEqual({
      items: [
        { postId: 42, category: "fan" },
        { postId: 41, category: "activity" },
      ],
      csrfToken: "information-order-e2e",
    })
  await expect(titles).toHaveText(["同人活动第二项", "活动资讯第一项"])

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
})
