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
import type { WikiStoryContentType } from "~/lib/api"

const CSRF_TOKEN = "batch-bilibili-test"

const contentTypes: WikiStoryContentType[] = [
  {
    id: 1,
    name: "剧情",
    description: "",
    displayOrder: 0,
    isActive: true,
    revision: 1,
    iconName: "book-open",
  },
  {
    id: 2,
    name: "语音",
    description: "",
    displayOrder: 1,
    isActive: true,
    revision: 1,
    iconName: "mic",
  },
  {
    id: 3,
    name: "电话",
    description: "",
    displayOrder: 2,
    isActive: true,
    revision: 1,
    iconName: "phone",
  },
  {
    id: 4,
    name: "废弃类型",
    description: "",
    displayOrder: 3,
    isActive: false,
    revision: 1,
    iconName: "x",
  },
]

type RecordedBatch = { body: { urls: string[] }; csrf: string | null }

/** Mocks only the batch endpoint; the editor itself renders from props. */
function installBatchFetch(items: unknown[]) {
  const recorded: RecordedBatch[] = []
  installFetchMock((...args) => {
    const request = requestDetails(args)
    const url = new URL(request.url, window.location.origin)
    if (
      request.method.toUpperCase() === "POST" &&
      url.pathname === "/api/admin/wiki/parse-bilibili-batch"
    ) {
      recorded.push({
        body: JSON.parse(String(request.body)) as { urls: string[] },
        csrf: request.headers.get("x-csrftoken"),
      })
      return Promise.resolve(jsonResponse({ status: "success", items }))
    }
    return Promise.reject(new Error(`Unexpected request: ${request.url}`))
  })
  return recorded
}

/**
 * Holds the batch response open so a test can observe the in-flight dialog and
 * then fail the request deterministically.
 */
function installPendingBatchFetch() {
  const recorded: RecordedBatch[] = []
  let failRequest: (() => void) | null = null
  installFetchMock((...args) => {
    const request = requestDetails(args)
    const url = new URL(request.url, window.location.origin)
    if (
      request.method.toUpperCase() === "POST" &&
      url.pathname === "/api/admin/wiki/parse-bilibili-batch"
    ) {
      recorded.push({
        body: JSON.parse(String(request.body)) as { urls: string[] },
        csrf: request.headers.get("x-csrftoken"),
      })
      return new Promise<Response>((_resolve, reject) => {
        failRequest = () => reject(new TypeError("Failed to fetch"))
      })
    }
    return Promise.reject(new Error(`Unexpected request: ${request.url}`))
  })
  return {
    recorded,
    fail: () => {
      if (!failRequest) throw new Error("batch request has not started")
      failRequest()
    },
  }
}

const idlePreview: DocumentPreviewView = {
  requestedSource: null,
  document: null,
  warnings: [],
  loading: false,
  error: null,
  stale: false,
}

/** Real editor over local draft state so caret math stays the production one. */
function EditorHarness({
  initialSource,
  types = contentTypes,
}: {
  initialSource: string
  types?: WikiStoryContentType[]
}) {
  const [source, setSource] = useState(initialSource)
  return (
    <WikiDocumentEditor
      entryName="天海春香"
      source={source}
      onSourceChange={setSource}
      preview={idlePreview}
      categories={[]}
      coverAssets={[]}
      uploading={false}
      uploadError={null}
      onUpload={async () => null}
      dirty={false}
      save={{ saving: false, saved: false, onSave: () => undefined }}
      contentTypes={types}
    />
  )
}

function sourceTextarea() {
  return screen.getByRole("textbox", {
    name: "文档源码",
  }) as HTMLTextAreaElement
}

async function openBatchDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "批量解析 B 站链接" }))
  const dialog = await screen.findByRole("dialog", {
    name: "批量解析 B 站链接",
  })
  return {
    dialog,
    urls: within(dialog).getByRole("textbox", { name: "B 站链接列表" }),
  }
}

