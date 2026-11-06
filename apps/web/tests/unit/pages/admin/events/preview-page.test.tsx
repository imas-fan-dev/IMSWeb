import { screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeEditorialArticle } from "@/mocks/data/editorial"
import { renderPage as renderHarnessPage } from "@/tests/unit/support/harness"
import AdminEventPreviewPage from "~/pages/admin/events/preview-page"

const mocks = vi.hoisted(() => ({ useRequest: vi.fn() }))

vi.mock("alova/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("alova/client")>()),
  useRequest: mocks.useRequest,
}))

function renderPage() {
  const props = {
    params: { eventId: "43" },
  } as ComponentProps<typeof AdminEventPreviewPage>
  return renderHarnessPage(
    <AdminEventPreviewPage {...props} />,
    { route: "/admin/events/43/preview" }
  )
}

describe("AdminEventPreviewPage", () => {
  beforeEach(() => mocks.useRequest.mockReset())

  it("shows a loading state while reading the saved draft", () => {
    mocks.useRequest.mockReturnValue({ data: null, loading: true, error: null })
    renderPage()

    expect(screen.getByText(/展示最近一次保存的文章内容/)).toBeVisible()
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
  })

  it("explains when the backoffice article cannot be read", () => {
    mocks.useRequest.mockReturnValue({
      data: null,
      loading: false,
      error: new Error("unauthorized"),
    })
    renderPage()

    expect(screen.getByText("无法读取文章预览")).toBeVisible()
  })

  it("shows a missing-record state", () => {
    mocks.useRequest.mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })
    renderPage()

    expect(screen.getByText("未找到文章")).toBeVisible()
  })

  it("renders a saved draft with the public detail presentation", () => {
    mocks.useRequest.mockReturnValue({
      data: makeEditorialArticle({
        id: 43,
        title: "草稿文章预览",
        status: "draft",
        body_html: "<p>已保存的正文</p>",
      }),
      loading: false,
      error: null,
    })
    renderPage()

    expect(screen.getByRole("heading", { name: "草稿文章预览" })).toBeVisible()
    expect(screen.getByText("已保存的正文")).toBeVisible()
    expect(screen.getByRole("link", { name: "返回社区动态" })).toBeVisible()
  })
})
