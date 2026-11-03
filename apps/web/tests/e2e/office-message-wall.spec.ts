import { mockWallScene } from "./fixtures/wall-scene"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"
import { expect, test } from "./fixtures/test"

const office = {
  id: "note-office",
  slug: "note-office",
  name: "便签体验支部",
  intro: "撕边留言",
  city: "上海",
  address: "测试地址",
  accent: "#2581c7",
  coverUrl: null,
  isOpen: true,
  visitorCount: 0,
  seriesCodes: [],
}
const timestamp = "2026-10-13T08:00:00.000Z"
const colors = ["cream", "rose", "mint", "blue", "lavender"] as const
function note(
  index: number,
  x = 800 + (index % 10) * 12,
  y = 450 + Math.floor(index / 10) * 12
) {
  return {
    id: `note-${index}`,
    office: {
      id: office.id,
      slug: office.slug,
      name: office.name,
      isOpen: true,
    },
    authorName: index === 0 ? "长昵称测试制作人".repeat(8) : `制作人 ${index}`,
    content:
      index === 0
        ? "<script>bad</script>\nhttps://example.test\n第三行\n第四行\n第五行\n第六行\n第七行"
        : `便签 ${index} 😀`,
    color: colors[index % 5],
    createdAt: timestamp,
    updatedAt: timestamp,
    placement: {
      pinnedAt: timestamp,
      x,
      y,
      rotation: index === 0 ? -12 : 0,
      zIndex: Math.max(1, 100 - index),
      revision: 0,
      updatedAt: timestamp,
    },
    capabilities: { canEdit: false, canMove: false, canDestroy: false },
  }
}

test.beforeEach(({ api }, testInfo) => {
  const backgroundTimes = testInfo.project.name.startsWith("app-")
    ? 0
    : { min: 1, max: 8 }
  installSeededPublicApis(api, [
    { path: "/api/community/exchange/offices", times: backgroundTimes },
    { path: "/api/community/exchange/cards", times: backgroundTimes },
  ])
})

test("撕边便签密集区域分页、全文与手机双指缩放 @mobile", async ({
  page,
  api,
  isMobile,
}) => {
  test.slow()
  installEmptyWikiCatalogMock(api)
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET"
  )
  const notes = Array.from({ length: 61 }, (_, index) => note(index))
  const pages: number[] = []
  await mockWallScene(
    api,
    "**/api/community/exchange/offices/note-office/mixed-wall?*",
    async (route) => {
      const query = new URL(route.request().url()).searchParams
      const offset = Number(query.get("cursor") ?? 0)
      const selected = notes.slice(offset, offset + 12)
      pages.push(selected.length)
      const hasNextPage = offset + selected.length < notes.length
      await route.fulfill({
        json: {
          office,
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 1600,
            bottom: 900,
            total: notes.length,
            maxZIndex: 100,
          },
          items: selected.map((message) => ({ kind: "message", message })),
          pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage ? String(offset + selected.length) : null,
          },
          capabilities: {
            canCreateMessage: false,
            canArrangeWall: false,
            canManageMessages: false,
          },
        },
      })
    },
    "GET",
    { min: 6, max: 30 }
  )
  await page.goto("/community/exchange/offices/note-office")
  const viewport = page.getByRole("region", { name: "名片墙放置区域" })
  await expect(viewport.locator("[data-message-id]")).toHaveCount(61)
  expect(pages).toContain(1)
  await expect(
    page.getByRole("button", { name: "贴便签留言", exact: true })
  ).toHaveCount(0)
  const paper = viewport
    .locator('[data-message-id="note-0"]')
    .getByRole("button", { name: /^留言：/ })
  await paper.scrollIntoViewIfNeeded()
  await paper.click()
  await expect(paper).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("dialog", { name: "留言全文", exact: true })
  ).toHaveCount(0)
  await paper.click()
  const reader = page.getByRole("dialog", { name: "留言全文" })
  await expect(reader).toBeVisible()
  await expect(reader.locator('[data-slot="dialog-body"]')).toHaveText(
    notes[0].content
  )
  await expect(reader.locator("script, a")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(reader).toHaveCount(0)
  await expect(paper).toBeFocused()
  if (isMobile) {
    const scene = viewport.locator("[data-wall-scale]")
    const before = Number(await scene.getAttribute("data-wall-scale"))
    await viewport.evaluate((element) =>
      window.scrollTo({
        top: element.getBoundingClientRect().top + window.scrollY - 64,
        behavior: "instant",
      })
    )
    const box = (await viewport.boundingBox())!
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2
    const touch = await page.context().newCDPSession(page)
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
      .toBeGreaterThan(before)
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1)
    await touch.detach()
  }
})

