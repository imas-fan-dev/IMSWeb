import { homepageLinksSchema } from "@imsweb/contracts/homepage-links"
import { expect, test, type ApiDispatcher } from "./fixtures/test"
import type { Page } from "@playwright/test"

import {
  applyNamecardSafeArea,
  mockNamecardBrowsing,
} from "./fixtures/namecard-browsing"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"

const cardsUrl = "/community/cards?page=2&size=12"
const nav = (page: Page) => page.getByRole("navigation", { name: "主导航" })

function resourcesDirectory(api: ApiDispatcher) {
  api.expect({
    method: "GET",
    path: "/api/homepage-links",
    responses: { 200: homepageLinksSchema },
    times: 1,
    handle: () => ({
      status: 200,
      json: {
        sections: {
          navigation: Array.from({ length: 24 }, (_, index) => ({
            id: `extra-${index}`,
            section: "navigation",
            title: `扩展资料 ${index + 1}`,
            description: "测试目录滚动与扩展入口保留",
            href: `https://example.com/resource/${index}`,
            icon: "external-link",
            accent: "info",
            displayOrder: index,
          })),
          friend: [],
          support: [],
        },
      },
    }),
  })
}

async function readCards(page: Page) {
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeVisible()
  await applyNamecardSafeArea(page)
  await page
    .getByRole("button", { name: "查看制作人名片 22 正面" })
    .scrollIntoViewIfNeeded()
  const top = await page.evaluate(() => window.scrollY)
  expect(top).toBeGreaterThan(300)
  return top
}

async function expectAccountPage(page: Page) {
  await expect(page).toHaveURL(/\/account\/me$/)
  await expect(
    page.getByRole("heading", { name: "我的", exact: true, level: 1 })
  ).toBeVisible()
}

async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
})

test("resumes paginated reading after delayed data and follows actual history", async ({
  page,
  api,
}, testInfo) => {
  const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 3,
    reactionReads: 36,
    reactionWrites: 0,
  })
  installSeededPublicApis(api, [
    { path: "/api/community/exchange/series", times: 1 },
  ])
  await page.goto(cardsUrl)
  const top = await readCards(page)
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  fixture.hold(2)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(cardsUrl.replace("?", "\\?")))
  await expect.poll(() => fixture.requests.length).toBe(2)
  await frame(page)
  fixture.release()
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(top, 0)
  await expect(
    nav(page).getByRole("link", { name: "社区", exact: true })
  ).toHaveAttribute("aria-current", "page")
  await page.screenshot({
    path: testInfo.outputPath("restored-card-reading.png"),
  })
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expectAccountPage(page)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeAttached()
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect(page).toHaveURL(/\/community$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  for (const href of [
    "/events",
    "/community/cards",
    "/community/exchange",
    "/producer-map",
  ]) {
    await expect(page.locator(`main a[href="${href}"]`)).toBeVisible()
  }
  await expect(
    page.getByRole("button", { name: "返回", exact: true })
  ).toHaveCount(0)
})

test("keeps the reading position when reaction rows arrive after initial restoration", async ({
  page,
  api,
}) => {
  const counts = { "👍": 2, "🎮": 4, "🌹": 3, "🍔": 5, "🍭": 6, "🔨": 7 }
  const fixture = await mockNamecardBrowsing(
    page,
    api,
    36,
    { 13: counts },
    {
      cards: 2,
      reactionReads: 24,
      reactionWrites: 0,
    }
  )
  await page.goto(cardsUrl)
  const firstCard = page.locator("[data-namecard-item]").filter({
    has: page.getByRole("button", { name: "查看制作人名片 13 正面" }),
  })
  const reactions = firstCard.getByRole("button", { name: /次反应$/ })
  await expect(reactions).toHaveCount(6)
  const top = await readCards(page)
  const sourceHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  )
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  const release = fixture.holdReactions(13)
  try {
    await nav(page).getByRole("link", { name: "社区", exact: true }).click()
    await expect(reactions).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(top, 0)
    // Exercise growth beyond the former two-second restoration deadline.
    await page.waitForTimeout(2300)
    release()
    await expect(reactions).toHaveCount(6)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBe(sourceHeight)
    await frame(page)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(top, 0)
  } finally {
    release()
  }
})

