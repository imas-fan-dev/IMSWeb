import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  jsonResponse,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { WikiDocumentEditor } from "~/pages/admin/stories/components/wiki-document-editor"
import type { DocumentPreviewView } from "~/pages/admin/stories/components/wiki-document-hooks"

const CSRF_TOKEN = "structured-export-test"

const DRAFT_MARKDOWN = [
  ':::card-grid{title="S卡" layout="grid" filter="tags"}',
  ':::card{id="11519" title="【【初】有村麻央】" tags="千奈,广" asset="cover:12"}',
  ":::",
  ":::",
].join("\n")

const STRIPPED_MARKDOWN = [
  ':::card-grid{title="S卡" layout="grid"}',
  ':::card{id="11519" title="初】有村麻央" asset="cover:12"}',
  ":::",
  ":::",
].join("\n")

type RecordedExport = {
  body: { stripBrackets?: boolean; collapseThreshold?: number }
  csrf: string | null
}

/** Mocks only the export endpoint; the editor itself renders from props. */
function installExportFetch() {
  const recorded: RecordedExport[] = []
  installFetchMock((...args) => {
    const request = requestDetails(args)
    const url = new URL(request.url, window.location.origin)
    if (
      request.method.toUpperCase() === "POST" &&
      url.pathname === "/api/admin/wiki/entries/1/document/export-structured"
    ) {
      const body = JSON.parse(String(request.body)) as RecordedExport["body"]
      recorded.push({ body, csrf: request.headers.get("x-csrftoken") })
      return Promise.resolve(
        jsonResponse({
          status: "success",
          markdown: body.stripBrackets ? STRIPPED_MARKDOWN : DRAFT_MARKDOWN,
          stats: {
            categories: 1,
            cards: 1,
            links: 0,
            collapsedCategories: 0,
          },
          lintWarnings: [
            {
              code: "placeholder-subtitle",
              context: "S卡 / 【【初】有村麻央】",
              message: "副标题只是占位符「#」，草稿中已省略",
            },
            {
              code: "near-duplicate-category",
              context: "节日/生日",
              message:
                "分类名「节日/生日」与「节日_生日」只差分隔符，导出后会出现两个近似重复的区块",
            },
          ],
        })
      )
    }
    return Promise.reject(new Error(`Unexpected request: ${request.url}`))
  })
  return recorded
}

/**
 * A mock whose export request stays in flight until the test settles it, so the
 * loading state is observable instead of racing the response.
 */
function installPendingExportFetch() {
  let resolveRequest: ((response: Response) => void) | null = null
  let rejectRequest: (() => void) | null = null
  installFetchMock((...args) => {
    const request = requestDetails(args)
    const url = new URL(request.url, window.location.origin)
    if (
      url.pathname === "/api/admin/wiki/entries/1/document/export-structured"
    ) {
      return new Promise<Response>((resolve, reject) => {
        resolveRequest = resolve
        rejectRequest = () => reject(new Error("network down"))
      })
    }
    return Promise.reject(new Error(`Unexpected request: ${request.url}`))
  })
  return {
    succeed: (payload: unknown) => resolveRequest?.(jsonResponse(payload)),
    fail: () => rejectRequest?.(),
  }
}

const DRAFT_RESPONSE = {
  status: "success",
  markdown: DRAFT_MARKDOWN,
  stats: { categories: 1, cards: 1, links: 0, collapsedCategories: 0 },
  lintWarnings: [],
}

const idlePreview: DocumentPreviewView = {
  requestedSource: null,
  document: null,
  warnings: [],
  loading: false,
  error: null,
  stale: false,
}

/** Real editor over local draft state so the insert/replace path stays real. */
function EditorHarness({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource)
  return (
    <WikiDocumentEditor
      entryId={1}
      entryName="花海咲季"
      source={source}
      onSourceChange={setSource}
      onReplaceSource={setSource}
      preview={idlePreview}
      categories={[]}
      coverAssets={[]}
      uploading={false}
      uploadError={null}
      onUpload={async () => null}
      dirty={false}
      save={{ saving: false, saved: false, onSave: () => undefined }}
      contentTypes={[]}
    />
  )
}

function sourceTextarea() {
  return screen.getByRole("textbox", {
    name: "文档源码",
  }) as HTMLTextAreaElement
}

async function openExportDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /从结构化卡片生成草稿/u })
  )
  const dialog = await screen.findByRole("dialog", {
    name: "从结构化卡片生成草稿",
  })
  await within(dialog).findByRole("textbox", { name: "生成的草稿" })
  return dialog
}

