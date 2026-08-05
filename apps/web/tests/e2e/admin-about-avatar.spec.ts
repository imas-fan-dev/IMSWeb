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

test("member avatar upload fills the profile draft and saves responsively", async ({
  page,
}, testInfo) => {
  let savedAvatarUrl: string | null = null
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
      savedAvatarUrl = requestBody.content.groups[0].people[0].avatarUrl
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
  await expect(page.getByAltText("制作人A头像预览")).toHaveAttribute(
    "src",
    "/brand/about/staff/iris-radio-p.webp"
  )

  await page.getByLabel("上传头像").setInputFiles({
    name: "member-avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from([1, 2, 3]),
  })
  await expect(page.getByAltText("制作人A头像预览")).toHaveAttribute(
    "src",
    "/uploads/about/member-avatars/producer-a.webp"
  )

  await page.getByRole("button", { name: "保存更改" }).click()
  await expect
    .poll(() => savedAvatarUrl)
    .toBe("/uploads/about/member-avatars/producer-a.webp")
  await expect(page.getByText(/最近保存/)).toBeVisible()

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)

  if (process.env.CAPTURE_ABOUT_AVATAR_QA === "1") {
    await page.getByText("制作人A", { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `/tmp/imsweb-about-avatar-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
})
