import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"
import { once } from "node:events"
import { writeFile } from "node:fs/promises"

import { makeFudabaOwnerCard } from "../../mocks/data/fudaba"
import { expect, test } from "./fixtures/test"
import { installOwnerCardMediaRoutes } from "./fixtures/owner-card-media"

let server: ChildProcess
let runtimeOrigin: string
let token: string
let refreshToken: string
const webMode = process.env.E2E_OWNER_MEDIA_WEB === "1"

test.beforeAll(async () => {
  const apiRoot = path.resolve(process.cwd(), "../api")
  server = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/owner-media-browser-server.ts"],
    {
      cwd: apiRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.server.json" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  runtimeOrigin = await new Promise<string>((resolve, reject) => {
    let output = ""
    let errors = ""
    server.stderr?.on("data", (chunk) => {
      errors += String(chunk)
    })
    server.stdout?.on("data", (chunk) => {
      output += String(chunk)
      for (const line of output.split("\n")) {
        if (line.startsWith('{"origin":'))
          resolve(JSON.parse(line).origin as string)
      }
    })
    server.on("exit", () =>
      reject(new Error(errors || "Owner media server exited"))
    )
  })
  const fixture = await (await fetch(`${runtimeOrigin}/fixture`)).json()
  token = fixture.token
  refreshToken = fixture.refreshToken
})

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM")
    await once(server, "exit")
  }
})

