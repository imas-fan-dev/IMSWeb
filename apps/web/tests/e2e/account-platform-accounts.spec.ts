import AxeBuilder from "@axe-core/playwright"
import {
  myPlatformAccountsSchema,
  platformAccountEntrySchema,
  platformAccountRemovalSchema,
  platformAccountValueRequestSchema,
} from "@imsweb/contracts/namecards"

import { expect, test } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

test("adds platform accounts by selection, edits and removes them from personal profile @mobile", async ({
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
    {
      ...base,
      id: "xbox",
      name: "Xbox",
      group: "game-platform",
      icon: "xbox",
      color: "#107c10",
      pattern: "^[A-Za-z0-9]{15}$|^.{12}$",
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
    { method: "GET", path: "/api/platform/auth/session", times: 2 },
    (route) => route.fulfill({ json: session })
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: 2 },
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
    times: 2,
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

  await page.goto("/account/me/profile")
  const section = page.locator("#profile-workspace-section-profile")
  const add = section.getByRole("button", { name: "添加账号", exact: true })
  await expect(
    section.getByText("还没有添加平台账号", { exact: true })
  ).toBeVisible()
  await expect(
    section.getByRole("button", { name: /^编辑(?:GitHub|X|NSO|Xbox)$/ })
  ).toHaveCount(0)
  const profileBounds = await section
    .locator("section[aria-labelledby='profile-editor-title']")
    .boundingBox()
  const accountsBounds = await add.locator("xpath=../../..").boundingBox()
  expect(Math.abs(profileBounds!.x - accountsBounds!.x)).toBeLessThan(1)
  expect(Math.abs(profileBounds!.width - accountsBounds!.width)).toBeLessThan(1)
  await page.screenshot({
    path: testInfo.outputPath("profile-empty-light.png"),
    fullPage: true,
    animations: "disabled",
  })

  await add.click()
  let dialog = page.getByRole("dialog", { name: "添加平台账号", exact: true })
  await expect(
    dialog.getByRole("button", { name: "选择停用平台" })
  ).toHaveCount(0)
  for (const name of ["NSO", "Xbox"]) {
    const image = dialog
      .getByRole("button", { name: `选择${name}`, exact: true })
      .locator("img")
    await expect
      .poll(() =>
        image.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0
        )
      )
      .toBe(true)
  }
  await dialog.getByRole("button", { name: "选择Xbox", exact: true }).click()
  dialog = page.getByRole("dialog", { name: "Xbox", exact: true })
  await dialog
    .getByRole("textbox", { name: "Xbox", exact: true })
    .pressSequentially("Texas Gamer1")
  await expect(
    dialog.getByRole("textbox", { name: "Xbox", exact: true })
  ).toHaveValue("Texas Gamer1")
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true })
  ).toBeEnabled()
  await dialog
    .getByRole("button", { name: "返回选择平台", exact: true })
    .click()
  dialog = page.getByRole("dialog", { name: "添加平台账号", exact: true })
  await dialog.getByRole("searchbox").fill("NSO")
  await expect(dialog.getByRole("button", { name: /^选择/ })).toHaveCount(1)
  await dialog.getByRole("button", { name: "选择NSO", exact: true }).click()
  dialog = page.getByRole("dialog", { name: "NSO", exact: true })
  await dialog
    .getByRole("textbox", { name: "NSO", exact: true })
    .fill("invalid")
  await expect(dialog.getByRole("alert")).toHaveText(/格式不符合/)
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true })
  ).toBeDisabled()
  await dialog
    .getByRole("button", { name: "返回选择平台", exact: true })
    .click()
  await page.getByRole("button", { name: "选择GitHub", exact: true }).click()
  dialog = page.getByRole("dialog", { name: "GitHub", exact: true })
  await dialog
    .getByRole("textbox", { name: "GitHub", exact: true })
    .fill("https://github.com/TexasOct?ref=1")
  await expect(
    dialog.getByRole("textbox", { name: "GitHub", exact: true })
  ).toHaveValue("texasoct")
  await dialog
    .getByRole("textbox", { name: "GitHub 用户名", exact: true })
    .fill("TexasOct")
  await page.screenshot({
    path: testInfo.outputPath("profile-account-edit-light.png"),
    animations: "disabled",
  })
  await dialog.getByRole("button", { name: "保存", exact: true }).click()
  await expect(
    section.getByRole("group", { name: "GitHub账号", exact: true })
  ).toContainText("TexasOct")
  await expect(add).toBeFocused()
  await page.reload()
  await expect(
    section.getByRole("group", { name: "GitHub账号", exact: true })
  ).toContainText("TexasOct")
  await page.context().route("https://github.com/texasoct", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Platform destination</title>",
    })
  )
  const popupOpened = page.waitForEvent("popup")
  await section
    .getByRole("link", { name: "打开GitHub主页", exact: true })
    .click()
  const popup = await popupOpened
  await expect(popup).toHaveURL("https://github.com/texasoct")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await popup.close()
  await add.click()
  dialog = page.getByRole("dialog", { name: "添加平台账号", exact: true })
  await expect(
    dialog.getByRole("button", { name: "选择GitHub", exact: true })
  ).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath("profile-account-choose-light.png"),
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  const root = page.locator("html")
  await page
    .getByRole("button", { name: "切换亮色或暗色模式", exact: true })
    .first()
    .click()
  await expect(root).toHaveCSS("color-scheme", "dark")
  await add.click()
  dialog = page.getByRole("dialog", { name: "添加平台账号", exact: true })
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("profile-account-choose-dark.png"),
    animations: "disabled",
  })
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await page.keyboard.press("Escape")
  await section.getByRole("button", { name: "编辑GitHub", exact: true }).click()
  dialog = page.getByRole("dialog", { name: "GitHub", exact: true })
  await dialog
    .getByRole("textbox", { name: "GitHub 用户名", exact: true })
    .fill("尚未保存")
  await dialog.getByRole("button", { name: "取消", exact: true }).click()
  await expect(
    section.getByRole("group", { name: "GitHub账号", exact: true })
  ).toContainText("TexasOct")
  await page.screenshot({
    path: testInfo.outputPath("profile-account-added-dark.png"),
    fullPage: true,
    animations: "disabled",
  })
  await section
    .getByRole("group", { name: "GitHub账号", exact: true })
    .screenshot({
      path: testInfo.outputPath("profile-account-card-dark.png"),
      animations: "disabled",
    })
  const remove = section.getByRole("button", {
    name: "删除GitHub账号",
    exact: true,
  })
  await remove.click()
  let confirmation = page.getByRole("alertdialog", {
    name: "移除GitHub账号",
    exact: true,
  })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole("button", { name: "取消", exact: true }).click()
  await expect(
    section.getByRole("group", { name: "GitHub账号", exact: true })
  ).toContainText("TexasOct")
  expect(
    api.requests({ method: "DELETE", path: "/api/platform/me/accounts/github" })
  ).toHaveLength(0)
  await remove.click()
  confirmation = page.getByRole("alertdialog", {
    name: "移除GitHub账号",
    exact: true,
  })
  await page.screenshot({
    path: testInfo.outputPath("profile-account-remove-dark.png"),
    animations: "disabled",
  })
  await confirmation
    .getByRole("button", { name: "确认删除", exact: true })
    .click()
  await expect(
    section.getByText("还没有添加平台账号", { exact: true })
  ).toBeVisible()
  await expect(add).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