describe("Wiki document batch Bilibili macro", () => {
  beforeEach(() => {
    setCsrfCookie("legacy", CSRF_TOKEN)
  })

  it("pastes several URLs and inserts exact link lines at the caret", async () => {
    const recorded = installBatchFetch([
      {
        inputUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        ok: true,
        title: "第一话",
        up: "成功UP",
        stdUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        coverUrl: "https://i0.hdslb.com/bfs/archive/cover.jpg",
      },
      {
        inputUrl: "https://www.bilibili.com/video/BV1yy411c7mE",
        ok: true,
        title: "语音合集",
        up: "语音UP",
        stdUrl: "https://www.bilibili.com/video/BV1yy411c7mE",
        coverUrl: "https://i0.hdslb.com/bfs/archive/voice.webp",
      },
    ])
    const initialSource = "## 观看顺序\n\n开头\n\n结尾\n"
    render(<EditorHarness initialSource={initialSource} />)
    const user = userEvent.setup()

    const textarea = sourceTextarea()
    const caret = initialSource.indexOf("开头") + "开头".length
    textarea.focus()
    textarea.setSelectionRange(caret, caret)

    const { urls } = await openBatchDialog(user)
    await user.click(urls)
    await user.paste(
      "  https://www.bilibili.com/video/BV1xx411c7mD  \n\nhttps://www.bilibili.com/video/BV1yy411c7mE\nhttps://www.bilibili.com/video/BV1xx411c7mD"
    )

    await user.click(screen.getByRole("combobox", { name: "批量解析内容类型" }))
    await user.click(await screen.findByRole("option", { name: "语音" }))
    await user.click(screen.getByRole("button", { name: "解析链接" }))

    expect(await screen.findByText("2 条成功 · 0 条失败")).toBeVisible()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.body).toEqual({
      urls: [
        "https://www.bilibili.com/video/BV1xx411c7mD",
        "https://www.bilibili.com/video/BV1yy411c7mE",
      ],
    })
    expect(recorded[0]?.csrf).toBe(CSRF_TOKEN)

    await user.click(screen.getByRole("button", { name: "插入 2 条链接" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "批量解析 B 站链接" })
      ).not.toBeInTheDocument()
    )
    const expectedValue = [
      "## 观看顺序",
      "",
      "开头",
      "",
      "- [语音｜Bilibili｜成功UP](https://www.bilibili.com/video/BV1xx411c7mD) 第一话",
      "- [语音｜Bilibili｜语音UP](https://www.bilibili.com/video/BV1yy411c7mE) 语音合集",
      "",
      "结尾",
      "",
    ].join("\n")
    const inserted = sourceTextarea()
    expect(inserted.value).toBe(expectedValue)
    // The caret sits right after the inserted block, before the trailing text.
    expect(inserted.selectionStart).toBe(inserted.value.indexOf("\n\n结尾"))
    expect(document.activeElement).toBe(inserted)
  })

  it("keeps a failed link visible in the dialog and wraps inserts in a :::links block", async () => {
    installBatchFetch([
      {
        inputUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        ok: true,
        title: "标题](陷阱",
        up: "A]B|C",
        stdUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        coverUrl: "https://i0.hdslb.com/bfs/archive/cover.jpg",
      },
      {
        inputUrl: "https://www.bilibili.com/video/BV1zz411c7mF",
        ok: false,
        error: "啥都木有",
      },
    ])
    render(<EditorHarness initialSource="" />)
    const user = userEvent.setup()

    const { dialog, urls } = await openBatchDialog(user)
    await user.click(urls)
    await user.paste(
      "https://www.bilibili.com/video/BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1zz411c7mF"
    )
    await user.click(screen.getByRole("button", { name: "解析链接" }))

    expect(await screen.findByText("1 条成功 · 1 条失败")).toBeVisible()
    expect(dialog).toHaveTextContent(
      "https://www.bilibili.com/video/BV1zz411c7mF"
    )
    expect(dialog).toHaveTextContent("啥都木有")

    const wrapper = screen.getByRole("group", { name: "输出包装" })
    await user.click(
      within(wrapper).getByRole("button", { name: ":::links 块" })
    )
    await user.click(screen.getByRole("button", { name: "插入 1 条链接" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "批量解析 B 站链接" })
      ).not.toBeInTheDocument()
    )
    expect(sourceTextarea().value).toBe(
      [
        ":::links",
        "- [剧情｜Bilibili｜A\\]B｜C](https://www.bilibili.com/video/BV1xx411c7mD) 标题]\\(陷阱",
        ":::",
      ].join("\n")
    )
  })

  it("defaults to 剧情 and offers only active catalog types", async () => {
    installBatchFetch([])
    render(<EditorHarness initialSource="" />)
    const user = userEvent.setup()

    const { urls } = await openBatchDialog(user)
    expect(urls).toBeVisible()
    const combobox = screen.getByRole("combobox", { name: "批量解析内容类型" })
    expect(combobox).toHaveTextContent("剧情")

    await user.click(combobox)
    expect(await screen.findByRole("option", { name: "语音" })).toBeVisible()
    expect(screen.getByRole("option", { name: "电话" })).toBeVisible()
    expect(
      screen.queryByRole("option", { name: "废弃类型" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("option", { name: "电话" }))
    expect(combobox).toHaveTextContent("电话")
  })

  it("locks the dialog while parsing and recovers after a request failure", async () => {
    const pending = installPendingBatchFetch()
    render(<EditorHarness initialSource="" />)
    const user = userEvent.setup()

    const { dialog, urls } = await openBatchDialog(user)
    await user.click(urls)
    await user.paste("https://www.bilibili.com/video/BV1xx411c7mD")
    await user.click(within(dialog).getByRole("button", { name: "解析链接" }))

    const parsing = await within(dialog).findByRole("button", {
      name: "解析中…",
    })
    expect(parsing).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "插入链接" })
    ).toBeDisabled()
    expect(pending.recorded).toHaveLength(1)

    pending.fail()

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("批量解析失败")
    expect(alert).toHaveTextContent("网络请求失败")
    const retry = await within(dialog).findByRole("button", {
      name: "解析链接",
    })
    expect(retry).toBeEnabled()
    expect(within(dialog).queryByText(/条成功/)).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "插入链接" })
    ).toBeDisabled()
  })

  it("refuses more than twenty links without calling the API", async () => {
    const recorded = installBatchFetch([])
    render(<EditorHarness initialSource="" />)
    const user = userEvent.setup()

    const { dialog, urls } = await openBatchDialog(user)
    await user.click(urls)
    await user.paste(
      Array.from(
        { length: 21 },
        (_, index) =>
          `https://www.bilibili.com/video/BV1${String(index).padStart(9, "0")}`
      ).join("\n")
    )

    expect(await within(dialog).findByText("链接过多")).toBeVisible()
    expect(dialog).toHaveTextContent("一次最多解析 20 条链接，请拆分后再试。")
    const parse = within(dialog).getByRole("button", { name: "解析链接" })
    expect(parse).toBeDisabled()
    await user.click(parse)
    expect(recorded).toHaveLength(0)
  })

  it("counts server successes even when a success carries no canonical URL", async () => {
    installBatchFetch([
      {
        inputUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        ok: true,
        title: "第一话",
        up: "UP甲",
        stdUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
      },
      {
        inputUrl: "https://www.bilibili.com/video/BV1yy411c7mE",
        ok: true,
        title: "无规范链接",
        up: "UP乙",
      },
      {
        inputUrl: "https://www.bilibili.com/video/BV1zz411c7mF",
        ok: false,
        error: "啥都木有",
      },
    ])
    render(<EditorHarness initialSource="" />)
    const user = userEvent.setup()

    const { dialog, urls } = await openBatchDialog(user)
    await user.click(urls)
    await user.paste(
      [
        "https://www.bilibili.com/video/BV1xx411c7mD",
        "https://www.bilibili.com/video/BV1yy411c7mE",
        "https://www.bilibili.com/video/BV1zz411c7mF",
      ].join("\n")
    )
    await user.click(within(dialog).getByRole("button", { name: "解析链接" }))

    expect(await within(dialog).findByText("2 条成功 · 1 条失败")).toBeVisible()
    expect(
      within(dialog).getByRole("button", { name: "插入 1 条链接" })
    ).toBeEnabled()
  })
})
