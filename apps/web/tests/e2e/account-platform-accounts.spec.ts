import AxeBuilder from "@axe-core/playwright"
import {
  myPlatformAccountsSchema,
  platformAccountEntrySchema,
  platformAccountRemovalSchema,
  platformAccountValueRequestSchema,
} from "@imsweb/contracts/namecards"

import { expect, test } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

test("adds platform accounts by pasting a link, then edits and removes them from personal profile @mobile", async ({
  page,
  api,
  isMobile,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" })
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 }
  )
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=platform-accounts; path=/"
  })
  await page.context().addCookies([
    {
      name: "ims_platform_access",
      value: "platform-accounts",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  const session = {
    success: true,
    account: { id: "platform-accounts", status: "active" },
    profile: {
      uid: 1,
      displayName: "平台账号制作人",
      avatarUrl: null,
      homeCity: "成都",
      bio: "个人资料交互验证",
    },
  }
  const base = {
    group: "social",
    baseUrl: null,
    pattern: "^.+$",
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 1,
    enabled: true,
    uppercase: false,
  }
  const catalog = [
    {
      ...base,
      id: "homepage",
      name: "个人主页",
      group: "link",
      pattern: "^https://[^\\s]+$",
    },
    {
      ...base,
      id: "github",
      name: "GitHub",
      group: "showcase",
      icon: "github",
      color: "#181717",
      pattern: "^[a-z0-9-]{1,39}$",
      baseUrl: "https://github.com/{value}",
    },
    {
      ...base,
      id: "x",
      name: "X",
      icon: "x",
      color: "#000000",
      pattern: "^[A-Za-z0-9_]{4,15}$",
      baseUrl: "https://x.com/{value}",
    },
    {
      ...base,
      id: "switch",
      name: "NSO",
      group: "game-platform",
      icon: "switch",
      color: "#e60012",
      pattern: "^SW-\\d{4}-\\d{4}-\\d{4}$",
      uppercase: true,
    },
    { ...base, id: "disabled", name: "停用平台", enabled: false },
  ]
  let entries: Array<{
    kindId: string
    value: string
    username: string | null
  }> = []
  await installEmptyWikiCatalogMock(api, { min: 1, max: 4 })
  await api.mock(
    { method: "GET", path: "/api/platform/auth/session", times: { min: 1, max: 8 } },
    (route) => route.fulfill({ json: session })
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: { min: 1, max: 8 } },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          profile: { ...session.profile, updatedAt: 1, uid: 1, pageSlug: null },
          capabilities: { fudabaWrite: false },
        },
      })
  )
  api.expect({
    method: "GET",
    path: "/api/platform/me/accounts",
    times: { min: 1, max: 8 },
    responses: { 200: myPlatformAccountsSchema },
    handle: () => ({ status: 200, json: { catalog, entries } }),
  })
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/cards",
    "/api/community/exchange/me/offices",
  ]) {
    await api.mock(
      { method: "GET", path, times: { min: 0, max: 2 } },
      (route) => route.fulfill({ json: { items: [] } })
    )
  }
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/favorites",
      times: { min: 0, max: 2 },
    },
    (route) =>
      route.fulfill({
        json: { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
      })
  )
  api.expect({
    method: "PUT",
    path: "/api/platform/me/accounts/github",
    times: 1,
    body: platformAccountValueRequestSchema,
    responses: { 200: platformAccountEntrySchema },
    handle: ({ body }) => {
      expect(body).toEqual({ value: "texasoct", username: "TexasOct" })
      entries = [{ kindId: "github", value: "texasoct", username: "TexasOct" }]
      return { status: 200, json: entries[0] }
    },
  })
  api.expect({
    method: "DELETE",
    path: "/api/platform/me/accounts/github",
    times: 1,
    responses: { 200: platformAccountRemovalSchema },
    handle: () => {
      entries = []
      return { status: 200, json: { success: true, removed: 1 } }
    },
  })

  // 窄屏的 /account/me 是分区入口，编辑器在 /account/me/profile。
  await page.goto(isMobile ? "/account/me/profile" : "/account/me")
  const section = page.locator("#profile-workspace-section-profile")
  const pasteBox = section.getByRole("textbox", {
    name: "粘贴平台链接",
    exact: true,
  })
  const save = section.getByRole("button", { name: "保存", exact: true })
  const entry = (kindId: string) =>
    section.locator(`[data-platform-entry="${kindId}"]`)

  // 粘贴走的是 onPaste，input 事件不会触发平台定位。
  async function pasteLink(text: string) {
    await pasteBox.focus()
    await pasteBox.evaluate((element, value) => {
      const data = new DataTransfer()
      data.setData("text/plain", value)
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
      )
    }, text)
  }

  await expect(section.getByText("个人主页", { exact: true }).first()).toBeVisible()
  await expect(entry("github")).toHaveCount(0)
  await expect(entry("x")).toHaveCount(0)
  await expect(save).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath("profile-accounts-empty-light.png"),
    fullPage: true,
    animations: "disabled",
  })

  await pasteLink("https://example.com/nobody")
  await expect(
    section.getByText(/没有匹配到支持的平台/).first()
  ).toBeVisible()

  await pasteLink("https://github.com/TexasOct?tab=repos")
  const github = entry("github")
  await expect(github).toBeVisible()
  await expect(github.getByRole("link")).toHaveAttribute(
    "href",
    "https://github.com/texasoct"
  )
  await expect(pasteBox).toHaveValue("")
  await expect(save).toBeEnabled()
  await github
    .getByRole("textbox", { name: "GitHub 用户名", exact: true })
    .fill("TexasOct")
  await page.screenshot({
    path: testInfo.outputPath("profile-accounts-added-light.png"),
    animations: "disabled",
  })

  await save.click()
  await expect
    .poll(
      () =>
        api.requests({
          method: "PUT",
          path: "/api/platform/me/accounts/github",
        }).length
    )
    .toBe(1)
  await expect(save).toBeDisabled()

  await page.reload()
  await expect(entry("github")).toBeVisible()
  await expect(
    entry("github").getByRole("textbox", {
      name: "GitHub 用户名",
      exact: true,
    })
  ).toHaveValue("TexasOct")

  await page.context().route("https://github.com/texasoct", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Platform destination</title>",
    })
  )
  const popupOpened = page.waitForEvent("popup")
  await entry("github").getByRole("link").click()
  const popup = await popupOpened
  await expect(popup).toHaveURL("https://github.com/texasoct")
  await popup.close()

  await pasteLink("https://github.com/another")
  await expect(
    section.getByText("这个平台已经添加过了，先移除再重新粘贴。", {
      exact: true,
    })
  ).toBeVisible()

  // 窄屏走底部抽屉,桌面走悬停提示;两种方式都不列出停用的平台。
  const guide = section.getByRole("button", {
    name: "查看支持的平台与链接模板",
    exact: true,
  })
  await guide.scrollIntoViewIfNeeded()
  if (isMobile) {
    await guide.tap()
    const drawer = page.getByRole("dialog")
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText("GitHub", { exact: true })).toBeVisible()
    await expect(drawer.getByText("停用平台", { exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath("profile-accounts-guide-sheet.png"),
      animations: "disabled",
    })
    await page.mouse.click(10, 40)
    await expect(drawer).not.toBeVisible()
  } else {
    await guide.hover()
    const tooltip = page.locator('[data-slot="tooltip-content"]')
    await expect(tooltip).toBeVisible()
    await expect(tooltip.getByText("GitHub", { exact: true })).toBeVisible()
    await expect(tooltip.getByText("停用平台", { exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath("profile-accounts-guide-tooltip.png"),
      animations: "disabled",
    })
    await page.mouse.move(0, 0)
  }

  const root = page.locator("html")
  await page
    .getByRole("button", { name: "切换亮色或暗色模式", exact: true })
    .first()
    .click()
  await expect(root).toHaveCSS("color-scheme", "dark")
  await page.screenshot({
    path: testInfo.outputPath("profile-accounts-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])

  await entry("github")
    .getByRole("button", { name: "移除 GitHub", exact: true })
    .click()
  await expect(entry("github")).toHaveCount(0)
  expect(
    api.requests({ method: "DELETE", path: "/api/platform/me/accounts/github" })
  ).toHaveLength(0)
  await save.click()
  await expect
    .poll(
      () =>
        api.requests({
          method: "DELETE",
          path: "/api/platform/me/accounts/github",
        }).length
    )
    .toBe(1)
  await expect(save).toBeDisabled()

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
