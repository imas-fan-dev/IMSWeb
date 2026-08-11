import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AboutManager } from "~/pages/admin/about/index"
import type { AboutPageContent } from "~/lib/api"

function aboutContent(): AboutPageContent {
  return {
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
            avatarUrl: "/brand/about/staff/producer-a.webp",
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
            avatarUrl: "/brand/about/staff/producer-b.webp",
          },
        ],
      },
    ],
    updatedAt: null,
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://localhost"), init)
}

function stubSnapshot(content: AboutPageContent | null = aboutContent()) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({
        content,
        revision: content ? '"revision-7"' : null,
      })
    )
  )
}

describe("AboutManager", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.cookie = "csrf_token=; Max-Age=0; path=/"
  })

  it("starts first-time configuration from a content-free draft", async () => {
    stubSnapshot(null)

    render(<AboutManager />)

    expect(await screen.findByLabelText("站点名称")).toHaveValue("")
    expect(screen.getByLabelText("欢迎语")).toHaveValue("")
    expect(screen.queryByText("偶像大师交流站")).not.toBeInTheDocument()
    expect(screen.getByText("还没有名单分组")).toBeVisible()
    expect(screen.getByRole("button", { name: "保存更改" })).toBeDisabled()
  })

  it("uploads and composes the hero without exposing an image path field", async () => {
    const original = aboutContent()
    document.cookie = "csrf_token=about-manager-test; path=/"
    let savedBody: unknown
    let uploadedHeroFileName: string | null = null
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (request.method === "POST") {
          const form = init?.body
          if (!(form instanceof FormData))
            throw new Error("missing upload form")
          const image = form.get("image")
          uploadedHeroFileName = image instanceof File ? image.name : null
          return jsonResponse({
            success: true,
            url: "/uploads/about/hero/new-hero.webp",
          })
        }
        if (request.method === "PUT") {
          savedBody = await request.clone().json()
          const submitted = savedBody as {
            content: AboutPageContent
            revision: string | null
          }
          return jsonResponse({
            success: true,
            content: {
              ...submitted.content,
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
            revision: '"revision-8"',
          })
        }
        return jsonResponse({ content: original, revision: '"revision-7"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<AboutManager />)

    const welcome = await screen.findByLabelText("欢迎语")
    expect(screen.queryByLabelText("角色主视觉图链接")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("头像链接")).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent("/brand/about/gakuen-arisa.png")
    expect(screen.getByLabelText("角色图片替代文本")).toHaveValue(
      "亚里沙老师全身立绘"
    )

    const desktopPreviewButton = screen.getByRole("button", {
      name: "桌面端",
    })
    const mobilePreviewButton = screen.getByRole("button", {
      name: "移动端",
    })
    const previewCanvas = screen.getByTestId("about-hero-preview-canvas")
    expect(desktopPreviewButton).toHaveAttribute("aria-pressed", "true")
    await user.click(mobilePreviewButton)
    expect(mobilePreviewButton).toHaveAttribute("aria-pressed", "true")
    expect(previewCanvas).toHaveAttribute("data-preview-mode", "mobile")

    await user.click(screen.getByRole("button", { name: /精细位置/ }))
    const heroScale = screen.getByLabelText("角色缩放")
    const compositionPreview = screen.getByTestId(
      "about-hero-composition-preview"
    )
    vi.spyOn(compositionPreview, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(compositionPreview, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    })
    fireEvent.pointerMove(compositionPreview, {
      clientX: 140,
      clientY: 160,
      pointerId: 1,
    })
    fireEvent.pointerUp(compositionPreview, { pointerId: 1 })
    fireEvent.change(heroScale, { target: { value: "120" } })

    await user.click(screen.getByRole("button", { name: "清除角色主视觉图" }))
    expect(
      screen.queryByAltText("亚里沙老师全身立绘构图预览")
    ).not.toBeInTheDocument()

    const heroUpload = screen.getByLabelText("上传角色主视觉图")
    await user.upload(
      heroUpload,
      new File([Uint8Array.of(1, 2, 3)], "new-hero.png", {
        type: "image/png",
      })
    )
    await waitFor(() => expect(uploadedHeroFileName).toBe("new-hero.png"))
    const heroPreview = await screen.findByAltText("亚里沙老师全身立绘构图预览")
    expect(heroPreview).toHaveAttribute(
      "src",
      "/uploads/about/hero/new-hero.webp"
    )
    expect(document.body).not.toHaveTextContent(
      "/uploads/about/hero/new-hero.webp"
    )
    expect(heroPreview).toHaveStyle({
      transform: "translate(10%, 10%) scale(1.2)",
    })

    await user.clear(welcome)
    await user.type(welcome, "欢迎来到更新后的交流站！")
    await user.click(screen.getByRole("button", { name: "保存更改" }))

    await waitFor(() => expect(savedBody).toBeDefined())
    expect(savedBody).toMatchObject({
      revision: '"revision-7"',
      content: {
        heroImageUrl: "/uploads/about/hero/new-hero.webp",
        heroImageOffsetX: 10,
        heroImageOffsetY: 10,
        heroImageScale: 120,
        welcome: "欢迎来到更新后的交流站！",
      },
    })
  })

  it("keeps member edits local to the selected group until both saves", async () => {
    const original = aboutContent()
    document.cookie = "csrf_token=about-manager-test; path=/"
    const savedRequest: {
      current: { content: AboutPageContent; revision: string | null } | null
    } = { current: null }
    const readSavedRequest = () => savedRequest.current
    let avatarUploadCount = 0
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (request.method === "POST") {
          avatarUploadCount += 1
          return jsonResponse({
            success: true,
            url: "/uploads/about/member-avatars/producer-b.webp",
          })
        }
        if (request.method === "PUT") {
          const submitted = (await request.clone().json()) as {
            content: AboutPageContent
            revision: string | null
          }
          savedRequest.current = submitted
          return jsonResponse({
            success: true,
            content: {
              ...submitted.content,
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
            revision: '"revision-8"',
          })
        }
        return jsonResponse({ content: original, revision: '"revision-7"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<AboutManager />)

    await screen.findByRole("button", { name: "编辑成员 制作人A" })
    const pageSaveButton = screen.getByRole("button", { name: "保存更改" })
    const groupSection = screen
      .getByRole("heading", { name: "名单分组" })
      .closest("section")!
    await user.click(
      within(groupSection).getByRole("button", {
        name: /^维护组/,
        pressed: false,
      })
    )
    await user.click(screen.getByRole("button", { name: "编辑成员 制作人B" }))

    let dialog = screen.getByRole("dialog", { name: "编辑成员" })
    expect(within(dialog).getByLabelText("名称")).toHaveValue("制作人B")
    expect(within(dialog).getByAltText("制作人B头像预览")).toHaveAttribute(
      "src",
      "/brand/about/staff/producer-b.webp"
    )
    await user.clear(within(dialog).getByLabelText("名称"))
    await user.type(within(dialog).getByLabelText("名称"), "取消的名称")
    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    expect(screen.queryByText("取消的名称")).not.toBeInTheDocument()
    expect(pageSaveButton).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "编辑成员 制作人B" }))
    dialog = screen.getByRole("dialog", { name: "编辑成员" })
    await user.clear(within(dialog).getByLabelText("名称"))
    await user.type(within(dialog).getByLabelText("名称"), "制作人B改")
    await user.upload(
      within(dialog).getByLabelText("上传头像"),
      new File([Uint8Array.of(4, 5, 6)], "member-avatar.png", {
        type: "image/png",
      })
    )
    await waitFor(() => expect(avatarUploadCount).toBe(1))
    expect(
      await within(dialog).findByAltText("制作人B改头像预览")
    ).toHaveAttribute("src", "/uploads/about/member-avatars/producer-b.webp")
    expect(document.body).not.toHaveTextContent(
      "/uploads/about/member-avatars/producer-b.webp"
    )
    expect(pageSaveButton).toBeDisabled()

    await user.click(within(dialog).getByRole("button", { name: "保存成员" }))
    expect(
      screen.queryByRole("dialog", { name: "编辑成员" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("制作人B改")).toBeVisible()
    expect(readSavedRequest()).toBeNull()
    expect(pageSaveButton).toBeEnabled()

    await user.click(pageSaveButton)
    await waitFor(() => expect(readSavedRequest()).not.toBeNull())
    const savedBody = readSavedRequest()
    if (!savedBody) throw new Error("missing saved About request")
    expect(savedBody.revision).toBe('"revision-7"')
    expect(savedBody.content.groups[0].people[0]).toMatchObject({
      id: "producer-a",
      name: "制作人A",
      avatarUrl: "/brand/about/staff/producer-a.webp",
    })
    expect(savedBody.content.groups[1].people[0]).toMatchObject({
      id: "producer-b",
      name: "制作人B改",
      avatarUrl: "/uploads/about/member-avatars/producer-b.webp",
    })
  })

  it("creates roster entries in dialogs and exposes keyboard sort handles", async () => {
    stubSnapshot()
    const user = userEvent.setup()

    render(<AboutManager />)

    expect(
      await screen.findByRole("button", { name: "拖动排序：创始人" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：维护组" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：制作人A" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：制作人A2" })
    ).toBeVisible()
    const pageSaveButton = screen.getByRole("button", { name: "保存更改" })

    await user.click(screen.getByRole("button", { name: "添加名单分组" }))
    let dialog = screen.getByRole("dialog", { name: "新增名单分组" })
    await user.type(within(dialog).getByLabelText("分组标题"), "内容协力")
    await user.type(within(dialog).getByLabelText("英文副标题"), "Support")
    expect(pageSaveButton).toBeDisabled()
    await user.click(within(dialog).getByRole("button", { name: "保存分组" }))
    expect(screen.getByRole("heading", { name: "内容协力" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "编辑分组 内容协力" }))
    dialog = screen.getByRole("dialog", { name: "编辑名单分组" })
    await user.clear(within(dialog).getByLabelText("分组标题"))
    await user.type(within(dialog).getByLabelText("分组标题"), "内容协力组")
    await user.click(within(dialog).getByRole("button", { name: "保存分组" }))
    expect(screen.getByRole("heading", { name: "内容协力组" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "添加成员" }))
    dialog = screen.getByRole("dialog", { name: "新增成员" })
    await user.type(within(dialog).getByLabelText("名称"), "制作人C")
    await user.type(within(dialog).getByLabelText("身份"), "内容协力")
    await user.click(within(dialog).getByRole("button", { name: "保存成员" }))

    expect(screen.getByText("制作人C")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：制作人C" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "删除成员 制作人C" }))
    const alert = screen.getByRole("alertdialog", { name: "删除成员？" })
    expect(alert).toHaveTextContent("制作人C")
    await user.click(within(alert).getByRole("button", { name: "确认删除" }))
    expect(screen.queryByText("制作人C")).not.toBeInTheDocument()
  })
})
