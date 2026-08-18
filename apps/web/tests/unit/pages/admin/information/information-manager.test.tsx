import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { InformationManager } from "~/pages/admin/information/index"

const informationPayload = {
  version: 1,
  cards: [
    {
      id: "summer-live",
      category: "activity",
      contentType: "html",
      image: "/uploads/summer.webp",
      link: "/information/summer-live",
      title: "夏日活动",
      html: '<p>活动正文</p><img src="/uploads/body.webp" alt="">',
      updatedAt: "2026-07-24T00:00:00.000Z",
    },
  ],
  assets: ["/uploads/summer.webp", "/uploads/body.webp"],
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

function stubInformationRequest() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(jsonResponse(informationPayload)))
  )
}

describe("InformationManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("opens a blank create dialog from the published list", async () => {
    stubInformationRequest()
    const user = userEvent.setup()

    render(<InformationManager />)

    expect(await screen.findByText("夏日活动")).toBeVisible()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "新增活动内容" }))

    const dialog = screen.getByRole("dialog", { name: "新增活动内容" })
    expect(within(dialog).getByLabelText("标题")).toHaveValue("")
    expect(within(dialog).getByLabelText("外部链接")).toHaveValue("")
    expect(within(dialog).getByLabelText("内容预览")).toBeVisible()
  })

  it("prefills the edit dialog without exposing stored paths", async () => {
    stubInformationRequest()
    const user = userEvent.setup()

    render(<InformationManager />)

    expect(await screen.findByText("夏日活动")).toBeVisible()
    expect(screen.getByText("2 个对象")).toBeVisible()
    expect(screen.getByText("托管图片 1")).toBeVisible()
    expect(screen.getByText("托管图片 2")).toBeVisible()
    expect(document.body).not.toHaveTextContent("/uploads/summer.webp")
    expect(document.body).not.toHaveTextContent("/uploads/body.webp")
    expect(document.body).not.toHaveTextContent("/information/summer-live")
    expect(
      screen.getByRole("button", { name: "拖动排序：夏日活动" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "编辑“夏日活动”" }))

    const dialog = screen.getByRole("dialog", { name: "编辑活动内容" })
    expect(within(dialog).getByLabelText("标题")).toHaveValue("夏日活动")
    const htmlEditor = within(dialog).getByLabelText(
      "HTML 正文"
    ) as HTMLTextAreaElement
    expect(htmlEditor.value).toContain("<p>活动正文</p>")
    expect(htmlEditor.value).toContain("正文图片 1")
    expect(htmlEditor.value).not.toContain("/uploads/body.webp")
    expect(within(dialog).getByTitle("活动 HTML 预览")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("/uploads/body.webp")
    )
    expect(document.body).not.toHaveTextContent("/uploads/summer.webp")
    expect(document.body).not.toHaveTextContent("/uploads/body.webp")
    expect(document.body).not.toHaveTextContent("/information/summer-live")
  })

  it("keeps the edit dialog open until saving succeeds", async () => {
    document.cookie = "csrf_token=information-manager-test; path=/"
    let resolveSave: (response: Response) => void = () => undefined
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const method =
          input instanceof Request ? input.method : (init?.method ?? "GET")
        if (method === "PUT") return saveResponse
        return Promise.resolve(jsonResponse(informationPayload))
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<InformationManager />)

    expect(await screen.findByText("夏日活动")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "编辑“夏日活动”" }))
    await user.click(screen.getByRole("button", { name: "保存活动内容" }))

    expect(screen.getByRole("dialog", { name: "编辑活动内容" })).toBeVisible()
    expect(screen.getByLabelText("标题")).toBeDisabled()

    const saveCall = fetchMock.mock.calls.find(([input, init]) => {
      return (
        (input instanceof Request ? input.method : (init?.method ?? "GET")) ===
        "PUT"
      )
    })
    expect(saveCall).toBeDefined()
    const [saveInput, saveInit] = saveCall!
    const savedPayload =
      saveInput instanceof Request
        ? ((await saveInput.clone().json()) as { html: string })
        : (JSON.parse(String(saveInit?.body)) as { html: string })
    expect(savedPayload.html).toContain("/uploads/body.webp")
    expect(savedPayload.html).not.toContain("data-information-body-asset")

    await act(async () => {
      resolveSave(jsonResponse({ success: true, card: informationPayload.cards[0] }))
      await saveResponse
    })

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "编辑活动内容" })
      ).not.toBeInTheDocument()
    })
  })

  it("does not retry a successful save when list refresh fails", async () => {
    document.cookie = "csrf_token=information-refresh-test; path=/"
    let informationLoads = 0
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const method =
          input instanceof Request ? input.method : (init?.method ?? "GET")
        if (method === "PUT") {
          return Promise.resolve(jsonResponse({ success: true, card: informationPayload.cards[0] }))
        }
        informationLoads += 1
        if (informationLoads === 1) {
          return Promise.resolve(jsonResponse(informationPayload))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "refresh failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          })
        )
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<InformationManager />)

    expect(await screen.findByText("夏日活动")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "编辑“夏日活动”" }))
    await user.click(screen.getByRole("button", { name: "保存活动内容" }))

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "编辑活动内容" })
      ).not.toBeInTheDocument()
    })
    const updateCalls = fetchMock.mock.calls.filter(([input, init]) => {
      return (
        (input instanceof Request ? input.method : (init?.method ?? "GET")) ===
        "PUT"
      )
    })
    expect(updateCalls).toHaveLength(1)
  })
})
