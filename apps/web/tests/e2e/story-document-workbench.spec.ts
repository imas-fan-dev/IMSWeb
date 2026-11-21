import type { Page, Route } from "@playwright/test"
import type {
  WikiAdminCatalog,
  WikiAdminStories,
  WikiPublicStories,
  WikiPublicStoryCard,
  WikiPublicStoryDocument,
} from "@imsweb/contracts/wiki"

import { api, expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const imageTransform = {
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
} as const

const agency = {
  id: 6,
  code: "sc",
  name: "闪耀色彩",
  color: "#8dbbff",
  wikiEnabled: true,
  bannerTitle: "闪耀色彩",
  displayOrder: 0,
  layoutRevision: 0,
  iconUrl: null,
  imageTransform,
  mediaRevision: 0,
  idols: [
    {
      id: 6,
      agencyId: 6,
      name: "樱木真乃",
      folderName: "sakuragi_mano",
      color: "#f1b0c9",
      wikiUrl: null,
      textColor: "#ffffff",
      displayOrder: 0,
      imageUrl: "/brand/series/wall/shiny-colors.webp",
      imageFit: "cover",
      imageTransform,
      mediaRevision: 0,
      wikiEnabled: true,
      groupIds: [],
      entryKind: "idol",
      entrySubtype: null,
    },
  ],
  groups: [],
} satisfies WikiAdminCatalog["agencies"][number]

const adminCatalog = {
  status: "success",
  agencies: [agency],
} satisfies WikiAdminCatalog

const publicCard: WikiPublicStoryCard = {
  id: 401,
  name: "【第一话】",
  img: "/brand/imsweb-logo.webp",
  subtitle: "开场",
  imageTransform,
  links: [],
}

const adminStories = {
  status: "success",
  agency: { id: 6, code: "sc", name: "闪耀色彩", color: "#8dbbff" },
  idol: {
    id: 6,
    agencyId: 6,
    name: "樱木真乃",
    folderName: "sakuragi_mano",
    color: "#f1b0c9",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "/brand/series/wall/shiny-colors.webp",
    imageFit: "cover",
    imageTransform,
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
      revision: 3,
    },
  ],
  contentTypes: [],
  sourcePlatforms: [],
  cards: [
    {
      cardId: 401,
      category: "主线",
      cardName: "【第一话】",
      subtitle: "开场",
      imageFile: null,
      imageUrl: "/brand/imsweb-logo.webp",
      imageTransform,
      mediaRevision: 2,
      revision: 2,
    },
  ],
  stories: [],
} satisfies WikiAdminStories

const coverAssets = {
  status: "success",
  agency: { id: 6, code: "sc", name: "闪耀色彩" },
  assets: [
    {
      id: 12,
      agencyId: 6,
      name: "通用主线封面",
      imageUrl: "/brand/imsweb-logo.webp",
      presentationPolicy: "contain",
      displayOrder: 0,
      isActive: true,
      revision: 0,
      usageCount: 0,
    },
  ],
}

const markdown = [
  "## 观看顺序",
  "",
  "先看第一话。",
  "",
  '::story-category{name="主线"}',
  "",
  '::story-category{name="活动"}',
  "",
].join("\n")

/** What the API compiler returns for `markdown`; the preview pane must show it. */
const compiledDocument: WikiPublicStoryDocument = {
  version: 1,
  headings: [{ id: "观看顺序", level: 2, text: "观看顺序" }],
  availableTags: [],
  blocks: [
    {
      type: "heading",
      level: 2,
      id: "观看顺序",
      children: [{ type: "text", value: "观看顺序" }],
    },
    {
      type: "paragraph",
      children: [{ type: "text", value: "先看第一话。" }],
    },
    { type: "storyCategory", categoryName: "主线", collapsed: false },
    { type: "storyCategory", categoryName: "活动", collapsed: false },
    {
      type: "media",
      asset: { kind: "cover", id: 12 },
      caption: "通用主线封面",
      fit: "contain",
      imageUrl: "/brand/imsweb-logo.webp",
      presentationPolicy: "contain",
    },
    {
      type: "media",
      asset: { kind: "doc", id: 88 },
      caption: "上传的截图",
      fit: "cover",
      imageUrl: "/brand/imsweb-logo.webp",
      presentationPolicy: "inherit",
    },
  ],
}

