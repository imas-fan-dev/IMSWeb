import { successFlagSchema } from "@imsweb/contracts/common"
import { platformHttpErrorSchema } from "@imsweb/contracts/platform"

import AxeBuilder from "@axe-core/playwright"

import { expect, test } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { makeCharacterCatalog } from "./fixtures/fudaba-characters"

test("opens personal content with desktop sidebar and mobile standalone navigation @mobile", async ({
  page,
  api,
  isMobile,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" })
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  )
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=personal-pages; path=/"
  })
  const session = {
    success: true,
    account: { id: "personal-pages", status: "active" },
    profile: {
      displayName: "页面导航制作人",
      avatarUrl: null,
      homeCity: "上海",
      bio: "",
    },
  }
  // Desktop: root, profile, reload, root, claims, back, direct claims, security return.
  // Mobile: five sections, offices reload, claims link, direct claims.
  const workspaceLoads = 8
  async function expectAccountRootReady() {
    await expect(page).toHaveURL(/\/account\/me$/)
    if (isMobile) {
      await expect(
        page.getByRole("heading", { name: "我的", exact: true })
      ).toBeVisible()
    } else {
      await expect(
        page.getByRole("textbox", { name: "显示名称", exact: true })
      ).toHaveValue(session.profile.displayName)
    }
  }
  await page.context().addCookies([
    {
      name: "ims_platform_access",
      value: "personal-pages-session",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await installEmptyWikiCatalogMock(api, { min: 1, max: 8 })
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/characters",
      times: { min: 1, max: 12 },
    },
    (route) => route.fulfill({ json: makeCharacterCatalog() })
  )
  await api.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 12 },
    },
    (route) => route.fulfill({ json: session })
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: workspaceLoads },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: { ...session.profile, updatedAt: 1 },
        },
      })
  )
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/cards",
    "/api/community/exchange/me/offices",
    "/api/community/exchange/me/claim-envelopes",
  ]) {
    await api.mock(
      {
        method: "GET",
        path,
        times:
          path === "/api/community/exchange/me/offices"
            ? { min: 1, max: workspaceLoads }
            : workspaceLoads,
      },
      (route) => route.fulfill({ json: { items: [] } })
    )
  }
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/favorites",
      times: workspaceLoads,
    },
    (route) =>
      route.fulfill({
        json: {
          items: [],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
  )
  await page.goto("/account/me")
  for (const [path, json] of [
    ["/api/platform/me/sessions", { success: true, sessions: [] }],
    [
      "/api/platform/me/oauth-links",
      { success: true, links: [], passwordEnabled: true },
    ],
    ["/api/platform/auth/oauth/providers", { success: true, providers: [] }],
  ] as const) {
    await api.mock({ method: "GET", path, times: 1 }, (route) =>
      route.fulfill({ json })
    )
  }
  const links = isMobile
    ? page
        .locator("section[aria-labelledby='account-business-title']")
        .getByRole("link")
    : page.getByRole("navigation", { name: "个人档案菜单" }).getByRole("link")
  await expect(links).toHaveCount(5)
  if (!isMobile) {
    await expect(
      page
        .getByRole("navigation", { name: "个人档案菜单" })
        .getByRole("listitem")
    ).toHaveCount(5)
  }
  if (!isMobile) {
    await expect(
      page.locator("#profile-workspace-section-profile")
    ).toBeVisible()
    await expect(
      page.getByRole("textbox", { name: "显示名称", exact: true })
    ).toBeVisible()
    await expect(links.first()).toHaveAttribute("aria-current", "page")
    for (const [width, theme] of [
      [1440, "light"],
      [1920, "dark"],
    ] as const) {
      await page.setViewportSize({ width, height: 1080 })
      const root = page.locator("html")
      const dark = await root.evaluate((node) =>
        node.classList.contains("dark")
      )
      if (dark !== (theme === "dark")) {
        await page
          .getByRole("button", { name: "切换亮色或暗色模式", exact: true })
          .first()
          .click()
      }
      await expect(root).toHaveCSS("color-scheme", theme)
      const first = await links.nth(0).boundingBox()
      const second = await links.nth(1).boundingBox()
      const content = await page
        .locator("#profile-workspace-section-profile")
        .boundingBox()
      expect(second!.y).toBeGreaterThan(first!.y)
      expect(content!.x).toBeGreaterThan(first!.x + first!.width)
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations
      ).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath(`personal-workspace-${width}-${theme}.png`),
        animations: "disabled",
        fullPage: true,
      })
    }
    await page
      .getByRole("button", { name: "切换亮色或暗色模式", exact: true })
      .first()
      .click()
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light")
  }
  await links.first().focus()
  await expect(links.first()).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(links.nth(1)).toBeFocused()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath("personal-hub.png"),
    fullPage: true,
  })

  for (const [section, label] of [
    ["profile", "个人资料"],
    ["namecards", "交换名片"],
    ["favorites", "收藏夹"],
    ["offices", "事务所与位置"],
    ["claims", "消息"],
  ]) {
    await page.getByRole("link", { name: new RegExp(`^${label}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/account/me/${section}$`))
    await expect(
      page.locator(`#profile-workspace-section-${section}`)
    ).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0)
    await expect(page).toHaveTitle(`${label} | IMSWeb`)
    await expect(page.getByRole("main")).toHaveCount(1)
    if (section === "namecards") {
      await expect(page.getByRole("textbox", { name: "名片标题" })).toHaveCount(
        0
      )
      await page
        .getByRole("button", { name: "新建名片", exact: true })
        .first()
        .click()
      await expect(
        page.getByRole("dialog", { name: "新建名片", exact: true })
      ).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)
    }
    if (section === "offices") {
      await page.reload()
      await expect(
        page.locator("#profile-workspace-section-offices")
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath("personal-offices.png"),
        fullPage: true,
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
      expect(accessibility.violations).toEqual([])
    }
    if (isMobile) {
      await page.getByRole("link", { name: "返回我的", exact: true }).click()
      await expect(page).toHaveURL(/\/account\/me$/)
    } else {
      await expect(
        page
          .getByRole("navigation", { name: "个人档案菜单" })
          .getByRole("link", { name: label, exact: true })
      ).toHaveAttribute("aria-current", "page")
      await expect(
        page.getByRole("link", { name: "返回我的", exact: true })
      ).toBeHidden()
    }
  }
  await page.goto("/account/me")
  await expectAccountRootReady()
  // Exercise client-side history without depending on document BFCache behavior.
  await page.getByRole("link", { name: /^消息/ }).click()
  await expect(page.locator("#profile-workspace-section-claims")).toBeVisible()
  await page.goBack()
  await expectAccountRootReady()
  if (!isMobile) {
    await expect(
      page
        .getByRole("navigation", { name: "个人档案菜单" })
        .getByRole("link", { name: "个人资料", exact: true })
    ).toHaveAttribute("aria-current", "page")
  }
  // A direct URL must work independently of navigation state, including after reload.
  await page.goto("/account/me/claims")
  await expect(page.locator("#profile-workspace-section-claims")).toBeVisible()
  if (!isMobile) {
    for (const [width, height, theme] of [
      [1440, 900, "light"],
      [1920, 1200, "dark"],
    ] as const) {
      await page.setViewportSize({ width, height })
      const root = page.locator("html")
      if (
        (await root.evaluate((node) => node.classList.contains("dark"))) !==
        (theme === "dark")
      ) {
        await page
          .getByRole("button", { name: "切换亮色或暗色模式", exact: true })
          .first()
          .click()
      }
      await expect(root).toHaveCSS("color-scheme", theme)
      for (const [section, label] of [
        ["namecards", /^交换名片/],
        ["claims", /^消息/],
      ] as const) {
        await page
          .getByRole("navigation", { name: "个人档案菜单" })
          .getByRole("link", { name: label })
          .click()
        await expect(
          page.locator(`#profile-workspace-section-${section}`)
        ).toBeVisible()
        const aside = page.locator("main aside")
        const footer = aside.locator("footer")
        await expect(footer).toBeVisible()
        const bounds = await aside.boundingBox()
        const utility = await footer.boundingBox()
        const menu = await aside.getByRole("navigation").boundingBox()
        const main = await page.getByRole("main").boundingBox()
        const siteFooter = await page.getByRole("contentinfo").boundingBox()
        expect(
          Math.abs(bounds!.y + bounds!.height - utility!.y - utility!.height)
        ).toBeLessThan(2)
        expect(
          Math.abs(main!.y + main!.height - bounds!.y - bounds!.height)
        ).toBeLessThan(2)
        expect(Math.abs(main!.y + main!.height - siteFooter!.y)).toBeLessThan(2)
        expect(utility!.y).toBeGreaterThanOrEqual(menu!.y + menu!.height)
        expect(bounds!.height).toBeGreaterThan(height / 2)
        expect(utility!.y + utility!.height).toBeLessThanOrEqual(height)
        await expect(page.getByRole("contentinfo")).toHaveCount(1)
        await page.screenshot({
          path: testInfo.outputPath(
            `${section}-footer-${width}-${height}-${theme}.png`
          ),
          animations: "disabled",
          fullPage: true,
        })
      }
    }
  }
  if (isMobile) {
    await page.getByRole("link", { name: "返回我的", exact: true }).click()
    await expectAccountRootReady()
  }
  await page.getByRole("link", { name: /帐号安全/ }).click()
  await expect(page).toHaveURL(/\/account\/security$/)
  await expect(
    page.getByRole("heading", { name: "帐号安全", exact: true })
  ).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("link", { name: "返回我的", exact: true }).click()
  await expectAccountRootReady()
})