test("Owner front/back images decode through authenticated API routes @app-iphone @app-webkit", async ({
  page,
  api,
  baseURL,
}) => {
  const cors = {
    "Access-Control-Allow-Origin": new URL(baseURL!).origin,
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-IMS-Auth-Mode",
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
  }
  const session = {
    success: true,
    account: { id: "platform-owner", status: "active" },
    profile: {
      displayName: "Owner Display",
      avatarUrl: null,
      homeCity: "Shanghai",
      bio: "",
    },
  }
  const card = makeFudabaOwnerCard({
    id: "owner-card",
    displayName: "Owner Card",
    frontImageUrl:
      "/api/community/exchange/me/cards/owner-card/media/front?v=1",
    backImageUrl: "/api/community/exchange/me/cards/owner-card/media/back?v=1",
  })
  await page.addInitScript(
    ({ accessToken, refreshToken }) => {
      localStorage.setItem("imsweb.language", "zh-CN")
      localStorage.setItem("ims.platform.access-token", accessToken)
      localStorage.setItem("ims.platform.refresh-token", refreshToken)
    },
    { accessToken: webMode ? token : "expired-platform-token", refreshToken }
  )
  if (webMode) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.context().addCookies([
      { name: "ims_platform_access", value: token, url: baseURL! },
      { name: "ims_platform_csrf", value: "owner-csrf-secret", url: baseURL! },
    ])
  } else {
    await api.mock(
      {
        method: "POST",
        path: "/api/platform/auth/refresh",
        times: { min: 1, max: 4 },
      },
      async (route) => {
        const response = await fetch(
          `${runtimeOrigin}/api/platform/auth/refresh`,
          {
            method: "POST",
            headers: route.request().headers(),
            body: route.request().postData(),
          }
        )
        expect(response.status).toBe(200)
        await route.fulfill({
          status: response.status,
          body: await response.text(),
          contentType: "application/json",
          headers: cors,
        })
      }
    )
  }
  await api.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 8 },
    },
    async (route) => {
      const response = await fetch(
        `${runtimeOrigin}/api/platform/auth/session`,
        {
          headers: route.request().headers(),
        }
      )
      await route.fulfill({
        status: response.status,
        body: await response.text(),
        contentType: "application/json",
        headers: cors,
      })
    }
  )
  await api.mock(
    { method: "GET", path: "/api/platform/me", times: { min: 1, max: 8 } },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          profile: { ...session.profile, updatedAt: 1 },
          capabilities: { fudabaWrite: true },
        },
        headers: cors,
      })
  )
  for (const [routePath, json] of [
    ["/api/community/exchange/me/cards", { items: [card] }],
    ["/api/community/exchange/me/cards/owner-card", { card }],
    ["/api/community/exchange/me/series", { items: [] }],
    ["/api/community/exchange/me/claim-envelopes", { items: [] }],
    ["/api/community/exchange/me/offices", { items: [] }],
    [
      "/api/community/exchange/me/favorites",
      { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
    ],
    [
      "/api/wiki/catalog",
      { status: "success", agencies: [], searchEntries: [], selection: null },
    ],
  ] as const) {
    await api.mock(
      { method: "GET", path: routePath, times: { min: 0, max: 10 } },
      (route) => route.fulfill({ json, headers: cors })
    )
  }
  await installOwnerCardMediaRoutes(page, {
    runtimeOrigin,
    token,
    webMode,
    cors,
  })
  const privatePath = "/api/community/exchange/me/cards/owner-card/media/front"
  expect((await fetch(`${runtimeOrigin}${privatePath}`)).status).toBe(401)
  expect(
    (
      await fetch(
        `${runtimeOrigin}/api/community/exchange/me/cards/other-card/media/front`,
        { headers: { authorization: `Bearer ${token}` } }
      )
    ).status
  ).toBe(404)
  const startupReady = Promise.all(
    ["/api/platform/me", "/api/community/exchange/me/cards"].map((pathname) =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === pathname &&
          response.status() === 200
      )
    )
  )
  await page.goto(
    webMode ? "/community/exchange/me?section=cards" : "/account/me/cards",
    { waitUntil: "domcontentloaded" }
  )
  await startupReady
  const inventoryNavigation = page.getByRole("navigation", {
    name: "我的名片清单",
  })
  const inventoryCard = inventoryNavigation.getByRole("button", {
    name: /Owner Card/,
  })
  await expect(inventoryCard).toBeVisible()
  const inventory = inventoryCard.locator("img")
  await expect(inventory).toHaveAttribute(
    "src",
    webMode ? /^\/api\// : /^blob:/
  )
  await expect
    .poll(() =>
      inventory.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  await inventoryCard.click()
  const front = page
    .getByRole("button", { name: "查看Owner Card正面", exact: true })
    .locator("img")
  await front.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      front.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  await front.click()
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute(
    "src",
    webMode ? /^\/api\// : /^blob:/
  )
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .getByRole("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "背面预览" }).click()
  const back = page
    .getByRole("button", { name: "查看Owner Card背面", exact: true })
    .locator("img")
  await back.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      back.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  await back.click()
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .getByRole("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  await page.keyboard.press("Escape")
  await page.locator("#exchange-card-back").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="60"><rect width="90" height="60" fill="red"/></svg>'
    ),
  })
  await expect
    .poll(() =>
      back.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(90)
  await page.locator("#exchange-card-back").setInputFiles([])
  await expect
    .poll(() =>
      back.evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120)
  const stats = await (await fetch(`${runtimeOrigin}/fixture-stats`)).json()
  if (webMode) {
    expect(stats.readUrls).toBeGreaterThan(0)
    expect(stats.signedReads).toBeGreaterThan(0)
    expect(stats.byteReads).toBe(0)
    expect(stats.refreshCalls).toBe(0)
  } else {
    expect(stats.byteReads).toBeGreaterThan(0)
    expect(stats.readUrls).toBe(0)
    expect(stats.signedReads).toBe(0)
    expect(stats.refreshCalls).toBeGreaterThan(0)
    expect(stats.invalidMediaReads + stats.invalidAuthReads).toBeGreaterThan(0)
  }
  const countersPath = test
    .info()
    .outputPath("owner-media-fixture-counters.json")
  await writeFile(countersPath, JSON.stringify(stats, null, 2))
  await test.info().attach("owner-media-fixture-counters", {
    path: countersPath,
    contentType: "application/json",
  })
  await page.screenshot({
    path: test.info().outputPath("owner-media-restored.png"),
    fullPage: true,
  })
})
