import { expect, test } from "@playwright/test"

const homepageLinks = {
  sections: {
    navigation: [
      {
        id: "wiki",
        section: "navigation",
        title: "剧情资料",
        description: "浏览站内剧情与角色资料",
        href: "/wiki",
        icon: "book-open",
        accent: "franchise-765",
        displayOrder: 0,
      },
      {
        id: "external",
        section: "navigation",
        title: "外部资料",
        description: "在系统浏览器中打开",
        href: "https://example.com/reference",
        icon: "external-link",
        accent: "info",
        displayOrder: 1,
      },
    ],
    friend: [
      {
        id: "friend-sp",
        section: "friend",
        title: "偶像大师 SP 汉化",
        description: "SP 中文化项目",
        href: "https://sp.idolmaster.top/",
        icon: "external-link",
        accent: "franchise-765",
        displayOrder: 0,
      },
      {
        id: "friend-ofa",
        section: "friend",
        title: "偶像大师 OFA 汉化",
        description: "ONE FOR ALL 中文化项目",
        href: "https://ofa.idolmaster.top/",
        icon: "external-link",
        accent: "franchise-765",
        displayOrder: 1,
      },
      {
        id: "friend-spine-viewer",
        section: "friend",
        title: "闪耀色彩 SpineViewer",
        description: "闪耀色彩 Spine 动画查看工具",
        href: "https://spine.idolmaster.top/",
        icon: "external-link",
        accent: "info",
        displayOrder: 2,
      },
    ],
    support: [],
  },
}

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route("**/api/homepage-links", async (route) => {
    await route.fulfill({ json: homepageLinks })
  })
})

test("keeps the five App roots usable inside the safe area", async ({
  page,
}) => {
  await page.goto("/")
  await applySafeArea(page)

  const navigation = page.getByRole("navigation", { name: "主导航" })
  await expect(navigation).toBeVisible()
  for (const label of ["首页", "活动", "站内应用", "地图", "帐号"]) {
    await expect(navigation.getByRole("link", { name: label })).toBeVisible()
  }

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)

  const shellTokens = await page
    .locator("[data-app-shell]")
    .evaluate((shell) => {
      const style = getComputedStyle(shell)
      return {
        bottom: style.getPropertyValue("--app-bottom-clearance").trim(),
        header: style.getPropertyValue("--app-header-inset").trim(),
        inline: style.getPropertyValue("--app-safe-inline").trim(),
      }
    })
  expect(shellTokens.bottom).toContain("5.25rem")
  expect(shellTokens.header).toContain("3rem")
  expect(shellTokens.inline).toContain("1rem")

  await navigation.getByRole("link", { name: "站内应用" }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByRole("link", { name: "站内应用" })).toHaveAttribute(
    "aria-current",
    "page"
  )
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)
})

test("renders App community links as a two-column text list", async ({
  page,
}) => {
  await page.goto("/")
  await applySafeArea(page)

  const links = page.locator('[aria-labelledby="app-home-friends-heading"]')
  await expect(links.getByRole("link")).toHaveCount(3)
  await links.scrollIntoViewIfNeeded()

  const layout = await links.evaluate((element) => {
    const style = getComputedStyle(element)

    return {
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      iconCount: element.querySelectorAll("svg").length,
      overflowing: element.scrollWidth > element.clientWidth,
    }
  })

  expect(layout).toEqual({
    columns: 2,
    iconCount: 0,
    overflowing: false,
  })
})