const publicStories = {
  status: "success",
  agency: { id: 6, code: "sc", name: "闪耀色彩", color: "#8dbbff" },
  idol: {
    id: 6,
    name: "樱木真乃",
    folderName: "sakuragi_mano",
    color: "#f1b0c9",
    wikiUrl: null,
    imageUrl: "/brand/series/wall/shiny-colors.webp",
    imageFit: "cover",
    textColor: "#ffffff",
    entryKind: "idol",
    entrySubtype: null,
    imageTransform,
  },
  contentMode: "document",
  document: compiledDocument,
  categories: [{ name: "主线", cards: [publicCard] }],
} satisfies WikiPublicStories

function entryDocument(input: {
  contentMode?: "structured" | "document"
  sourceMarkdown?: string
  revision?: number
}) {
  return {
    status: "success",
    entry: {
      id: 6,
      projectId: 6,
      projectCode: "sc",
      projectName: "闪耀色彩",
      name: "樱木真乃",
      folderName: "sakuragi_mano",
      entryKind: "idol",
    },
    contentMode: input.contentMode ?? "structured",
    sourceMarkdown: input.sourceMarkdown ?? "",
    revision: input.revision ?? 3,
    document: { version: 1, headings: [], availableTags: [], blocks: [] },
    warnings: [],
    media: [],
    revisionsSummary: { count: 0, latestRevision: null, latestCreatedAt: null },
  }
}

async function installWorkbenchMocks(
  page: Page,
  input: {
    onSave: (route: Route, body: unknown) => Promise<void> | void
    onPreview?: (route: Route, body: unknown) => Promise<void> | void
    onUpload?: (route: Route) => Promise<void> | void
    contentMode?: "structured" | "document"
    sourceMarkdown?: string
    revision?: number
  }
) {
  await installAdminAuthMock(page, api, {
    user: { username: "document-workbench-qa", producername: "文档工作台" },
    sessionTimes: { min: 1, max: 8 },
  })
  api.mockRoute(
    "**/api/admin/wiki/catalog",
    (route) => route.fulfill({ status: 200, json: adminCatalog }),
    "GET",
    { min: 1, max: 6 }
  )
  api.mockRoute(
    "**/api/admin/wiki/story-source-catalog",
    (route) =>
      route.fulfill({
        status: 200,
        json: { status: "success", contentTypes: [], sourcePlatforms: [] },
      }),
    "GET",
    { min: 1, max: 6 }
  )
  api.mockRoute(
    "**/api/admin/wiki/agencies/6/story-cover-assets",
    (route) => route.fulfill({ status: 200, json: coverAssets }),
    "GET",
    { min: 1, max: 6 }
  )
  api.mockRoute(
    "**/api/admin/wiki/stories?**",
    (route) => route.fulfill({ status: 200, json: adminStories }),
    "GET",
    { min: 1, max: 6 }
  )
  api.mockRoute(
    "**/api/admin/wiki/entries/6/document",
    (route) =>
      route.fulfill({
        status: 200,
        json: entryDocument({
          contentMode: input.contentMode ?? "document",
          sourceMarkdown: input.sourceMarkdown ?? "",
          revision: input.revision ?? 3,
        }),
      }),
    "GET",
    { min: 1, max: 6 }
  )
  api.mockRoute(
    "**/api/admin/wiki/entries/6/document/preview",
    async (route) => {
      const body = await route.request().postDataJSON()
      await input.onPreview?.(route, body)
      await route.fulfill({
        status: 200,
        json: {
          status: "success",
          document: compiledDocument,
          warnings: [
            {
              line: 7,
              code: "unknown-category",
              message: "内容页没有分类「活动」",
            },
          ],
        },
      })
    },
    "POST",
    { min: 0, max: 4 }
  )
  api.mockRoute(
    "**/api/admin/wiki/entries/6/document/media",
    async (route) => {
      await input.onUpload?.(route)
      await route.fulfill({
        status: 200,
        json: {
          status: "success",
          media: {
            id: 88,
            imageUrl: "/brand/imsweb-logo.webp",
            altText: "upload.webp",
          },
        },
      })
    },
    "POST",
    { min: 0, max: 3 }
  )
  api.mockRoute(
    "**/api/admin/wiki/entries/6/document",
    async (route) => {
      await input.onSave(route, await route.request().postDataJSON())
    },
    "PUT",
    { min: 0, max: 4 }
  )
}

