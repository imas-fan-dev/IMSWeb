import { mockWallScene } from "./fixtures/wall-scene"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"
import { expect, test } from "./fixtures/test"
test("loads the complete wall observation area and replaces distant content without paging @mobile", async ({
  page,
  api,
  isMobile,
}, testInfo) => {
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
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET"
  )
  const office = {
    id: "window-office",
    slug: "window-office",
    name: "窗口加载事务所",
    intro: "观察区域加载验证",
    city: "上海",
    address: "测试地址",
    accent: "#2581c7",
    coverUrl: null,
    isOpen: true,
    visitorCount: 0,
    seriesCodes: [],
  }
  const cards = Array.from({ length: 61 }, (_, index) => ({
    id: "window-card-" + index,
    producerName: "区域名片 " + index,
    seriesCodes: ["765"],
    favoriteCharacters: [],
    frontImageUrl: "/brand/series/wall/765pro.webp",
    middleImageUrls: [],
    backImageUrl: "/brand/series/wall/765pro.webp",
    accent: "#f34e6c",
    bio: "",
    tradeNote: "",
    exchangeMode: "manual",
    madeOn: null,
    groupName: null,
    producerReading: null,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    credits: [],
    createdAt: "2026-08-02T08:00:00.000Z",
    interactions: {
      likes: 0,
      favorites: 0,
      viewerLiked: false,
      viewerFavorited: false,
    },
    viewerOwned: false,
    placement: {
      x: index === 60 ? 3300 : 800,
      y: 450,
      rotation: 0,
      zIndex: index + 1,
      revision: 0,
      pinnedAt: "2026-08-02T08:00:00.000Z",
      updatedAt: "2026-08-02T08:00:00.000Z",
    },
  }))
  const requests: {
    bounds: number[]
    size: number
  }[] = []
  const writes: string[] = []
  page.on("request", (request) => {
    if (
      request.url().includes("/api/community/exchange/") &&
      ["PUT", "POST", "DELETE"].includes(request.method())
    )
      writes.push(request.url())
  })
  await api.mockRoute(
    "**/api/community/exchange/offices/window-office/wall?*",
    async (route) => {
      const query = new URL(route.request().url()).searchParams
      const bounds = query.get("bbox")!.split(",").map(Number)
      const eligible = cards.filter(
        (card) =>
          card.placement.x >= bounds[0] - 160 &&
          card.placement.x <= bounds[2] + 160 &&
          card.placement.y >= bounds[1] - 120 &&
          card.placement.y <= bounds[3] + 120
      )
      const offset = Number(query.get("cursor") ?? 0)
      const size = Number(query.get("limit"))
      const selected = eligible.slice(offset, offset + size)
      const hasNextPage = offset + size < eligible.length
      requests.push({ bounds, size: selected.length })
      await route.fulfill({
        json: {
          office: { ...office, cards: selected },
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 4800,
            bottom: 900,
            total: 61,
            maxZIndex: 61,
          },
          pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage ? String(offset + size) : null,
          },
        },
      })
    },
    "GET",
    { min: 0, max: 30 }
  )
  await mockWallScene(
    api,
    "**/api/community/exchange/offices/window-office/mixed-wall?*",
    async (route) => {
      const query = new URL(route.request().url()).searchParams
      const bounds = query.get("bbox")!.split(",").map(Number)
      const eligible = cards.filter(
        (card) =>
          card.placement.x >= bounds[0] - 160 &&
          card.placement.x <= bounds[2] + 160 &&
          card.placement.y >= bounds[1] - 120 &&
          card.placement.y <= bounds[3] + 120
      )
      const offset = Number(query.get("cursor") ?? 0)
      const size = Number(query.get("limit"))
      const selected = eligible.slice(offset, offset + size)
      const hasNextPage = offset + size < eligible.length
      requests.push({ bounds, size: selected.length })
      await route.fulfill({
        json: {
          office: { ...office },
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 4800,
            bottom: 900,
            total: 61,
            maxZIndex: 61,
          },
          pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage ? String(offset + size) : null,
          },
          items: selected.map((card) => ({
            kind: "card",
            card,
            canMove: card.viewerOwned === true,
          })),
          capabilities: {
            canCreateMessage: false,
            canArrangeWall: false,
            canManageMessages: false,
          },
        },
      })
    },
    "GET",
    { min: 4, max: 12 }
  )
  await page.goto("/community/exchange/offices/window-office")
  await expect(page.locator("[data-card-id]")).toHaveCount(60)
  await expect(page.getByRole("button", { name: "下一批名片" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "上一批名片" })).toHaveCount(0)
  const viewport = page.getByRole("region", { name: "名片墙放置区域" })
  const scene = viewport.locator("[data-wall-scale]")
  await expect(scene).toHaveAttribute("data-wall-scale", "0.8")
  await expect(page.getByRole("button", { name: "放大墙面" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "缩小墙面" })).toHaveCount(0)
  const visible = await viewport.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scale: Number(
      element
        .querySelector("[data-wall-scale]")!
        .getAttribute("data-wall-scale")
    ),
  }))
  const bounds = requests.at(-1)!.bounds
  expect(bounds[2] - bounds[0]).toBeCloseTo(
    (visible.width / visible.scale) * 1.5,
    3
  )
  expect(bounds[3] - bounds[1]).toBeCloseTo(
    (visible.height / visible.scale) * 1.5,
    3
  )
  expect(requests.every((request) => request.size <= 50)).toBe(true)
  await page.clock.install()
  const beforePan = requests.length
  await viewport.scrollIntoViewIfNeeded()
  const panBox = (await viewport.boundingBox())!
  // Stay inside the 25% buffer even on the 320px packaged App viewport.
  const panPixels = Math.min(40, visible.width / 10)
  const panStart = { x: panBox.x + panBox.width / 2, y: panBox.y + 20 }
  await page.mouse.move(panStart.x, panStart.y)
  await page.mouse.down()
  await page.mouse.move(panStart.x - panPixels, panStart.y)
  await page.mouse.up()
  await expect
    .poll(async () => Number(await scene.getAttribute("data-wall-camera-x")))
    .toBeCloseTo(800 + panPixels / visible.scale, 3)
  await page.clock.runFor(250)
  expect(requests).toHaveLength(beforePan)
  await viewport.focus()
  for (let index = 0; index < 25; index++)
    await page.keyboard.press("ArrowRight")
  await page.clock.runFor(250)
  await expect(page.locator("[data-card-id]")).toHaveCount(1)
  await expect(page.locator('[data-card-id="window-card-60"]')).toHaveAttribute(
    "data-placement-x",
    "3300"
  )
  if (!isMobile) {
    await page
      .getByRole("heading", { name: "事务所名片墙", exact: true })
      .click()
    await viewport.scrollIntoViewIfNeeded()
    const box = (await viewport.boundingBox())!
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.wheel(0, -120)
    await page.clock.runFor(250)
    await expect(scene).toHaveAttribute("data-wall-scale", "0.8")
    await viewport.click({ position: { x: 10, y: 10 } })
    await page.mouse.wheel(0, -120)
    await page.clock.runFor(250)
    await expect
      .poll(async () => Number(await scene.getAttribute("data-wall-scale")))
      .toBeGreaterThan(0.8)
    const zoomed = await scene.getAttribute("data-wall-scale")
    await page
      .getByRole("heading", { name: "事务所名片墙", exact: true })
      .click()
    await viewport.scrollIntoViewIfNeeded()
    const nextBox = (await viewport.boundingBox())!
    await page.mouse.move(nextBox.x + 10, nextBox.y + 10)
    await page.mouse.wheel(0, 120)
    await page.clock.runFor(250)
    await expect(scene).toHaveAttribute("data-wall-scale", zoomed!)
  }
  expect(writes).toEqual([])
  if (isMobile) {
    const touch = await page.context().newCDPSession(page)
    const scale = Number(await scene.getAttribute("data-wall-scale"))
    await expect(
      page.getByRole("button", { name: "平移墙面", exact: true })
    ).toHaveAttribute("aria-pressed", "false")
    await viewport.evaluate((element) => {
      window.scrollTo({
        top: element.getBoundingClientRect().top + window.scrollY - 64,
        behavior: "instant",
      })
    })
    const box = (await viewport.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    expect(
      await page.evaluate(
        ({ x, y }) =>
          Boolean(
            document
              .elementFromPoint(x, y)
              ?.closest('[aria-label="名片墙放置区域"]')
          ),
        { x, y }
      )
    ).toBe(true)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 20, y },
        { x: x + 20, y },
      ],
    })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 40, y },
        { x: x + 40, y },
      ],
    })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect
      .poll(async () => Number(await scene.getAttribute("data-wall-scale")))
      .toBeGreaterThan(scale)
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)
    await expect(
      page.getByRole("button", { name: "平移墙面", exact: true })
    ).toHaveAttribute("aria-pressed", "false")
    await viewport.scrollIntoViewIfNeeded()
    const scrollBox = (await viewport.boundingBox())!
    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBeGreaterThan(0)
    const scrollStart = {
      x: scrollBox.x + 20,
      y: scrollBox.y + scrollBox.height / 2,
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [scrollStart],
    })
    for (const delta of [20, 60, 80])
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...scrollStart, y: scrollStart.y + delta }],
      })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(scrollY)
    await touch.detach()
  }
  await page.getByRole("button", { name: "复位", exact: true }).click()
  await page.clock.runFor(250)
  await expect(scene).toHaveAttribute("data-wall-scale", "0.8")
  await expect(page.locator("[data-card-id]")).toHaveCount(60)
  expect(writes).toEqual([])
  if (process.env.CAPTURE_FUDABA_QA === "1")
    await page.screenshot({
      path: "/tmp/imsweb-wall-window-" + testInfo.project.name + ".png",
    })
})