test("无名片作者发布重试、编辑、移动和永久销毁 @mobile", async ({
  page,
  context,
  api,
  isMobile,
}, testInfo) => {
  test.slow()
  installEmptyWikiCatalogMock(api)
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await context.addCookies([
    {
      name: "ims_platform_csrf",
      value: "note-csrf",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  const account = { id: "note-author", status: "active" }
  const profile = {
    displayName: "作者",
    avatarUrl: null,
    homeCity: "上海",
    bio: "留言作者",
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
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET",
    { min: testInfo.project.name.startsWith("app-") ? 1 : 2, max: 4 }
  )
  await api.mockRoute(
    "**/api/community/exchange/me/cards",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET",
    { min: 1, max: 5 }
  )
  let current = {
    ...note(0),
    authorName: "作者",
    office: {
      id: office.id,
      slug: office.slug,
      name: office.name,
      isOpen: true,
      status: "active",
    },
    authorAccountId: account.id,
    contentRevision: 0,
    moderationRevision: 0,
    hiddenByOffice: false,
    hiddenByAdmin: false,
    capabilities: {
      canEdit: true,
      canMove: true,
      canDestroy: true,
      canModerateOffice: false,
      canModerateAdmin: false,
    },
  }
  let present = false
  const publicNote = () => {
    return {
      id: current.id,
      authorName: current.authorName,
      content: current.content,
      color: current.color,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      placement: current.placement,
      office: {
        id: office.id,
        slug: office.slug,
        name: office.name,
        isOpen: true,
      },
      capabilities: { canEdit: true, canMove: true, canDestroy: true },
    }
  }
  await mockWallScene(
    api,
    "**/api/community/exchange/offices/note-office/mixed-wall?*",
    (route) =>
      route.fulfill({
        json: {
          office,
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 1600,
            bottom: 900,
            total: present ? 1 : 0,
            maxZIndex: 100,
          },
          items: present ? [{ kind: "message", message: publicNote() }] : [],
          pageInfo: { hasNextPage: false, nextCursor: null },
          capabilities: {
            canCreateMessage: true,
            canArrangeWall: false,
            canManageMessages: false,
          },
        },
      }),
    "GET",
    { min: 2, max: 20 }
  )
  const keys: string[] = []
  await api.mockRoute(
    "**/api/community/exchange/offices/note-office/messages",
    async (route) => {
      keys.push(route.request().headers()["idempotency-key"])
      const body = route.request().postDataJSON()
      expect(body.color).toBe("blue")
      expect(body.content).toBe("作者留言 😀\n第二行")
      if (keys.length === 1)
        return route.fulfill({
          status: 503,
          json: {
            success: false,
            code: "FUDABA_MESSAGE_FAILED",
            message: "暂时无法发布，请重试",
          },
        })
      current = {
        ...current,
        content: body.content,
        color: body.color,
        placement: { ...current.placement, rotation: 0 },
      }
      present = true
      return route.fulfill({
        status: 201,
        json: { success: true, message: current },
      })
    },
    "POST",
    2
  )
  let releasePrivateMessage!: () => void
  const privateMessageReady = new Promise<void>((resolve) => {
    releasePrivateMessage = resolve
  })
  await api.mockRoute(
    "**/api/community/exchange/messages/note-0",
    async (route) => {
      // Hold author capabilities until the reader is visibly mounted.
      await privateMessageReady
      return route.fulfill({ json: { success: true, message: current } })
    },
    "GET",
    { min: 1, max: 12 }
  )
  await api.mockRoute(
    "**/api/community/exchange/messages/note-0",
    (route) => {
      const body = route.request().postDataJSON()
      expect(body.expectedRevision).toBe(0)
      current = {
        ...current,
        content: body.content,
        color: body.color,
        contentRevision: 1,
        updatedAt: "2026-10-13T09:00:00.000Z",
      }
      return route.fulfill({ json: { success: true, message: current } })
    },
    "PUT"
  )
  await api.mockRoute(
    "**/api/community/exchange/messages/note-0/placement",
    (route) => {
      const body = route.request().postDataJSON()
      expect(body.expectedRevision).toBe(current.placement.revision)
      current = {
        ...current,
        placement: {
          ...current.placement,
          x: body.x,
          y: body.y,
          rotation: body.rotation,
          zIndex: body.zIndex,
          revision: current.placement.revision + 1,
        },
      }
      return route.fulfill({ json: { success: true, message: current } })
    },
    "PUT",
    { min: 1, max: 4 }
  )
  await api.mockRoute(
    "**/api/community/exchange/messages/note-0",
    (route) => {
      present = false
      return route.fulfill({
        json: { success: true, id: current.id, destroyed: true },
      })
    },
    "DELETE"
  )
  await page.goto("/community/exchange/offices/note-office")
  await page.getByRole("button", { name: "贴便签留言", exact: true }).click()
  const composer = page.getByRole("dialog", { name: "贴便签留言" })
  await expect(
    composer.getByRole("button", { name: "奶油黄", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await composer.getByLabel("留言正文").fill("作者留言 😀\n第二行")
  const backgrounds = new Set<string>()
  for (const color of ["奶油黄", "樱花粉", "鼠尾草绿", "雾蓝", "浅紫"]) {
    await composer.getByRole("button", { name: color, exact: true }).click()
    const layer = composer
      .getByLabel("便签预览")
      .locator('[style*="clip-path"]')
    const light = await layer.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    )
    backgrounds.add(light)
    await page.evaluate(() => document.documentElement.classList.add("dark"))
    await expect
      .poll(() =>
        layer.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(light)
    await page.evaluate(() => document.documentElement.classList.remove("dark"))
  }
  expect(backgrounds.size).toBe(5)
  await composer.getByRole("button", { name: "雾蓝", exact: true }).click()
  await composer.getByRole("button", { name: "发布便签", exact: true }).click()
  await expect(composer.getByText("暂时无法发布，请重试")).toBeVisible()
  await expect(composer.getByLabel("留言正文")).toHaveValue(
    "作者留言 😀\n第二行"
  )
  await composer.getByRole("button", { name: "发布便签", exact: true }).click()
  await expect(composer).toHaveCount(0)
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
  const viewport = page.getByRole("region", { name: "名片墙放置区域" })
  const paper = viewport
    .locator('[data-message-id="note-0"]')
    .getByRole("button", { name: "留言：作者", exact: true })
  await expect(paper).toHaveAttribute("aria-pressed", "true")
  // Reload to read the public wall item, which must fetch author capabilities.
  await page.reload()
  await paper.scrollIntoViewIfNeeded()
  await paper.click()
  await expect(paper).toHaveAttribute("aria-pressed", "true")
  const reader = page.getByRole("dialog", { name: "留言全文" })
  await expect(reader).toHaveCount(0)
  await paper.click()
  await expect(reader).toBeVisible()
  releasePrivateMessage()
  await expect(
    reader.getByRole("button", { name: "编辑", exact: true })
  ).toBeVisible()
  await expect(
    reader.getByRole("button", { name: "撤回并销毁", exact: true })
  ).toBeVisible()
  await expect(reader.getByRole("alert")).toHaveCount(0)
  await reader.getByRole("button", { name: "编辑", exact: true }).click()
  const editor = page.getByRole("dialog", { name: "编辑留言" })
  const camera = await page.locator("[data-wall-scale]").getAttribute("style")
  await editor.getByLabel("留言正文").fill("编辑后的留言")
  await editor.getByRole("button", { name: "浅紫", exact: true }).click()
  await editor.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(viewport.locator("[data-wall-scale]")).toHaveAttribute(
    "style",
    camera!
  )
  await expect(
    page.getByRole("button", { name: "完成布置", exact: true })
  ).toBeVisible()
  await paper.focus()
  const previousX = current.placement.x
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => current.placement.x).toBe(previousX + 16)
  const wallToolbar = page.getByRole("toolbar", { name: "名片墙编辑工具" })
  await expect(
    wallToolbar.getByRole("button", { name: "向右旋转留言", exact: true })
  ).toBeVisible()
  await expect(
    wallToolbar.getByRole("button", { name: "从名片墙移除", exact: true })
  ).toHaveCount(0)
  const moveHandle = page.getByRole("button", { name: "移动留言", exact: true })
  await moveHandle.scrollIntoViewIfNeeded()
  const handle = (await moveHandle.boundingBox())!
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2
  const beforeDrag = current.placement.revision
  if (isMobile) {
    const touch = await page.context().newCDPSession(page)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 40, y: y + 20 }],
    })
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await touch.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 40, y + 20, { steps: 5 })
    await page.mouse.up()
  }
  await expect.poll(() => current.placement.revision).toBe(beforeDrag + 1)
  await expect(
    page.getByRole("dialog", { name: "留言全文", exact: true })
  ).toHaveCount(0)
  await page.getByRole("button", { name: "向右旋转留言", exact: true }).click()
  await expect.poll(() => current.placement.rotation).toBeGreaterThan(0)
  // Toolbar focus does not clear the selected item or require an extra click.
  await paper.click()
  await expect(reader).toBeVisible()
  await reader.getByRole("button", { name: "撤回并销毁", exact: true }).click()
  const confirmation = page.getByRole("alertdialog")
  await expect(confirmation).toContainText("无法恢复")
  await confirmation
    .getByRole("button", { name: "永久删除", exact: true })
    .click()
  await expect(viewport.locator("[data-message-id]")).toHaveCount(0)
  await expect(reader).toHaveCount(0)
})

