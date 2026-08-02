import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const series = {
  items: [
    {
      code: "765as",
      displayName: "本家 / 765AS",
      displayOrder: 0,
      activeOfficeCount: 1,
    },
    {
      code: "cinderella",
      displayName: "灰姑娘女孩",
      displayOrder: 1,
      activeOfficeCount: 1,
    },
  ],
}

const office = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  intro: "每周末开放的线下交换点，欢迎现场交换公开名片。",
  city: "上海",
  accent: "#2581c7",
  coverUrl: "/brand/series/wall/cinderella-girls.webp",
  isOpen: true,
  visitorCount: 21,
  seriesCodes: ["765as", "cinderella"],
}

const card = {
  id: "card-1",
  producerName: "春香P",
  displayName: "周末交换会名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "上海地区制作人",
  tradeNote: "现场交换同系列名片",
  available: true,
  source: null,
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 12,
    favorites: 4,
    viewerLiked: false,
    viewerFavorited: false,
  },
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route("**/api/community/exchange/series", async (route) => {
    await route.fulfill({ json: series })
  })
  await page.route("**/api/community/exchange/offices?*", async (route) => {
    await route.fulfill({
      json: {
        items: [office],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
    })
  })
  await page.route("**/api/community/exchange/cards?*", async (route) => {
    await route.fulfill({
      json: {
        items: [card],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
    })
  })
  await page.route(
    "**/api/community/exchange/offices/shanghai-weekend",
    async (route) => {
      await route.fulfill({
        json: {
          office: {
            ...office,
            cards: [
              {
                ...card,
                placement: {
                  pinnedAt: "2026-08-02T09:00:00.000Z",
                  x: 46,
                  y: 51,
                  rotation: -3,
                  zIndex: 2,
                },
              },
            ],
          },
        },
      })
    }
  )
})

test("discovers an exchange office and preserves the detail deep link", async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto("/community")
  const exchangeLink = page.getByRole("link", { name: /名片交换事务所/ })
  await expect(exchangeLink).toBeVisible()
  await exchangeLink.click()

  await expect(page).toHaveURL(/\/community\/exchange$/)
  await expect(
    page.getByRole("heading", { name: "名片交换事务所", exact: true })
  ).toBeVisible()

  if (isMobile) {
    await page.getByRole("button", { name: "打开筛选" }).click()
  }
  await page.getByRole("checkbox", { name: "仅看开放事务所" }).click()
  await expect(page).toHaveURL(/open=true/)
  if (isMobile) await page.keyboard.press("Escape")

  await page
    .getByRole("button", {
      name: isMobile ? "打开事务所名录" : "事务所",
      exact: true,
    })
    .click()
  await expect(page.getByText("上海周末交换事务所")).toBeVisible()
  await page.getByRole("tab", { name: "名片" }).click()
  await expect(page.getByText("周末交换会名片")).toBeVisible()
  await page.getByRole("tab", { name: "事务所" }).click()

  const mainOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(mainOverflow).toBe(false)

  const mainAccessibility = await new AxeBuilder({ page }).analyze()
  expect(mainAccessibility.violations).toEqual([])

  if (process.env.CAPTURE_FUDABA_QA === "1") {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: `/tmp/imsweb-fudaba-discovery-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }

  await page.getByRole("link", { name: "上海周末交换事务所" }).click()
  await expect(page).toHaveURL(
    /\/community\/exchange\/offices\/shanghai-weekend$/
  )
  await expect(
    page.getByRole("heading", { name: "上海周末交换事务所" })
  ).toBeVisible()
  await expect(page.getByRole("tab", { name: "墙面" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await expect(
    page.getByRole("button", { name: "查看周末交换会名片正面" })
  ).toBeVisible()

  if (process.env.CAPTURE_FUDABA_QA === "1") {
    await focusCardWallForScreenshot(page)
    await page.screenshot({
      path: `/tmp/imsweb-fudaba-office-wall-${testInfo.project.name}.png`,
    })
  }

  await page.getByRole("tab", { name: "列表" }).click()
  await expect(
    page.getByRole("button", { name: "查看周末交换会名片背面" })
  ).toBeVisible()

  const detailOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(
    detailOverflow,
    `${isMobile ? "mobile" : "desktop"} detail overflow`
  ).toBe(false)

  const detailAccessibility = await new AxeBuilder({ page }).analyze()
  expect(detailAccessibility.violations).toEqual([])

  if (process.env.CAPTURE_FUDABA_QA === "1") {
    await focusCardWallForScreenshot(page)
    await page.screenshot({
      path: `/tmp/imsweb-fudaba-office-list-${testInfo.project.name}.png`,
    })
  }

  await page.goto("/community/exchange/offices/shanghai-weekend")
  await expect(
    page.getByRole("heading", { name: "上海周末交换事务所" })
  ).toBeVisible()
})

test("keeps boundary card placements inside the visible wall", async ({
  page,
}) => {
  await page.route(
    "**/api/community/exchange/offices/shanghai-weekend",
    async (route) => {
      await route.fulfill({
        json: {
          office: {
            ...office,
            cards: [
              {
                ...card,
                id: "card-north-west",
                displayName: "左上边界名片",
                placement: {
                  pinnedAt: "2026-08-02T09:00:00.000Z",
                  x: 0,
                  y: 0,
                  rotation: -12,
                  zIndex: 1,
                },
              },
              {
                ...card,
                id: "card-south-east",
                displayName: "右下边界名片",
                placement: {
                  pinnedAt: "2026-08-02T09:01:00.000Z",
                  x: 100,
                  y: 100,
                  rotation: 12,
                  zIndex: 2,
                },
              },
            ],
          },
        },
      })
    }
  )

  await page.goto("/community/exchange/offices/shanghai-weekend")
  const wall = page.getByLabel("名片墙放置区域")
  await expect(wall).toBeVisible()
  const wallBox = await wall.boundingBox()
  expect(wallBox).not.toBeNull()

  for (const name of ["左上边界名片", "右下边界名片"]) {
    const cardBox = await page
      .getByRole("button", { name: `查看${name}正面` })
      .boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.x).toBeGreaterThanOrEqual(wallBox!.x)
    expect(cardBox!.y).toBeGreaterThanOrEqual(wallBox!.y)
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(
      wallBox!.x + wallBox!.width
    )
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(
      wallBox!.y + wallBox!.height
    )
  }
})

async function focusCardWallForScreenshot(
  page: import("@playwright/test").Page
) {
  await page
    .locator('section[aria-labelledby="office-card-wall-title"]')
    .evaluate((section) => {
      const top = section.getBoundingClientRect().top + window.scrollY
      const previousBehavior = document.documentElement.style.scrollBehavior
      document.documentElement.style.scrollBehavior = "auto"
      window.scrollTo({ top: Math.max(0, top - 80), behavior: "auto" })
      document.documentElement.style.scrollBehavior = previousBehavior
    })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}
