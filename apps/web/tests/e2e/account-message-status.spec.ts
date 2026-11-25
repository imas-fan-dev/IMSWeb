import { expect, test } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

test("unified status select in my messages @mobile", async ({
  page,
  api,
  isMobile,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=message-status; path=/"
  })
  await page.context().addCookies([
    {
      name: "ims_platform_access",
      value: "message-status",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  const session = {
    success: true,
    account: { id: "message-status", status: "active" },
    profile: {
      uid: 1,
      displayName: "测试制作人",
      avatarUrl: null,
      homeCity: "上海",
      bio: "",
    },
  }
  await installEmptyWikiCatalogMock(api, { min: 1, max: 2 })
  await api.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 2 },
    },
    (route) => route.fulfill({ json: session })
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: 1 },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: { ...session.profile, updatedAt: 1, pageSlug: null },
        },
      })
  )
  for (const suffix of ["series", "office-series", "cards", "offices"]) {
    await api.mock(
      { method: "GET", path: `/api/community/exchange/me/${suffix}`, times: 1 },
      (route) => route.fulfill({ json: { items: [] } })
    )
  }
  const statuses: (string | null)[] = []
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/messages",
      times: { min: 1, max: 5 },
    },
    (route) => {
      statuses.push(new URL(route.request().url()).searchParams.get("status"))
      return route.fulfill({
        json: {
          messages: [],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
    }
  )
  await page.goto("/account/me/messages")
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark")
  const region = page.getByRole("region", { name: "我的留言" })
  const trigger = region.getByRole("combobox", { name: "显示状态" })
  await expect(trigger).toBeEnabled()
  await expect(trigger).toHaveAttribute("data-slot", "select-trigger")
  await expect(trigger).toContainText("全部")
  expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  if (isMobile) await trigger.tap()
  else await trigger.press("ArrowDown")
  const list = page.getByRole("listbox")
  await expect(list.getByRole("option")).toHaveText([
    "全部",
    "公开可见",
    "支部隐藏",
    "后台隐藏",
  ])
  await page.screenshot({
    path: testInfo.outputPath("message-status-open.png"),
    animations: "disabled",
  })
  if (isMobile) await list.getByRole("option", { name: "公开可见" }).tap()
  else {
    await expect(list.getByRole("option", { name: "全部" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
  }
  await expect(trigger).toBeEnabled()
  await expect(trigger).toContainText("公开可见")
  for (const label of ["支部隐藏", "后台隐藏", "全部"]) {
    await trigger.click()
    await list.getByRole("option", { name: label }).click()
    await expect(trigger).toBeEnabled()
    await expect(trigger).toContainText(label)
  }
  await expect(region.getByText("暂无符合条件的留言。")).toBeVisible()
  expect(statuses).toEqual([
    "all",
    "visible",
    "office-hidden",
    "admin-hidden",
    "all",
  ])
})