test("resumes resource details and reselects a root without adding history", async ({
  page,
  api,
}, testInfo) => {
  installEmptyWikiCatalogMock(api)
  resourcesDirectory(api)
  await page.goto("/works/765?edition=2#intro")
  await expect(nav(page).getByRole("link")).toHaveText([
    "首页",
    "社区",
    "交换地图",
    "资料",
    "我的",
  ])
  // Keep both clicks in one turn so the first route cannot commit between them.
  await nav(page).evaluate((element) => {
    for (const href of ["/account/me", "/apps"]) {
      const link = element.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
      if (!link) throw new Error(`Missing App tab: ${href}`)
      link.click()
    }
  })
  await frame(page)
  await expect(page).toHaveURL(/\/works\/765\?edition=2#intro$/)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.locator('main a[href="/wiki"]')).toBeVisible()
  await expect(page.locator('main a[href="/story"]')).toBeVisible()
  await expect(page.getByText("扩展资料 24", { exact: true })).toBeAttached()
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }))
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300)
  const length = await page.evaluate(() => history.length)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => history.length)).toBe(length)
  await page.screenshot({ path: testInfo.outputPath("resource-directory.png") })
})

test("replaces direct-entry back fallback and preserves the selected owner", async ({
  page,
  api,
}) => {
  await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 1,
    reactionReads: 12,
    reactionWrites: 0,
  })
  installSeededPublicApis(api, [
    { path: "/api/community/exchange/series", times: 1 },
  ])
  await page.goto(cardsUrl)
  await readCards(page)
  const length = await page.evaluate(() => history.length)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page).toHaveURL(/\/community$/)
  expect(await page.evaluate(() => history.length)).toBe(length)
  await expect(
    nav(page).getByRole("link", { name: "社区", exact: true })
  ).toHaveAttribute("aria-current", "page")
})

test("a newer section switch cancels a delayed restoration", async ({
  page,
  api,
}) => {
  const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 2,
    reactionReads: 12,
    reactionWrites: 0,
  })
  resourcesDirectory(api)
  await page.goto(cardsUrl)
  await readCards(page)
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  fixture.hold(2)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect.poll(() => fixture.requests.length).toBe(2)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByText("扩展资料 24", { exact: true })).toBeAttached()
  fixture.release()
  await frame(page)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: "instant" }))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(420)
})

test("user scrolling cancels delayed restoration", async ({ page, api }) => {
  const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 2,
    reactionReads: 24,
    reactionWrites: 0,
  })
  await page.goto(cardsUrl)
  await readCards(page)
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  fixture.hold(2)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect.poll(() => fixture.requests.length).toBe(2)
  await frame(page)
  await page.keyboard.press("Home")
  await frame(page)
  fixture.release()
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

for (const outcome of ["shortened", "error"] as const) {
  test(`bounds restoration after ${outcome} content`, async ({ page, api }) => {
    const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
      cards: 2,
      reactionReads: outcome === "shortened" ? 13 : 12,
      reactionWrites: 0,
    })
    await page.goto(cardsUrl)
    const top = await readCards(page)
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expectAccountPage(page)
    if (outcome === "shortened") fixture.setTotal(13)
    else fixture.failOnce(2)
    await nav(page).getByRole("link", { name: "社区", exact: true }).click()
    await expect.poll(() => fixture.requests.length).toBe(2)
    await expect(page.locator("[data-namecard-item]")).toHaveCount(
      outcome === "shortened" ? 1 : 0
    )
    await expect
      .poll(() =>
        page.evaluate(
          (requested) =>
            Math.abs(
              window.scrollY -
                Math.min(
                  requested,
                  Math.max(
                    0,
                    document.documentElement.scrollHeight - innerHeight
                  )
                )
            ),
          top
        )
      )
      .toBeLessThanOrEqual(1)
    await expect(
      nav(page).getByRole("link", { name: "社区", exact: true })
    ).toBeVisible()
  })
}
