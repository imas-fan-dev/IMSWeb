import { expect, test } from "@playwright/test"

async function applySafeArea(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      :root {
        --safe-area-top: 47px;
        --safe-area-right: 0px;
        --safe-area-bottom: 34px;
        --safe-area-left: 0px;
      }
      @media (orientation: landscape) {
        :root {
          --safe-area-top: 0px;
          --safe-area-right: 47px;
          --safe-area-bottom: 21px;
          --safe-area-left: 47px;
        }
      }
    `,
  })
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page
) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !["app-small", "app-landscape"].includes(testInfo.project.name),
    "Interactive page geometry is covered on the smallest and landscape projects."
  )
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test("keeps the Works detail within the App content viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/works/765")
  await applySafeArea(page)

  await expect(
    page.getByRole("heading", { name: "THE IDOLM@STER" })
  ).toBeVisible()
  await expect(page.locator("[data-testid=work-detail-surface]")).toHaveClass(
    /min-h-\(--app-content-height\)/
  )
  await expect(
    page.getByRole("navigation", { name: "主导航" }).getByRole("link", {
      name: "站内应用",
    })
  ).toHaveAttribute("aria-current", "page")
  await expectNoHorizontalOverflow(page)

  if (process.env.CAPTURE_APP_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-app-work-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
})

test("keeps the Tier List pool and toolbar clear of the App tab bar", async ({
  page,
}) => {
  await page.goto("/tier-list")
  await applySafeArea(page)

  const actions = page.locator('[data-testid="tier-list-toolbar-actions"]')
  await expect(actions).toBeVisible()
  for (const name of ["添加层级", "导入图片", "导出图片", "清空排行榜"]) {
    await expect(actions.getByRole("button", { name })).toBeVisible()
  }

  const pool = page.locator('[data-testid="unranked-pool"]')
  await pool.scrollIntoViewIfNeeded()
  const navigation = page.getByRole("navigation", { name: "主导航" })
  await expect
    .poll(async () => {
      const [poolBox, navigationBox] = await Promise.all([
        pool.boundingBox(),
        navigation.boundingBox(),
      ])
      if (!poolBox || !navigationBox) return false
      return poolBox.y + poolBox.height <= navigationBox.y + 1
    })
    .toBe(true)

  await expect(
    navigation.getByRole("link", { name: "站内应用" })
  ).toHaveAttribute("aria-current", "page")
  await expectNoHorizontalOverflow(page)
})
