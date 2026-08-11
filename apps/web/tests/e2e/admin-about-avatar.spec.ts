import { expect, test } from "@playwright/test"

const content = {
  version: 1,
  siteName: "偶像大师交流站",
  siteNameEn: "A website for producers to communicate.",
  tagline: "由制作人共同维护的社区站点。",
  heroImageUrl: "/brand/about/gakuen-arisa.png",
  heroImageAlt: "亚里沙老师全身立绘",
  heroImageScale: 100,
  heroImageOffsetX: 0,
  heroImageOffsetY: 0,
  accentColorStart: "#B4E04B",
  accentColorEnd: "#E6F9E5",
  welcome: "欢迎制作人！",
  manifesto: ["为了 Top Idol 之名"],
  sinceYear: 2026,
  overviewTitle: "本站概要",
  overview: ["站点介绍。"],
  groups: [
    {
      id: "creators",
      title: "创始人",
      subtitle: "Creator",
      people: [
        {
          id: "producer-a",
          name: "制作人A",
          role: "站长",
          description: "维护站点。",
          since: "Since 2026",
          profileUrl: "https://example.com/producer-a",
          avatarUrl: "/brand/about/staff/iris-radio-p.webp",
        },
        {
          id: "producer-a2",
          name: "制作人A2",
          role: "设计",
          description: "维护视觉。",
          since: "Since 2026",
          profileUrl: null,
          avatarUrl: null,
        },
      ],
    },
    {
      id: "maintainers",
      title: "维护组",
      subtitle: "Maintainer",
      people: [
        {
          id: "producer-b",
          name: "制作人B",
          role: "维护者",
          description: "维护内容。",
          since: "Since 2026",
          profileUrl: null,
          avatarUrl: null,
        },
      ],
    },
  ],
  updatedAt: null,
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    {
      name: "csrf_token",
      value: "about-avatar-e2e",
      domain: "127.0.0.1",
      path: "/",
    },
  ])
  await page.route("**/api/check", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        user: {
          id: 1,
          username: "about-editor",
          producername: "关于页编辑",
          dept: "op",
          adminRole: "admin",
        },
      }),
    })
  })
  await page.route("**/uploads/about/member-avatars/*", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  })
})

test("roster sorting and scoped avatar edits stay in the draft until page save", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserErrors.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  const savedState: { groups: typeof content.groups | null } = { groups: null }
  const readSavedGroups = () => savedState.groups
  await page.route("**/api/admin/about/member-avatar", async (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("about-avatar-e2e")
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        url: "/uploads/about/member-avatars/producer-a.webp",
      }),
    })
  })
  await page.route("**/api/admin/about", async (route) => {
    if (route.request().method() === "PUT") {
      const requestBody = route.request().postDataJSON()
      savedState.groups = requestBody.content.groups
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          content: {
            ...requestBody.content,
            updatedAt: "2026-08-05T04:00:00.000Z",
          },
          revision: '"revision-2"',
        }),
      })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ content, revision: '"revision-1"' }),
    })
  })

  await page.goto("/admin/about")
  await expect(page.getByRole("heading", { name: "关于页配置" })).toBeVisible()
  await expect(page.getByLabel("头像链接")).toHaveCount(0)
  await expect(page.getByLabel("角色主视觉图链接")).toHaveCount(0)
  await expect(page.getByAltText("制作人A头像")).toHaveAttribute(
    "src",
    "/brand/about/staff/iris-radio-p.webp"
  )

  const groupHandle = page.getByRole("button", {
    name: "拖动排序：创始人",
  })
  await groupHandle.focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(100)
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(100)
  await page.keyboard.press("Space")

  const memberHandle = page.getByRole("button", {
    name: "拖动排序：制作人A",
    exact: true,
  })
  await memberHandle.focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(100)
  await page.keyboard.press("ArrowDown")
  await page.waitForTimeout(100)
  await page.keyboard.press("Space")

  await page
    .getByRole("button", { name: "编辑成员 制作人A", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "编辑成员" })
  await expect(dialog.getByLabel("名称")).toHaveValue("制作人A")
  await dialog.getByLabel("上传头像").setInputFiles({
    name: "member-avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from([1, 2, 3]),
  })
  await expect(dialog.getByAltText("制作人A头像预览")).toHaveAttribute(
    "src",
    "/uploads/about/member-avatars/producer-a.webp"
  )
  await expect(
    page.getByText("/uploads/about/member-avatars/producer-a.webp")
  ).toHaveCount(0)
  if (process.env.CAPTURE_ABOUT_AVATAR_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-about-member-dialog-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
  await dialog.getByRole("button", { name: "保存成员" }).click()

  expect(readSavedGroups()).toBeNull()

  await page.getByRole("button", { name: "保存更改" }).click()
  await expect
    .poll(() => readSavedGroups()?.map((group) => group.id))
    .toEqual(["maintainers", "creators"])
  const savedGroups = readSavedGroups()
  if (!savedGroups) throw new Error("missing saved About groups")
  const savedCreators = savedGroups.find((group) => group.id === "creators")
  expect(savedCreators?.people.map((person) => person.id)).toEqual([
    "producer-a2",
    "producer-a",
  ])
  expect(
    savedCreators?.people.find((person) => person.id === "producer-a")
      ?.avatarUrl
  ).toBe("/uploads/about/member-avatars/producer-a.webp")
  await expect(page.getByText(/最近保存/)).toBeVisible()

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
  expect(browserErrors).toEqual([])

  if (process.env.CAPTURE_ABOUT_AVATAR_QA === "1") {
    await page.getByText("制作人A", { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `/tmp/imsweb-about-avatar-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
})