test.describe("wiki document workbench", () => {
  test("edits a document entry and renders it on both public story pages", async ({
    page,
  }) => {
    const saves: Array<{
      contentMode: string
      sourceMarkdown: string
      expectedRevision: number
    }> = []
    const previews: Array<{ sourceMarkdown: string }> = []
    const uploads: string[] = []
    await installWorkbenchMocks(page, {
      contentMode: "structured",
      sourceMarkdown: "",
      onPreview: (_route, body) => {
        previews.push(body as { sourceMarkdown: string })
      },
      onSave: async (route, body) => {
        saves.push(body as (typeof saves)[number])
        await route.fulfill({
          status: 200,
          json: {
            status: "success",
            contentMode: "document",
            revision: 4,
            document: compiledDocument,
            warnings: [],
          },
        })
      },
      onUpload: (route) => {
        uploads.push(route.request().postData() ?? "")
      },
    })

    await page.goto("/admin/stories?agencyId=6&idolId=6")

    const modeSwitch = page.getByRole("group", { name: "内容页编辑模式" })
    await expect(modeSwitch).toBeVisible()
    await expect(
      page.getByRole("button", { name: "结构化卡片模式" })
    ).toHaveAttribute("aria-pressed", "true")

    await page.getByRole("button", { name: "增强 Markdown 文档模式" }).click()
    const source = page.getByLabel("文档源码", { exact: true })
    await expect(source).toBeVisible()

    // Typing is debounced into exactly one server compile.
    await source.click()
    await source.pressSequentially(markdown, { delay: 10 })
    const previewPane = page.getByLabel("文档预览")
    await expect(
      previewPane.getByRole("heading", { name: "观看顺序" })
    ).toBeVisible()
    expect(previews).toHaveLength(1)

    // Embedded structured category and shared cover resolve in the preview.
    await expect(previewPane.getByText("嵌入分类「主线」")).toBeVisible()
    await expect(
      previewPane.getByRole("img", { name: "通用主线封面" })
    ).toBeVisible()

    // A warning row jumps the caret to its source line.
    const warningRow = page.getByRole("button", { name: /第 7 行/ })
    await expect(warningRow).toContainText("内容页没有分类「活动」")
    await warningRow.click()
    const lineOffset = markdown.split("\n").slice(0, 6).join("\n").length + 1
    await expect
      .poll(() =>
        source.evaluate(
          (element) => (element as HTMLTextAreaElement).selectionStart
        )
      )
      .toBe(lineOffset)

    // Uploading through the file picker inserts a `doc:<id>` media directive.
    await page.getByLabel("选择图片文件").setInputFiles({
      name: "upload.webp",
      mimeType: "image/webp",
      buffer: Buffer.from([1, 2, 3]),
    })
    await expect(source).toHaveValue(/::media\{asset="doc:88"\}/)
    expect(
      uploads.some((body) => body.includes('filename="upload.webp"'))
    ).toBe(true)

    // Saving sends the optimistic lock plus the working draft.
    await page.getByRole("button", { name: "保存文档" }).click()
    await expect(page.getByText("已保存")).toBeVisible()
    expect(saves).toHaveLength(1)
    expect(saves[0]?.contentMode).toBe("document")
    expect(saves[0]?.expectedRevision).toBe(3)
    expect(saves[0]?.sourceMarkdown).toContain('::story-category{name="主线"}')
    expect(saves[0]?.sourceMarkdown).toContain('::media{asset="doc:88"}')

    // The saved document renders on the Modern public page.
    installEmptyWikiCatalogMock(api, { min: 0, max: 4 })
    api.mockRoute(
      "**/api/wiki/stories?**",
      (route) => route.fulfill({ status: 200, json: publicStories }),
      "GET",
      { min: 2, max: 4 }
    )

    await page.goto(
      `/story?agency=${encodeURIComponent("闪耀色彩")}&idol=${encodeURIComponent("樱木真乃")}`
    )
    await expect(page.getByRole("heading", { name: "观看顺序" })).toBeVisible()
    await expect(page.getByText("先看第一话。")).toBeVisible()
    await expect(page.getByText("【第一话】")).toBeVisible()
    const modernCover = page.getByRole("img", { name: "通用主线封面" })
    await expect(modernCover).toBeVisible()
    await expect
      .poll(() =>
        modernCover.evaluate(
          (image) => (image as HTMLImageElement).naturalWidth
        )
      )
      .toBeGreaterThan(0)
    const modernUpload = page.getByRole("img", { name: "上传的截图" })
    await expect(modernUpload).toBeVisible()
    await expect
      .poll(() =>
        modernUpload.evaluate(
          (image) => (image as HTMLImageElement).naturalWidth
        )
      )
      .toBeGreaterThan(0)

    // ... and on the Classic public page, with the restored public cache
    // cleared so the classic render proves its own request.
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
    await page.goto(
      `/story/classic?agency=${encodeURIComponent("闪耀色彩")}&idol=${encodeURIComponent("樱木真乃")}`
    )
    await expect(page.getByRole("heading", { name: "观看顺序" })).toBeVisible()
    await expect(page.getByText("【第一话】")).toBeVisible()
    await expect(page.getByRole("img", { name: "通用主线封面" })).toBeVisible()
    await expect(page.getByRole("img", { name: "上传的截图" })).toBeVisible()
  })

  test("creates a document page for an entry that never had one and publishes it", async ({
    page,
  }) => {
    const saves: Array<{
      contentMode: string
      sourceMarkdown: string
      expectedRevision: number
    }> = []
    const createdDocument: WikiPublicStoryDocument = {
      version: 1,
      headings: [{ id: "新建导览", level: 2, text: "新建导览" }],
      availableTags: [],
      blocks: [
        {
          type: "heading",
          level: 2,
          id: "新建导览",
          children: [{ type: "text", value: "新建导览" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "首次发布的文档。" }],
        },
        { type: "storyCategory", categoryName: "主线", collapsed: false },
        {
          type: "media",
          asset: { kind: "doc", id: 88 },
          caption: "上传的截图",
          fit: "cover",
          imageUrl: "/brand/imsweb-logo.webp",
          presentationPolicy: "inherit",
        },
      ],
    }
    await installWorkbenchMocks(page, {
      // A freshly created entry: no stored document, revision 0.
      contentMode: "structured",
      sourceMarkdown: "",
      revision: 0,
      onSave: async (route, body) => {
        saves.push(body as (typeof saves)[number])
        await route.fulfill({
          status: 200,
          json: {
            status: "success",
            contentMode: "document",
            revision: 1,
            document: createdDocument,
            warnings: [],
          },
        })
      },
    })

    await page.goto("/admin/stories?agencyId=6&idolId=6")
    await expect(
      page.getByRole("button", { name: "结构化卡片模式" })
    ).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "增强 Markdown 文档模式" }).click()

    const source = page.getByLabel("文档源码", { exact: true })
    await expect(source).toHaveValue("")
    await source.click()
    await source.pressSequentially("## 新建导览\n\n首次发布的文档。\n", {
      delay: 10,
    })
    await page.getByLabel("选择图片文件").setInputFiles({
      name: "created.webp",
      mimeType: "image/webp",
      buffer: Buffer.from([1, 2, 3]),
    })
    await expect(source).toHaveValue(/::media\{asset="doc:88"\}/)

    await page.getByRole("button", { name: "保存文档" }).click()
    await expect(page.getByText("已保存")).toBeVisible()
    expect(saves).toHaveLength(1)
    expect(saves[0]?.expectedRevision).toBe(0)
    expect(saves[0]?.contentMode).toBe("document")
    expect(saves[0]?.sourceMarkdown).toContain("## 新建导览")

    // The compiled document the save produced is what the public pages serve.
    installEmptyWikiCatalogMock(api, { min: 0, max: 4 })
    api.mockRoute(
      "**/api/wiki/stories?**",
      (route) =>
        route.fulfill({
          status: 200,
          json: { ...publicStories, document: createdDocument },
        }),
      "GET",
      { min: 2, max: 4 }
    )

    await page.goto(
      `/story?agency=${encodeURIComponent("闪耀色彩")}&idol=${encodeURIComponent("樱木真乃")}`
    )
    await expect(page.getByRole("heading", { name: "新建导览" })).toBeVisible()
    await expect(page.getByText("首次发布的文档。")).toBeVisible()
    await expect(page.getByText("【第一话】")).toBeVisible()
    await expect(page.getByRole("img", { name: "上传的截图" })).toBeVisible()

    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
    await page.goto(
      `/story/classic?agency=${encodeURIComponent("闪耀色彩")}&idol=${encodeURIComponent("樱木真乃")}`
    )
    await expect(page.getByRole("heading", { name: "新建导览" })).toBeVisible()
    await expect(page.getByRole("img", { name: "上传的截图" })).toBeVisible()
  })

  test("keeps the draft and offers recovery when saving conflicts", async ({
    page,
  }) => {
    await installWorkbenchMocks(page, {
      contentMode: "document",
      sourceMarkdown: "## 旧版本\n",
      onSave: async (route) => {
        await route.fulfill({
          status: 409,
          json: {
            status: "error",
            msg: "文档已被其他管理员修改，请重新读取后再保存",
            revision: 9,
          },
        })
      },
    })

    await page.goto("/admin/stories?agencyId=6&idolId=6")
    const source = page.getByLabel("文档源码", { exact: true })
    await expect(source).toHaveValue("## 旧版本\n")

    await source.click()
    await source.pressSequentially("本地新增内容")
    await page.getByRole("button", { name: "保存文档" }).click()

    const banner = page.getByRole("alert")
    await expect(banner).toContainText("文档已被其他管理员修改")
    await expect(banner).toContainText("r9")
    await expect(source).toHaveValue(/本地新增内容/)
    await expect(
      banner.getByRole("button", { name: "重新加载服务器版本" })
    ).toBeVisible()
    await expect(banner.getByRole("button", { name: "覆盖保存" })).toBeVisible()
  })

  test("collapses the split pane into switchable tabs on a narrow viewport @mobile", async ({
    page,
  }) => {
    await installWorkbenchMocks(page, {
      contentMode: "document",
      sourceMarkdown: "## 观看顺序\n",
      onSave: async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            status: "success",
            contentMode: "document",
            revision: 4,
            document: compiledDocument,
            warnings: [],
          },
        })
      },
    })

    await page.setViewportSize({ width: 420, height: 900 })
    await page.goto("/admin/stories?agencyId=6&idolId=6")
    const viewSwitcher = page.getByRole("group", { name: "切换编辑视图" })
    await expect(viewSwitcher).toBeVisible()
    await expect(page.getByLabel("源码面板")).toBeVisible()
    await expect(page.getByLabel("文档预览")).toBeHidden()

    await viewSwitcher.getByRole("button", { name: "预览" }).click()
    await expect(page.getByLabel("源码面板")).toBeHidden()
    await expect(page.getByLabel("文档预览")).toBeVisible()

    await viewSwitcher.getByRole("button", { name: "源码" }).click()
    await expect(page.getByLabel("源码面板")).toBeVisible()

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(hasHorizontalOverflow).toBe(false)
  })
})
