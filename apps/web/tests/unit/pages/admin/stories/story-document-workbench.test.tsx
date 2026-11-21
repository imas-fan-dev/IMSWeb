import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  jsonResponse,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { StoryManagementPage } from "~/pages/admin/stories"
import type { WikiAdminCatalog, WikiAdminStories } from "~/lib/api"

const catalog = {
  status: "success",
  agencies: [
    {
      id: 1,
      code: "765pro",
      name: "765PRO",
      color: "#f34f6d",
      wikiEnabled: true,
      bannerTitle: "765PRO ALLSTARS",
      displayOrder: 0,
      layoutRevision: 0,
      iconUrl: null,
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      mediaRevision: 0,
      idols: [
        {
          id: 10,
          agencyId: 1,
          name: "天海春香",
          folderName: "amami_haruka",
          color: "#e22b30",
          wikiUrl: null,
          textColor: "#ffffff",
          displayOrder: 0,
          imageUrl: "",
          imageFit: "cover",
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
          mediaRevision: 0,
          wikiEnabled: true,
          groupIds: [2],
          entryKind: "idol",
          entrySubtype: null,
        },
      ],
      groups: [
        {
          id: 2,
          code: "allstars",
          name: "ALLSTARS",
          color: "#f34f6d",
          iconUrl: null,
          displayOrder: 0,
          isFallback: true,
          idolIds: [10],
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
          mediaRevision: 0,
          idols: [
            {
              id: 10,
              agencyId: 1,
              name: "天海春香",
              folderName: "amami_haruka",
              color: "#e22b30",
              wikiUrl: null,
              textColor: "#ffffff",
              displayOrder: 0,
              imageUrl: "",
              imageFit: "cover",
              imageTransform: {
                fit: "cover",
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0,
              },
              mediaRevision: 0,
              wikiEnabled: true,
              groupIds: [2],
              entryKind: "idol",
              entrySubtype: null,
            },
          ],
        },
      ],
    },
  ],
} satisfies WikiAdminCatalog