test("远处便签深链接会定位并选中 @mobile", async ({ page, api }) => {
  test.slow()
  installEmptyWikiCatalogMock(api)
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET"
  )
  const remote = note(999, 52000, 450)
  const bounds: number[][] = []
  await mockWallScene(
    api,
    "**/api/community/exchange/offices/note-office/mixed-wall?*",
    (route) => {
      const query = new URL(route.request().url()).searchParams
      if (query.get("bbox"))
        bounds.push(query.get("bbox")!.split(",").map(Number))
      return route.fulfill({
        json: {
          office,
          wall: {
            layoutVersion: 1,
            left: 0,
            top: 0,
            right: 56000,
            bottom: 900,
            total: 1,
            maxZIndex: 100,
          },
          items: [{ kind: "message", message: remote }],
          pageInfo: { hasNextPage: false, nextCursor: null },
          capabilities: {
            canCreateMessage: false,
            canArrangeWall: false,
            canManageMessages: false,
          },
        },
      })
    },
    "GET",
    { min: 2, max: 20 }
  )
  await page.goto("/community/exchange/offices/note-office?message=note-999")
  const paper = page
    .locator('[data-message-id="note-999"]')
    .getByRole("button", { name: "留言：制作人 999", exact: true })
  await page
    .getByRole("region", { name: "名片墙放置区域" })
    .scrollIntoViewIfNeeded()
  await expect(paper).toBeInViewport()
  await expect(paper).toHaveAttribute("aria-pressed", "true")
  await expect.poll(() => bounds.some((area) => area[0] > 40000)).toBe(true)
})