describe("structured card export draft", () => {
  beforeEach(() => {
    setCsrfCookie("legacy", CSRF_TOKEN)
  })

  it("generates a draft, shows lint rows, and inserts it at the caret", async () => {
    const recorded = installExportFetch()
    const user = userEvent.setup()
    render(<EditorHarness initialSource={"先说结论。\n"} />)

    const dialog = await openExportDialog(user)

    // The request is the documented read-only call with the default options.
    expect(recorded).toEqual([
      {
        body: { stripBrackets: false, collapseThreshold: 24 },
        csrf: CSRF_TOKEN,
      },
    ])
    expect(
      within(dialog).getByText("1 个分类 · 1 张卡片 · 0 条来源")
    ).toBeTruthy()
    const lintRows = within(dialog).getByRole("list", {
      name: "数据卫生提醒",
    })
    expect(within(lintRows).getAllByRole("listitem")).toHaveLength(2)
    expect(
      within(lintRows).getByText(/副标题只是占位符「#」，草稿中已省略/u)
    ).toBeTruthy()
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "生成的草稿",
        }) as HTMLTextAreaElement
      ).value
    ).toBe(DRAFT_MARKDOWN)

    await user.click(
      within(dialog).getByRole("button", { name: "插入到光标处" })
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(sourceTextarea().value).toBe(`${DRAFT_MARKDOWN}\n\n先说结论。\n`)
    // Nothing is saved: the only request was the read-only export.
    expect(recorded).toHaveLength(1)
  })

  it("replaces the whole draft and re-requests when brackets are stripped", async () => {
    const recorded = installExportFetch()
    const user = userEvent.setup()
    render(<EditorHarness initialSource={"旧草稿，应当被替换。\n"} />)

    const dialog = await openExportDialog(user)
    await user.click(
      within(dialog).getByRole("checkbox", { name: "去除卡名外层【】" })
    )

    await waitFor(() => {
      expect(recorded).toHaveLength(2)
    })
    expect(recorded[1]).toEqual({
      body: { stripBrackets: true, collapseThreshold: 24 },
      csrf: CSRF_TOKEN,
    })
    await waitFor(() => {
      expect(
        (
          within(dialog).getByRole("textbox", {
            name: "生成的草稿",
          }) as HTMLTextAreaElement
        ).value
      ).toBe(STRIPPED_MARKDOWN)
    })

    await user.click(
      within(dialog).getByRole("button", { name: "替换编辑器草稿" })
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(sourceTextarea().value).toBe(STRIPPED_MARKDOWN)
    expect(recorded).toHaveLength(2)
  })

  it("shows the loading state and keeps both draft actions disabled", async () => {
    const pending = installPendingExportFetch()
    const user = userEvent.setup()
    render(<EditorHarness initialSource={"未改动。\n"} />)

    await user.click(
      screen.getByRole("button", { name: /从结构化卡片生成草稿/u })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "从结构化卡片生成草稿",
    })

    expect(within(dialog).getByText("正在生成草稿…")).toBeTruthy()
    expect(
      within(dialog).getByRole("button", { name: "插入到光标处" })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "替换编辑器草稿" })
    ).toBeDisabled()

    pending.succeed(DRAFT_RESPONSE)

    await waitFor(() => {
      expect(within(dialog).queryByText("正在生成草稿…")).toBeNull()
    })
    expect(
      within(dialog).getByRole("button", { name: "插入到光标处" })
    ).toBeEnabled()
    expect(
      within(dialog).getByRole("button", { name: "替换编辑器草稿" })
    ).toBeEnabled()
  })

  it("reports a generation failure without touching the draft", async () => {
    const pending = installPendingExportFetch()
    const user = userEvent.setup()
    render(<EditorHarness initialSource={"未改动。\n"} />)

    await user.click(
      screen.getByRole("button", { name: /从结构化卡片生成草稿/u })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "从结构化卡片生成草稿",
    })

    pending.fail()

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("生成失败")
    expect(alert).toHaveTextContent("网络请求失败")
    expect(
      within(dialog).queryByRole("textbox", { name: "生成的草稿" })
    ).toBeNull()
    expect(
      within(dialog).getByRole("button", { name: "插入到光标处" })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "替换编辑器草稿" })
    ).toBeDisabled()

    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(sourceTextarea().value).toBe("未改动。\n")
  })

  it("says so when the data hygiene list is empty", async () => {
    const pending = installPendingExportFetch()
    const user = userEvent.setup()
    render(<EditorHarness initialSource={"未改动。\n"} />)

    await user.click(
      screen.getByRole("button", { name: /从结构化卡片生成草稿/u })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "从结构化卡片生成草稿",
    })
    pending.succeed(DRAFT_RESPONSE)

    await within(dialog).findByRole("textbox", { name: "生成的草稿" })
    expect(
      within(dialog).getByText("未发现需要人工处理的数据问题。")
    ).toBeTruthy()
    expect(
      within(dialog).queryByRole("list", { name: "数据卫生提醒" })
    ).toBeNull()
    expect(within(dialog).getByText("数据卫生提醒")).toBeTruthy()
  })
})
