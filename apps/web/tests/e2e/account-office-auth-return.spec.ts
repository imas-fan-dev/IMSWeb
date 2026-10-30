import {
  platformLoginRequestSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"
import { expect, test } from "./fixtures/test"
import { installMapGuideScene } from "./fixtures/map-guide"
import {
  installPlatformOAuthProvidersMock,
  platformOAuthProviderFixtures,
} from "./fixtures/platform-auth"
import { makeCharacterCatalog } from "./fixtures/fudaba-characters"

test("desktop map creation uses desktop login and returns to the original office point", async ({
  page,
  api,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" })
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  installMapGuideScene(api)
  installPlatformOAuthProvidersMock(
    api,
    { min: 1, max: 8 },
    platformOAuthProviderFixtures
  )
  const session = {
    success: true,
    account: { id: "office-return-owner", status: "active" },
    profile: {
      displayName: "回跳制作人",
      avatarUrl: null,
      homeCity: null,
      bio: "",
    },
  }
  let ownerReads = 0
  let loginBody: unknown
  api.expect({
    method: "POST",
    path: "/api/platform/auth/login",
    body: platformLoginRequestSchema,
    responses: { 200: platformSessionSchema },
    times: 1,
    handle: ({ body }) => {
      loginBody = body
      return { status: 200, json: session }
    },
  })
  for (const [path, json] of [
    [
      "/api/platform/me",
      {
        ...session,
        profile: { ...session.profile, updatedAt: 1 },
        capabilities: { fudabaWrite: true },
      },
    ],
    ...["series", "cards", "offices", "claim-envelopes"].map((name) => [
      `/api/community/exchange/me/${name}`,
      { items: [] },
    ]),
    [
      "/api/community/exchange/me/favorites",
      { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
    ],
  ] as const) {
    await api.mock(
      { method: "GET", path: String(path), times: { min: 1, max: 4 } },
      (route) => {
        ownerReads++
        return route.fulfill({ json })
      }
    )
  }
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/characters",
      times: { min: 0, max: 2 },
    },
    (route) => route.fulfill({ json: makeCharacterCatalog() })
  )
  const reversePoints: number[][] = []
  await api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/places/reverse",
      times: { min: 1, max: 3 },
    },
    (route) => {
      const query = new URL(route.request().url()).searchParams
      const longitude = Number(query.get("longitude")),
        latitude = Number(query.get("latitude"))
      reversePoints.push([longitude, latitude])
      return route.fulfill({
        json: {
          place: {
            id: "returned-point",
            label: "原选点",
            city: "上海",
            address: "原选点的自动地址",
            location: { longitude, latitude, precision: "exact" },
          },
          attribution: {
            text: "© OpenStreetMap contributors",
            url: "https://www.openstreetmap.org/copyright",
          },
        },
      })
    }
  )

  await page.goto("/community/exchange")
  await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute(
    "data-map-state",
    "ready"
  )
  const canvas = page.locator("canvas.maplibregl-canvas")
  const box = (await canvas.boundingBox())!
  await canvas.click({
    button: "right",
    position: { x: box.width * 0.7, y: box.height * 0.4 },
  })
  await page.getByRole("button", { name: "在此创建事务所" }).click()
  await expect(page).toHaveURL(/\/account\/login\?returnTo=/)
  const destination = new URL(page.url()).searchParams.get("returnTo")!
  const intent = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("ims:office-create-intent")!)
  )
  expect(destination).toBe(`/account/me/offices?create=${intent.id}`)
  expect(ownerReads).toBe(0)
  await expect(
    page.getByRole("heading", { name: "登录站点帐号" })
  ).toBeVisible()
  await expect(page.getByText("偏好与帮助", { exact: true })).toHaveCount(0)
  const provider = page.getByRole("link", { name: "GitHub", exact: true })
  expect(
    new URL(
      (await provider.getAttribute("href"))!,
      page.url()
    ).searchParams.get("returnPath")
  ).toBe(destination)
  await page.screenshot({
    path: testInfo.outputPath("desktop-login-return.png"),
    fullPage: true,
  })

  await page.locator('main a[href^="/account/register"]').click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/account/register" &&
      url.searchParams.get("returnTo") === destination
  )
  await page.locator('main a[href^="/account/login"]').click()
  await page.reload()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/account/login" &&
      url.searchParams.get("returnTo") === destination
  )
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("ims:office-create-intent")!).id
    )
  ).toBe(intent.id)
  await page.getByLabel("邮箱").fill("  Producer@Example.COM ")
  await page.getByLabel("密码", { exact: true }).fill("correct-horse-battery")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/account/me/offices" &&
      url.searchParams.get("create") === intent.id
  )
  expect(loginBody).toEqual({
    email: "producer@example.com",
    password: "correct-horse-battery",
  })
  const dialog = page.getByRole("dialog", { name: "新建事务所" })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole("region", { name: "浮标地址预览" })
  ).toContainText("原选点的自动地址")
  expect(reversePoints[0][0]).toBeCloseTo(intent.target.position[0], 5)
  expect(reversePoints[0][1]).toBeCloseTo(intent.target.position[1], 5)
  await expect(dialog.getByLabel("详细地址", { exact: true })).toHaveValue("")
  await dialog.getByRole("button", { name: "确认位置并填写地址" }).click()
  await expect(dialog.getByLabel("城市", { exact: true })).toHaveValue("上海")
  await expect(dialog.getByLabel("详细地址", { exact: true })).toHaveValue(
    "原选点的自动地址"
  )
  const navigation = page.locator('nav[aria-label="个人档案菜单"]')
  await expect(navigation).toBeVisible()
  await expect(navigation.locator('a[aria-current="page"]')).toContainText(
    "事务所与位置"
  )
  const content = page.locator("#profile-workspace-section-offices")
  expect((await content.boundingBox())!.x).toBeGreaterThan(
    (await navigation.boundingBox())!.x
  )
  await page.screenshot({
    path: testInfo.outputPath("desktop-office-return.png"),
    fullPage: true,
  })
})