const stories = {
  status: "success",
  agency: { id: 1, code: "765pro", name: "765PRO", color: "#f34f6d" },
  idol: {
    id: 10,
    agencyId: 1,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#e22b30",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: {
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    mediaRevision: 0,
    entryKind: "idol",
    entrySubtype: null,
  },
  categories: [
    {
      id: 1,
      name: "主线",
      storageSlug: "main",
      displayOrder: 0,
      showWhenEmpty: true,
      backgroundEligible: false,
      revision: 5,
    },
    {
      id: 2,
      name: "活动",
      storageSlug: "event",
      displayOrder: 1,
      showWhenEmpty: true,
      backgroundEligible: false,
      revision: 2,
    },
  ],
  contentTypes: [],
  sourcePlatforms: [],
  cards: [
    {
      cardId: 20,
      category: "主线",
      cardName: "【第一话】",
      subtitle: "开场",
      imageFile: null,
      imageUrl: "",
      imageTransform: {
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      mediaRevision: 7,
      revision: 7,
    },
  ],
  stories: [],
} satisfies WikiAdminStories

const coverAssets = {
  status: "success",
  agency: { id: 1, code: "765pro", name: "765PRO" },
  assets: [
    {
      id: 12,
      agencyId: 1,
      name: "通用主线封面",
      imageUrl: "/media/wiki/765pro/cover-12.webp",
      presentationPolicy: "contain",
      displayOrder: 0,
      isActive: true,
      revision: 0,
      usageCount: 2,
    },
  ],
}

function documentPayload(
  input: {
    contentMode?: "structured" | "document"
    sourceMarkdown?: string
    revision?: number
    blocks?: unknown[]
    warnings?: Array<{ line: number; code: string; message: string }>
    media?: Array<{ id: number; imageUrl: string; altText: string }>
    revisionsSummary?: {
      count: number
      latestRevision: number | null
      latestCreatedAt: string | null
    }
  } = {}
) {
  return {
    status: "success",
    entry: {
      id: 10,
      projectId: 1,
      projectCode: "765pro",
      projectName: "765PRO",
      name: "天海春香",
      folderName: "amami_haruka",
      entryKind: "idol",
    },
    contentMode: input.contentMode ?? "structured",
    sourceMarkdown: input.sourceMarkdown ?? "",
    revision: input.revision ?? 0,
    document: {
      version: 1,
      headings: [],
      availableTags: [],
      blocks: input.blocks ?? [],
    },
    warnings: input.warnings ?? [],
    media: input.media ?? [],
    revisionsSummary: input.revisionsSummary ?? {
      count: 0,
      latestRevision: null,
      latestCreatedAt: null,
    },
  }
}

type RecordedRequest = {
  method: string
  pathname: string
  body: unknown
}

type WorkbenchRoutes = {
  catalog?: unknown
  document?: (entryId: number) => Response | Promise<Response>
  preview?: (body: { sourceMarkdown: string }) => Response | Promise<Response>
  save?: (body: {
    contentMode: string
    sourceMarkdown: string
    expectedRevision: number
  }) => Response | Promise<Response>
  media?: (body: FormData) => Response | Promise<Response>
  revisions?: (entryId: number) => Response | Promise<Response>
  revision?: (entryId: number, revision: number) => Response | Promise<Response>
}

/** Mocks every request the workbench issues and records them for assertions. */
function installWorkbenchFetch(routes: WorkbenchRoutes = {}) {
  const requests: RecordedRequest[] = []
  installFetchMock((...args) => {
    const request = requestDetails(args)
    const url = new URL(request.url, window.location.origin)
    const method = request.method.toUpperCase()
    let body: unknown = request.body
    if (typeof request.body === "string") {
      body = JSON.parse(request.body) as unknown
    }
    requests.push({ method, pathname: url.pathname, body })
    if (method === "GET" && url.pathname === "/api/admin/wiki/catalog") {
      return Promise.resolve(jsonResponse(routes.catalog ?? catalog))
    }
    if (
      method === "GET" &&
      url.pathname === "/api/admin/wiki/story-source-catalog"
    ) {
      return Promise.resolve(
        jsonResponse({
          status: "success",
          contentTypes: [],
          sourcePlatforms: [],
        })
      )
    }
    if (method === "GET" && url.pathname.endsWith("/story-cover-assets")) {
      return Promise.resolve(jsonResponse(coverAssets))
    }
    if (method === "GET" && url.pathname === "/api/admin/wiki/stories") {
      return Promise.resolve(jsonResponse(stories))
    }
    const entryDocument = /^\/api\/admin\/wiki\/entries\/(\d+)\/document$/.exec(
      url.pathname
    )
    if (entryDocument) {
      const entryId = Number(entryDocument[1])
      if (method === "GET") {
        return Promise.resolve(
          routes.document
            ? routes.document(entryId)
            : jsonResponse(documentPayload())
        )
      }
      if (method === "PUT" && routes.save) {
        return Promise.resolve(
          routes.save(body as Parameters<NonNullable<typeof routes.save>>[0])
        )
      }
    }
    const entryDocumentChild =
      /^\/api\/admin\/wiki\/entries\/(\d+)\/document\/(preview|media)$/.exec(
        url.pathname
      )
    if (
      method === "POST" &&
      entryDocumentChild?.[2] === "preview" &&
      routes.preview
    ) {
      return Promise.resolve(routes.preview(body as { sourceMarkdown: string }))
    }
    if (
      method === "POST" &&
      entryDocumentChild?.[2] === "media" &&
      routes.media
    ) {
      return Promise.resolve(
        routes.media(body as Parameters<NonNullable<typeof routes.media>>[0])
      )
    }
    const entryDocumentRevisions =
      /^\/api\/admin\/wiki\/entries\/(\d+)\/document\/revisions$/.exec(
        url.pathname
      )
    if (method === "GET" && entryDocumentRevisions) {
      if (!routes.revisions) {
        return Promise.reject(new Error(`Unexpected request: ${request.url}`))
      }
      return Promise.resolve(
        routes.revisions(Number(entryDocumentRevisions[1]))
      )
    }
    const entryDocumentRevision =
      /^\/api\/admin\/wiki\/entries\/(\d+)\/document\/revisions\/(\d+)$/.exec(
        url.pathname
      )
    if (method === "GET" && entryDocumentRevision) {
      if (!routes.revision) {
        return Promise.reject(new Error(`Unexpected request: ${request.url}`))
      }
      return Promise.resolve(
        routes.revision(
          Number(entryDocumentRevision[1]),
          Number(entryDocumentRevision[2])
        )
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${request.url}`))
  })
  return requests
}

function sourceValue() {
  return (
    screen.getByRole("textbox", { name: "文档源码" }) as HTMLTextAreaElement
  ).value
}

/** Types at the end of the draft so save assertions are position-independent. */
async function typeAtEnd(
  user: ReturnType<typeof userEvent.setup>,
  textarea: HTMLElement,
  text: string
) {
  const element = textarea as HTMLTextAreaElement
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
  await user.type(element, text)
}

function catalogWithSecondIdol() {
  const second = structuredClone(catalog)
  const agency = second.agencies[0]
  const template = agency.idols[0]
  agency.idols.push({
    ...template,
    id: 11,
    name: "如月千早",
    folderName: "kisara_chihaya",
    color: "#7f9bd6",
    groupIds: [],
  })
  return second
}

function renderWorkbench() {
  const router = createMemoryRouter(
    [{ path: "/admin/stories", element: <StoryManagementPage /> }],
    { initialEntries: ["/admin/stories?agencyId=1&idolId=10"] }
  )
  render(<RouterProvider router={router} />)
  return router
}

async function findModeSwitch() {
  return screen.findByRole("group", { name: "内容页编辑模式" })
}

describe("Wiki document workbench", () => {
  beforeEach(() => {
    setCsrfCookie("legacy", "wiki-document-workbench-test")
  })

  it("switches between structured and document modes without dropping the draft", async () => {
    installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: "## 观看顺序\n\n先看第一话。\n",
            revision: 4,
          })
        ),
    })
    renderWorkbench()
    const user = userEvent.setup()

    const modeSwitch = await findModeSwitch()
    const structuredButton = screen.getByRole("button", {
      name: "结构化卡片模式",
    })
    const documentButton = screen.getByRole("button", {
      name: "增强 Markdown 文档模式",
    })
    expect(modeSwitch).toBeVisible()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    expect(source).toHaveValue("## 观看顺序\n\n先看第一话。\n")
    expect(documentButton).toHaveAttribute("aria-pressed", "true")
    expect(structuredButton).toHaveAttribute("aria-pressed", "false")

    await user.clear(source)
    await user.type(source, "草稿仍在编辑器中")

    await user.click(structuredButton)
    const confirm = await screen.findByRole("alertdialog", {
      name: "切换编辑模式？",
    })
    expect(confirm).toHaveTextContent("未保存")
    await user.click(screen.getByRole("button", { name: "仍然切换" }))
    await waitFor(() =>
      expect(structuredButton).toHaveAttribute("aria-pressed", "true")
    )
    expect(
      screen.queryByRole("region", { name: "增强 Markdown 文档编辑器" })
    ).not.toBeInTheDocument()

    await user.click(documentButton)
    await user.click(await screen.findByRole("button", { name: "仍然切换" }))
    expect(screen.getByRole("textbox", { name: "文档源码" })).toHaveValue(
      "草稿仍在编辑器中"
    )
  })

  it("compiles the draft once after a typing pause and jumps to warning lines", async () => {
    const previews: string[] = []
    const requests = installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: "## 初始导览\n",
            revision: 7,
            blocks: [
              {
                type: "heading",
                level: 2,
                id: "stored-heading",
                children: [{ type: "text", value: "初始导览" }],
              },
            ],
          })
        ),
      preview: ({ sourceMarkdown }) => {
        previews.push(sourceMarkdown)
        return jsonResponse({
          status: "success",
          document: {
            version: 1,
            headings: [
              { id: "server-heading", level: 2, text: "服务端编译结果" },
            ],
            availableTags: [],
            blocks: [
              {
                type: "heading",
                level: 2,
                id: "server-heading",
                children: [{ type: "text", value: "服务端编译结果" }],
              },
              {
                type: "paragraph",
                children: [{ type: "text", value: "第二段正文" }],
              },
            ],
          },
          warnings: [
            {
              line: 2,
              code: "raw-html",
              message: "不允许原生 HTML",
            },
          ],
        })
      },
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    const previewPane = screen.getByRole("region", { name: "文档预览" })
    expect(
      await within(previewPane).findByRole("heading", { name: "初始导览" })
    ).toBeVisible()
    // The stored snapshot seeds the pane, so opening never spends a request.
    expect(
      requests.filter((request) => request.pathname.endsWith("/preview"))
    ).toHaveLength(0)

    await user.type(source, "追加第二行")
    await waitFor(() => expect(previews).toHaveLength(1), { timeout: 4000 })
    expect(
      await within(previewPane).findByRole("heading", {
        name: "服务端编译结果",
      })
    ).toBeVisible()
    expect(
      within(previewPane).queryByRole("heading", { name: "初始导览" })
    ).not.toBeInTheDocument()

    const warning = screen.getByRole("button", { name: /第 2 行/ })
    expect(warning).toHaveTextContent("不允许原生 HTML")
    await user.click(warning)
    const secondLineStart =
      (source as HTMLTextAreaElement).value.indexOf("\n") + 1
    expect(document.activeElement).toBe(source)
    expect((document.activeElement as HTMLTextAreaElement).selectionStart).toBe(
      secondLineStart
    )

    const viewSwitcher = screen.getByRole("group", { name: "切换编辑视图" })
    const previewTab = within(viewSwitcher).getByRole("button", {
      name: "预览",
    })
    const sourceTab = within(viewSwitcher).getByRole("button", {
      name: "源码",
    })
    await user.click(previewTab)
    expect(previewTab).toHaveAttribute("aria-pressed", "true")
    expect(sourceTab).toHaveAttribute("aria-pressed", "false")
    await user.click(sourceTab)
    expect(sourceTab).toHaveAttribute("aria-pressed", "true")
  })

  it("inserts block templates, the entry's own categories, and shared covers", async () => {
    installWorkbenchFetch({
      document: () =>
        jsonResponse(documentPayload({ contentMode: "document", revision: 3 })),
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    expect(screen.getByRole("toolbar", { name: "快捷插入" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "插入卡片网格" }))
    expect(sourceValue()).toContain(':::card-grid{layout="grid" cols="3"}')
    expect(sourceValue()).toContain(':::card{title="【卡片标题】"}')

    await user.click(screen.getByRole("button", { name: "插入提示框" }))
    expect(sourceValue()).toContain(':::callout{type="tip" title="提示"}')

    await user.click(screen.getByRole("button", { name: "插入折叠块" }))
    expect(sourceValue()).toContain(':::details{title="剧透折叠"}')

    await user.click(screen.getByRole("button", { name: "插入选项卡" }))
    expect(sourceValue()).toContain(":::tabs")
    expect(sourceValue()).toContain(':::tab{title="选项卡 1"}')

    await user.click(screen.getByRole("button", { name: "插入来源链接" }))
    expect(sourceValue()).toContain(':::links{title="来源"}')
    expect(sourceValue()).toContain(
      "- [](https://www.bilibili.com/video/BV1xx411c7mD)"
    )

    await user.click(screen.getByRole("combobox", { name: "插入分类嵌入" }))
    await user.click(await screen.findByRole("option", { name: "主线" }))
    expect(sourceValue()).toContain('::story-category{name="主线"}')

    await user.click(screen.getByRole("combobox", { name: "插入共享封面" }))
    await user.click(
      await screen.findByRole("option", { name: "通用主线封面" })
    )
    expect(sourceValue()).toContain('::media{asset="cover:12"}')
    expect(source).not.toBeNull()
  })

  it("uploads pasted, dropped, and picked images as doc assets", async () => {
    const uploads: FormData[] = []
    let nextId = 80
    installWorkbenchFetch({
      document: () =>
        jsonResponse(documentPayload({ contentMode: "document", revision: 2 })),
      media: (body) => {
        const form = body as FormData
        uploads.push(form)
        nextId += 1
        const file = form.get("image") as File
        return jsonResponse({
          status: "success",
          media: {
            id: nextId,
            imageUrl: `/media/wiki/doc-${nextId}.webp`,
            altText: file.name,
          },
        })
      },
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    const editor = screen.getByRole("region", {
      name: "增强 Markdown 文档编辑器",
    })

    const pasted = new File([new Uint8Array([1, 2, 3])], "paste.webp", {
      type: "image/webp",
    })
    fireEvent.paste(source, { clipboardData: { files: [pasted] } })
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect((uploads[0]?.get("image") as File).name).toBe("paste.webp")
    await waitFor(() =>
      expect(sourceValue()).toContain('::media{asset="doc:81"}')
    )

    const dropped = new File([new Uint8Array([4])], "drop.webp", {
      type: "image/webp",
    })
    fireEvent.drop(editor, { dataTransfer: { files: [dropped] } })
    await waitFor(() => expect(uploads).toHaveLength(2))
    expect((uploads[1]?.get("image") as File).name).toBe("drop.webp")
    await waitFor(() =>
      expect(sourceValue()).toContain('::media{asset="doc:82"}')
    )

    const picked = new File([new Uint8Array([5])], "pick.webp", {
      type: "image/webp",
    })
    await user.upload(screen.getByLabelText("选择图片文件"), picked)
    await waitFor(() => expect(uploads).toHaveLength(3))
    expect((uploads[2]?.get("image") as File).name).toBe("pick.webp")
    await waitFor(() =>
      expect(sourceValue()).toContain('::media{asset="doc:83"}')
    )
  })

  it("saves the draft with the expected revision and overwrites after a 409", async () => {
    const saves: Array<{
      contentMode: string
      sourceMarkdown: string
      expectedRevision: number
    }> = []
    let storedRevision = 5
    const emptyDocument = {
      version: 1,
      headings: [],
      availableTags: [],
      blocks: [],
    }
    installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: "## 保存前\n",
            revision: storedRevision,
          })
        ),
      preview: () =>
        jsonResponse({
          status: "success",
          document: emptyDocument,
          warnings: [],
        }),
      save: (body) => {
        saves.push(body)
        if (body.expectedRevision !== storedRevision) {
          return jsonResponse(
            {
              status: "error",
              msg: "文档已被其他管理员修改，请重新读取后再保存",
              revision: storedRevision,
            },
            409
          )
        }
        storedRevision += 1
        return jsonResponse({
          status: "success",
          contentMode: body.contentMode,
          revision: storedRevision,
          document: emptyDocument,
          warnings: [],
        })
      },
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    await typeAtEnd(user, source, "追加一行")
    await user.click(screen.getByRole("button", { name: "保存文档" }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toMatchObject({
      contentMode: "document",
      expectedRevision: 5,
    })
    expect(saves[0]?.sourceMarkdown).toContain("追加一行")
    expect(await screen.findByText("已保存")).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    // Another maintainer saved meanwhile, so the stored revision moved on.
    storedRevision = 9
    await typeAtEnd(user, source, "冲突前")
    await user.click(screen.getByRole("button", { name: "保存文档" }))
    await waitFor(() => expect(saves).toHaveLength(2))
    const banner = await screen.findByRole("alert")
    expect(banner).toHaveTextContent("已被其他管理员修改")
    expect(banner).toHaveTextContent("r9")
    expect(sourceValue()).toContain("冲突前")

    await user.click(within(banner).getByRole("button", { name: "覆盖保存" }))
    await waitFor(() => expect(saves).toHaveLength(3))
    expect(saves[2]).toMatchObject({
      contentMode: "document",
      expectedRevision: 9,
    })
    expect(saves[2]?.sourceMarkdown).toContain("冲突前")
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    )
  })

  it("reloads the server revision after a conflict and can restore the local draft", async () => {
    let storedRevision = 4
    let storedSource = "## 服务器版本\n"
    installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: storedSource,
            revision: storedRevision,
          })
        ),
      save: () =>
        jsonResponse(
          {
            status: "error",
            msg: "文档已被其他管理员修改，请重新读取后再保存",
            revision: 6,
          },
          409
        ),
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    await typeAtEnd(user, source, "本地草稿")
    await user.click(screen.getByRole("button", { name: "保存文档" }))

    const banner = await screen.findByRole("alert")
    expect(banner).toHaveTextContent("r6")

    storedRevision = 6
    storedSource = "## 服务器版本\n别人追加的一行\n"
    await user.click(
      within(banner).getByRole("button", { name: "重新加载服务器版本" })
    )
    await waitFor(() =>
      expect(sourceValue()).toBe("## 服务器版本\n别人追加的一行\n")
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", { name: "恢复我的草稿" })
    )
    expect(sourceValue()).toBe("## 服务器版本\n本地草稿")
  })

  it("asks before switching to another entry while the draft is unsaved", async () => {
    installWorkbenchFetch({
      catalog: catalogWithSecondIdol(),
      document: (entryId) =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: entryId === 10 ? "## 条目十\n" : "## 条目十一\n",
            revision: 1,
          })
        ),
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    expect(source).toHaveValue("## 条目十\n")
    await typeAtEnd(user, source, "未保存的补充")

    await user.click(screen.getByRole("button", { name: "如月千早" }))
    const guard = await screen.findByRole("alertdialog", {
      name: "放弃未保存的文档草稿？",
    })
    await user.click(
      within(guard).getByRole("button", { name: "留在当前条目" })
    )
    expect(sourceValue()).toBe("## 条目十\n未保存的补充")

    await user.click(screen.getByRole("button", { name: "如月千早" }))
    await user.click(await screen.findByRole("button", { name: "仍然切换" }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "文档源码" })).toHaveValue(
        "## 条目十一\n"
      )
    )
  })

  it("loads a historical revision as a forward-saving draft", async () => {
    const saves: Array<{
      contentMode: string
      sourceMarkdown: string
      expectedRevision: number
    }> = []
    const emptyDocument = {
      version: 1,
      headings: [],
      availableTags: [],
      blocks: [],
    }
    const newestCreatedAt = "2026-11-01T02:03:04.000Z"
    const timestampLabel = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(newestCreatedAt))
    installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: "## 当前版本\n",
            revision: 5,
            revisionsSummary: {
              count: 3,
              latestRevision: 5,
              latestCreatedAt: newestCreatedAt,
            },
          })
        ),
      revisions: () =>
        jsonResponse({
          status: "success",
          revisions: [
            {
              revision: 5,
              summary: "第五版",
              createdBy: "operator",
              createdAt: newestCreatedAt,
            },
            {
              revision: 4,
              summary: "第四版",
              createdBy: "editor-b",
              createdAt: "2026-10-31T02:03:04.000Z",
            },
            {
              revision: 3,
              summary: "第三版",
              createdBy: "operator",
              createdAt: "2026-10-30T02:03:04.000Z",
            },
          ],
        }),
      revision: (_entryId, revision) =>
        jsonResponse({
          status: "success",
          revision,
          summary: `第${revision}版`,
          createdBy: "operator",
          createdAt: "2026-10-30T02:03:04.000Z",
          sourceMarkdown: `## 第${revision}版历史源码\n`,
        }),
      save: (body) => {
        saves.push(body)
        return jsonResponse({
          status: "success",
          contentMode: body.contentMode,
          revision: 6,
          document: emptyDocument,
          warnings: [],
        })
      },
    })
    renderWorkbench()
    const user = userEvent.setup()

    const source = await screen.findByRole("textbox", { name: "文档源码" })
    expect(source).toHaveValue("## 当前版本\n")

    await user.click(screen.getByRole("button", { name: "版本历史" }))
    const drawer = await screen.findByRole("dialog", { name: "版本历史" })
    const rows = within(
      await within(drawer).findByRole("list", { name: "历史版本" })
    ).getAllByRole("listitem")
    // Newest first, with the operator and commit time of each save.
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual([
      "r5",
      "r4",
      "r3",
    ])
    expect(rows[0]).toHaveTextContent("第五版")
    expect(rows[0]).toHaveTextContent("operator")
    expect(rows[0]).toHaveTextContent(timestampLabel)

    await user.click(within(rows[2]!).getByRole("button"))
    await waitFor(() =>
      expect(
        within(drawer).getByLabelText("历史版本源码预览")
      ).toHaveTextContent("## 第3版历史源码")
    )

    await user.click(
      within(drawer).getByRole("button", { name: "载入到编辑器" })
    )
    await waitFor(() => expect(sourceValue()).toBe("## 第3版历史源码\n"))
    expect(await screen.findByText("未保存改动")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "保存文档" }))
    await waitFor(() => expect(saves).toHaveLength(1))
    // Loading history is non-destructive: the draft still saves against the
    // stored revision, so the server writes r6 instead of rewriting r3.
    expect(saves[0]).toMatchObject({
      contentMode: "document",
      expectedRevision: 5,
      sourceMarkdown: "## 第3版历史源码\n",
    })
    expect(await screen.findByText("已保存")).toBeVisible()
  })

  it("persists a switch back to structured mode", async () => {
    const saves: Array<{ contentMode: string }> = []
    installWorkbenchFetch({
      document: () =>
        jsonResponse(
          documentPayload({
            contentMode: "document",
            sourceMarkdown: "## 已发布的文档\n",
            revision: 2,
          })
        ),
      save: (body) => {
        saves.push({ contentMode: body.contentMode })
        return jsonResponse({
          status: "success",
          contentMode: body.contentMode,
          revision: 3,
          document: { version: 1, headings: [], availableTags: [], blocks: [] },
          warnings: [],
        })
      },
    })
    renderWorkbench()
    const user = userEvent.setup()

    await screen.findByRole("textbox", { name: "文档源码" })
    await user.click(screen.getByRole("button", { name: "结构化卡片模式" }))
    expect(screen.getByRole("textbox", { name: "搜索剧情" })).toBeVisible()
    expect(screen.getByText(/当前存档为增强 Markdown 文档模式/)).toBeVisible()

    await user.click(screen.getByRole("button", { name: "保存为结构化模式" }))
    await waitFor(() => expect(saves).toEqual([{ contentMode: "structured" }]))
    expect(
      screen.queryByRole("button", { name: "保存为结构化模式" })
    ).not.toBeInTheDocument()
  })
})
