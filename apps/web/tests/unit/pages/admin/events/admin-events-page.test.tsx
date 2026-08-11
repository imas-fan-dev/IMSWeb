import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import AdminEventsPage from "~/pages/admin/events/admin-events-page"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

const pagePayload = {
  items: [
    {
      id: "35",
      title: "广州交流活动",
      name: "梦想之边",
      contact: "contact@example.test",
      image_url: "/uploads/event/original/current.webp",
      created_at: "2026-08-11T00:00:00.000Z",
    },
  ],
  pageInfo: {
    nextCursor: null,
    hasNextPage: false,
    snapshotAt: "35",
  },
}

describe("AdminEventsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = "csrf_token=; Max-Age=0; path=/"
  })

  it("opens a prefilled edit dialog and replaces an image without showing its path", async () => {
    document.cookie = "csrf_token=event-editor-test; path=/"
    const updateForms: FormData[] = []
    let updateCsrf: string | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        if (request.method === "PUT") {
          if (init?.body instanceof FormData) updateForms.push(init.body)
          updateCsrf = request.headers.get("x-csrftoken")
          return jsonResponse({ success: true })
        }
        return jsonResponse(pagePayload)
      })
    )
    const user = userEvent.setup()

    render(<AdminEventsPage />)

    expect(await screen.findByText("广州交流活动")).toBeVisible()
    expect(
      screen.queryByText("/uploads/event/original/current.webp")
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "编辑“广州交流活动”" }))
    expect(screen.getByRole("heading", { name: "编辑社区活动" })).toBeVisible()
    expect(screen.getByLabelText("活动标题")).toHaveValue("广州交流活动")
    expect(screen.getByLabelText("主办方或活动名")).toHaveValue("梦想之边")
    expect(screen.getByLabelText("联系方式或外链")).toHaveValue(
      "contact@example.test"
    )
    expect(screen.getByAltText("广州交流活动当前活动图片")).toHaveAttribute(
      "src",
      "/uploads/event/original/current.webp"
    )

    const replacement = new File([Uint8Array.of(1, 2, 3)], "updated.png", {
      type: "image/png",
    })
    await user.upload(screen.getByLabelText("替换活动图片"), replacement)
    await user.clear(screen.getByLabelText("活动标题"))
    await user.type(screen.getByLabelText("活动标题"), "更新后的交流活动")
    await user.click(screen.getByRole("button", { name: "保存活动" }))

    await waitFor(() => expect(updateForms).toHaveLength(1))
    expect(updateForms[0].get("title")).toBe("更新后的交流活动")
    expect((updateForms[0].get("image") as File | null)?.name).toBe(
      "updated.png"
    )
    expect(updateCsrf).toBe("event-editor-test")
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "编辑社区活动" })
      ).not.toBeInTheDocument()
    )
  })

  it("creates a new event from the list action dialog", async () => {
    document.cookie = "csrf_token=event-create-test; path=/"
    const createForms: FormData[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        if (request.method === "POST") {
          if (init?.body instanceof FormData) createForms.push(init.body)
          return jsonResponse({ success: true, id: 36 })
        }
        return jsonResponse({
          ...pagePayload,
          items: [],
          pageInfo: { ...pagePayload.pageInfo, snapshotAt: null },
        })
      })
    )
    const user = userEvent.setup()

    render(<AdminEventsPage />)
    await screen.findByText("还没有活动")
    await user.click(screen.getByRole("button", { name: "新建活动" }))

    await user.type(screen.getByLabelText("活动标题"), "新活动")
    await user.type(screen.getByLabelText("主办方或活动名"), "运营组")
    await user.type(screen.getByLabelText("联系方式或外链"), "QQ群 123")
    await user.upload(
      screen.getByLabelText("活动图片"),
      new File([Uint8Array.of(1)], "event.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "发布活动" }))

    await waitFor(() => expect(createForms).toHaveLength(1))
    expect(createForms[0].get("title")).toBe("新活动")
    expect((createForms[0].get("image") as File | null)?.name).toBe("event.png")
  })

  it("loads every cursor page so older events remain editable", async () => {
    const requestedCursors: Array<string | null> = []
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        const cursor = new URL(request.url).searchParams.get("cursor")
        requestedCursors.push(cursor)
        if (cursor) {
          return jsonResponse({
            items: [
              {
                ...pagePayload.items[0],
                id: "34",
                title: "较早的活动",
              },
            ],
            pageInfo: {
              nextCursor: null,
              hasNextPage: false,
              snapshotAt: "35",
            },
          })
        }
        return jsonResponse({
          ...pagePayload,
          pageInfo: {
            nextCursor: "cursor-page-2",
            hasNextPage: true,
            snapshotAt: "35",
          },
        })
      })
    )

    render(<AdminEventsPage />)

    expect(await screen.findByText("广州交流活动")).toBeVisible()
    expect(await screen.findByText("较早的活动")).toBeVisible()
    expect(requestedCursors).toEqual([null, "cursor-page-2"])
  })
})
