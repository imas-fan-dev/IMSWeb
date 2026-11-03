import type {
  FudabaMixedWallResponse,
  FudabaWallLayoutItem,
} from "@imsweb/contracts/fudaba/messages"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"
import { cardLabel } from "~/pages/community/exchange/components/card-label"
import { sceneImageBase64, sceneTinyPreview } from "./fixtures/scene-image"
import { expect, test } from "./fixtures/test"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const timestamp = "2026-10-13T08:00:00.000Z"
const office = {
  id: "scene-office",
  slug: "scene-office",
  name: "渐进加载支部",
  intro: "测试墙面",
  city: "上海",
  address: "测试地址",
  accent: "#2581c7",
  coverUrl: null,
  isOpen: true,
  visitorCount: 0,
  seriesCodes: [],
}
const placement = (
  x: number,
  y: number,
  zIndex: number,
  pinnedAt = timestamp
) => ({
  pinnedAt,
  x,
  y,
  rotation: 0,
  zIndex,
  revision: 0,
  updatedAt: timestamp,
})

test("全墙1000占位、远处逐物件加载、定位选择与动态便签 @mobile", async ({
  page,
  context,
  api,
  isMobile,
}, testInfo) => {
  test.setTimeout(60000)
  installEmptyWikiCatalogMock(api)
  const backgroundTimes = testInfo.project.name.startsWith("app-")
    ? 0
    : { min: 1, max: 8 }
  installSeededPublicApis(api, [
    { path: "/api/community/exchange/offices", times: backgroundTimes },
    { path: "/api/community/exchange/cards", times: backgroundTimes },
  ])
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await context.addCookies([
    {
      name: "ims_platform_csrf",
      value: "scene-csrf",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  const account = { id: "scene-author", status: "active" }
  const profile = {
    displayName: "加载测试制作人",
    avatarUrl: null,
    homeCity: "上海",
    bio: "测试",
  }
  await api.mockRoute(
    "**/api/platform/auth/session",
    (route) => route.fulfill({ json: { success: true, account, profile } }),
    "GET",
    { min: 1, max: 5 }
  )
  await api.mockRoute(
    "**/api/platform/me",
    (route) =>
      route.fulfill({
        json: {
          success: true,
          account,
          capabilities: { fudabaWrite: true },
          profile: { ...profile, updatedAt: 1 },
        },
      }),
    "GET",
    { min: 1, max: 5 }
  )
  await api.mockRoute(
    "**/api/community/exchange/me/cards",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET",
    { min: 1, max: 5 }
  )
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET",
    { min: 1, max: 3 }
  )
  const items: FudabaMixedWallResponse["items"] = Array.from(
    { length: 3 },
    (_, index) => ({
      kind: "card" as const,
      canMove: true,
      card: {
        id: `card-${index}`,
        producerName: ["最老的名片", "第二张名片", "最新的名片"][index],
        seriesCodes: ["765"],
        favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
        frontImageUrl: `/__scene_media__/card-${index}.webp`,
        middleImageUrls: [],
        backImageUrl: `/__scene_media__/back-${index}.webp`,
        accent: "#ef92ac",
        bio: "渐进加载",
        tradeNote: "交换",
        exchangeMode: "manual",
        madeOn: null,
        groupName: null,
        producerReading: null,
        isOriginal: false,
        madeWithAi: false,
        visible: true,
        credits: [],
        createdAt: timestamp,
        interactions: {
          likes: 0,
          favorites: 0,
          viewerLiked: false,
          viewerFavorited: false,
        },
        viewerOwned: true,
        placement: placement(
          index === 0 ? 650 : index * 20000,
          450,
          index + 1,
          `2026-10-0${index + 1}T08:00:00.000Z`
        ),
      },
    })
  )
  for (let index = 0; index < 997; index++)
    items.push({
      kind: "message",
      message: {
        id: `scene-note-${index}`,
        office: {
          id: office.id,
          slug: office.slug,
          name: office.name,
          isOpen: true,
        },
        authorName: `留言作者 ${index}`,
        content: index === 1 ? "远处长留言\n".repeat(30) : `留言 ${index}`,
        color: index % 2 ? "rose" : "cream",
        createdAt: timestamp,
        updatedAt: timestamp,
        placement: placement(
          index === 0 ? 950 : index === 1 ? 20320 : 70000 + (index % 20) * 280,
          index < 2 ? 450 : 20000 + Math.floor(index / 20) * 600,
          index + 10
        ),
        capabilities: { canEdit: false, canMove: false, canDestroy: false },
      },
    })
  const heights = new Map<string, number>([["scene-note-1", 560]])
  const layouts = (): FudabaWallLayoutItem[] =>
    items.map((item) =>
      item.kind === "card"
        ? {
            kind: "card",
            id: item.card.id,
            displayName: cardLabel(item.card),
            viewerOwned: true,
            placement: item.card.placement,
            width: 240,
            height: 160,
            layoutVersion: 1,
            preview: sceneTinyPreview,
            assetVersion: item.card.id,
          }
        : {
            kind: "message",
            id: item.message.id,
            placement: item.message.placement,
            width: 242,
            height: heights.get(item.message.id) ?? 160,
            layoutVersion: 1,
            color: item.message.color,
            contentRevision: 0,
          }
    )
  const wall = () => ({
    layoutVersion: 1 as const,
    left: 0,
    top: 0,
    right: 100000,
    bottom: 100000,
    maxZIndex: 2000,
    total: items.length,
  })
  const finalIndex = deferred(),
    firstRemote = deferred(),
    secondRemote = deferred(),
    imageGate = deferred()
  const offsets = new Set<number>()
  let lastIndexRequested = false
  await api.mockRoute(
    "**/api/community/exchange/offices/scene-office/wall-layout",
    async (route) => {
      const offset = Number(
        new URL(route.request().url()).searchParams.get("cursor") ?? 0
      )
      offsets.add(offset)
      if (offset === 900) {
        lastIndexRequested = true
        await finalIndex.promise
      }
      const list = layouts()
      return route.fulfill({
        json: {
          version: 1,
          office,
          wall: wall(),
          items: list.slice(offset, offset + 100),
          pageInfo: {
            hasNextPage: offset + 100 < list.length,
            nextCursor:
              offset + 100 < list.length ? String(offset + 100) : null,
          },
        },
      })
    },
    "GET",
    { min: 10, max: 24 }
  )
  await api.mockRoute(
    "**/api/community/exchange/offices/scene-office/wall-scene",
    async (route) => {
      const url = new URL(route.request().url()),
        bbox = (url.searchParams.get("bbox") ?? "0,0,1600,900")
          .split(",")
          .map(Number)
      const offset = Number(url.searchParams.get("cursor") ?? 0),
        itemKey = url.searchParams.get("item")
      const all = layouts(),
        byKey = new Map(all.map((item) => [`${item.kind}:${item.id}`, item]))
      const visible = items.filter((item) => {
        const id = item.kind === "card" ? item.card.id : item.message.id,
          key = `${item.kind}:${id}`,
          meta = byKey.get(key)!
        return itemKey
          ? key === itemKey
          : meta.placement.x + meta.width / 2 >= bbox[0] &&
              meta.placement.x - meta.width / 2 <= bbox[2] &&
              meta.placement.y + meta.height / 2 >= bbox[1] &&
              meta.placement.y - meta.height / 2 <= bbox[3]
      })
      const remote = visible.some(
        (item) => item.kind === "card" && item.card.id === "card-1"
      )
      if (remote)
        await (offset === 0 ? firstRemote.promise : secondRemote.promise)
      const selected = visible.slice(offset, offset + 1)
      return route.fulfill({
        json: {
          version: 1,
          office,
          wall: wall(),
          items: selected,
          layouts: selected.map((item) =>
            byKey.get(
              `${item.kind}:${item.kind === "card" ? item.card.id : item.message.id}`
            )
          ),
          pageInfo: {
            hasNextPage: offset + 1 < visible.length,
            nextCursor: offset + 1 < visible.length ? String(offset + 1) : null,
          },
          capabilities: {
            canCreateMessage: true,
            canArrangeWall: false,
            canManageMessages: false,
          },
        },
      })
    },
    "GET",
    { min: 5, max: 40 }
  )
  await page.route(
    (url) => /^\/__scene_media__\/[^/]+\.webp$/.test(url.pathname),
    async (route) => {
      if (route.request().url().includes("/card-1.webp"))
        await imageGate.promise
      await route.fulfill({
        status: 200,
        contentType: "image/webp",
        body: Buffer.from(sceneImageBase64, "base64"),
      })
    }
  )
  let postedHeight = 0
  await api.mockRoute(
    "**/api/community/exchange/offices/scene-office/messages",
    (route) => {
      const body = route.request().postDataJSON()
      postedHeight = body.height
      const message = {
        id: "created-note",
        office: {
          id: office.id,
          slug: office.slug,
          name: office.name,
          isOpen: true,
        },
        authorName: profile.displayName,
        content: body.content,
        color: body.color,
        createdAt: timestamp,
        updatedAt: timestamp,
        placement: placement(800, 700, 2001),
        capabilities: { canEdit: true, canMove: true, canDestroy: true },
      }
      items.push({ kind: "message", message })
      heights.set(message.id, body.height)
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          message: {
            ...message,
            office: { ...message.office, status: "active" },
            authorAccountId: account.id,
            contentRevision: 0,
            moderationRevision: 0,
            hiddenByOffice: false,
            hiddenByAdmin: false,
            capabilities: {
              ...message.capabilities,
              canModerateOffice: false,
              canModerateAdmin: false,
            },
          },
        },
      })
    },
    "POST"
  )
  await page.goto("/community/exchange/offices/scene-office")
  await expect(
    page.getByRole("button", { name: "正在准备定位…" })
  ).toBeDisabled()
  await expect.poll(() => lastIndexRequested).toBe(true)
  finalIndex.resolve()
  await expect(
    page.getByRole("button", { name: "定位我的名片", exact: true })
  ).toBeEnabled()
  expect([...offsets].sort((a, b) => a - b)).toEqual([
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  ])
  const locate = async (name: string) => {
    if (isMobile)
      await page.getByRole("button", { name: /^定位我的名片/ }).click()
    else {
      await page
        .getByRole("button", { name: "定位我的名片", exact: true })
        .click()
      await page.getByRole("button", { name: new RegExp(name) }).click()
    }
  }
  if (isMobile) await locate("最老的名片")
  await locate("第二张名片")
  const viewport = page.getByRole("region", { name: "名片墙放置区域" })
  await viewport.scrollIntoViewIfNeeded()
  await expect(
    page.locator('[data-wall-placeholder="card:card-1"]')
  ).toBeVisible()
  await expect(
    page.locator('[data-wall-placeholder="message:scene-note-1"]')
  ).toBeVisible()
  firstRemote.resolve()
  await expect(page.locator('[data-wall-image-loading="card-1"]')).toBeVisible()
  await expect(
    page.locator('[data-wall-placeholder="message:scene-note-1"]')
  ).toBeVisible()
  imageGate.resolve()
  await expect(page.locator('[data-wall-image-loading="card-1"]')).toHaveCount(
    0
  )
  secondRemote.resolve()
  await expect(page.locator('[data-message-id="scene-note-1"]')).toHaveCSS(
    "height",
    "560px"
  )
  await locate("最新的名片")
  await expect(page.locator('[data-card-id="card-2"]')).toHaveClass(/ring-2/)
  await locate("最老的名片")
  await expect(page.locator('[data-card-id="card-0"]')).toHaveClass(/ring-2/)
  if (isMobile)
    await expect(
      page.getByRole("button", { name: "定位我的名片 · 1/3" })
    ).toBeVisible()
  await page.getByRole("button", { name: "贴便签留言", exact: true }).click()
  const composer = page.getByRole("dialog", { name: "贴便签留言" }),
    preview = composer.getByLabel("便签预览")
  await composer.getByLabel("留言正文").fill("短留言")
  await expect(preview).toHaveCSS("height", "160px")
  await composer
    .getByLabel("留言正文")
    .fill("第一行\n第二行\n第三行\n第四行\n第五行\n第六行")
  await expect
    .poll(async () =>
      Number.parseFloat(
        await preview.evaluate((element) => getComputedStyle(element).height)
      )
    )
    .toBeGreaterThan(160)
  await composer.getByLabel("留言正文").fill("字\n".repeat(120) + "字")
  await expect(preview).toHaveCSS("height", "560px")
  await expect(preview.getByText("查看全文")).toBeVisible()
  await composer.getByRole("button", { name: "发布便签", exact: true }).click()
  await expect(composer).toHaveCount(0)
  expect(postedHeight).toBe(560)
  await expect(page.locator('[data-message-id="created-note"]')).toHaveCSS(
    "height",
    "560px"
  )
  await viewport.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: test.info().outputPath("scene-dynamic-note.png"),
  })
  console.log(
    "scene-browser-sample",
    JSON.stringify({
      indexObjects: 1000,
      visibleRemoteObjects: 2,
      device: isMobile ? "mobile" : "desktop",
    })
  )
})