test("desktop root and section preserve pending, failed, retry and successful logout", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=logout-feedback; path=/"
  })
  await page.context().addCookies([
    {
      name: "ims_platform_access",
      value: "logout-feedback",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  const session = {
    success: true,
    account: { id: "logout-feedback", status: "active" },
    profile: {
      displayName: "退出验证制作人",
      avatarUrl: null,
      homeCity: "上海",
      bio: "",
    },
  }
  await installEmptyWikiCatalogMock(api, 1)
  await api.mock(
    { method: "GET", path: "/api/platform/auth/session", times: 2 },
    (route) => route.fulfill({ json: session })
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: 2 },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: { ...session.profile, updatedAt: 1 },
        },
      })
  )
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/cards",
    "/api/community/exchange/me/offices",
    "/api/community/exchange/me/claim-envelopes",
  ]) {
    await api.mock({ method: "GET", path, times: 2 }, (route) =>
      route.fulfill({ json: { items: [] } })
    )
  }
  await api.mock(
    { method: "GET", path: "/api/community/exchange/me/favorites", times: 2 },
    (route) =>
      route.fulfill({
        json: { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
      })
  )
  const releases: Array<() => void> = []
  const gates = Array.from(
    { length: 4 },
    () => new Promise<void>((resolve) => releases.push(resolve))
  )
  let attempts = 0
  api.expect({
    method: "POST",
    path: "/api/platform/auth/logout",
    times: 4,
    responses: { 200: successFlagSchema, 500: platformHttpErrorSchema },
    handle: async () => {
      const attempt = attempts++
      await gates[attempt]
      return attempt % 2 === 0
        ? { status: 500, json: { error: "logout unavailable" } }
        : { status: 200, json: { success: true } }
    },
  })
  for (const [index, path] of [
    "/account/me",
    "/account/me/profile",
  ].entries()) {
    await page.goto(path)
    await expect(
      page.getByRole("textbox", { name: "显示名称", exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: "退出帐号", exact: true }).click()
    await expect(
      page.getByRole("main", { name: "正在退出帐号" })
    ).toHaveAttribute("aria-busy", "true")
    await expect.poll(() => attempts).toBe(index * 2 + 1)
    releases[index * 2]()
    await expect(page.getByText("退出帐号失败", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "重试退出", exact: true }).click()
    await expect(page.getByRole("main", { name: "正在退出帐号" })).toBeVisible()
    await expect.poll(() => attempts).toBe(index * 2 + 2)
    releases[index * 2 + 1]()
    await expect(page.getByText("已退出帐号", { exact: true })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  }
})

for (const section of ["offices", "namecards"] as const) {
  test(`preserves ${section} dialog and draft across the desktop breakpoint`, async ({
    page,
    api,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("imsweb.language", "zh-CN")
      document.cookie = "ims_platform_csrf=responsive-pages; path=/"
    })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.context().addCookies([
      {
        name: "ims_platform_access",
        value: "responsive-session",
        domain: "127.0.0.1",
        path: "/",
      },
    ])
    const session = {
      success: true,
      account: { id: "responsive-owner", status: "active" },
      profile: {
        displayName: "响应式制作人",
        avatarUrl: null,
        homeCity: "上海",
        bio: "",
      },
    }
    await installEmptyWikiCatalogMock(api, { min: 1, max: 8 })
    await api.mock(
      { method: "GET", path: "/api/platform/auth/session", times: 1 },
      (route) => route.fulfill({ json: session })
    )
    await api.mock(
      { method: "GET", path: "/api/platform/me", times: 1 },
      (route) =>
        route.fulfill({
          json: {
            ...session,
            capabilities: { fudabaWrite: true },
            profile: { ...session.profile, updatedAt: 1 },
          },
        })
    )
    const ownerPaths = [
      "/api/community/exchange/me/series",
      "/api/community/exchange/me/cards",
      "/api/community/exchange/me/offices",
      "/api/community/exchange/me/claim-envelopes",
      "/api/community/exchange/me/favorites",
    ]
    for (const path of ownerPaths)
      await api.mock({ method: "GET", path, times: 1 }, (route) =>
        route.fulfill({
          json: path.endsWith("favorites")
            ? { items: [], pageInfo: { hasNextPage: false, nextCursor: null } }
            : { items: [] },
        })
      )
    if (section === "namecards")
      await api.mock(
        { method: "GET", path: "/api/community/exchange/characters", times: 1 },
        (route) => route.fulfill({ json: makeCharacterCatalog() })
      )
    await page.goto(`/account/me/${section}`)
    const title = section === "offices" ? "新建事务所" : "新建名片"
    const field = section === "offices" ? "事务所名称" : "名片标题"
    await page.getByRole("button", { name: title, exact: true }).first().click()
    const dialog = page.getByRole("dialog", { name: title, exact: true })
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole("textbox", { name: field, exact: true })
      .fill("尚未保存的响应式草稿")
    const readyCounts = ownerPaths.map(
      (path) => api.requests({ method: "GET", path }).length
    )
    expect(readyCounts).toEqual([1, 1, 1, 1, 1])
    for (const width of [900, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByRole("textbox", { name: field, exact: true })
      ).toHaveValue("尚未保存的响应式草稿")
      expect(
        ownerPaths.map((path) => api.requests({ method: "GET", path }).length)
      ).toEqual(readyCounts)
    }
    await page.screenshot({
      path: testInfo.outputPath(`${section}-resized-draft.png`),
    })
  })
}
