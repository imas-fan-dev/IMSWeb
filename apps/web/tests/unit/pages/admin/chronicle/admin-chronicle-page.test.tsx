import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import AdminChronicle from "~/pages/admin/chronicle/index"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("AdminChronicle", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads each review queue without updating state during render", async () => {
    const requestedPaths: string[] = []
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        const path = new URL(request.url).pathname
        requestedPaths.push(path)

        if (path === "/eventchronicle/admin/pending") {
          return jsonResponse({
            "summer-live": [
              {
                filename: "pending.webp",
                url: "/assets/images/eventchronicle/events/upload/summer-live/pending.webp",
                uploader: "制作人A",
                time: "2026-07-29 12:00",
              },
            ],
          })
        }

        if (path === "/eventchronicle/admin/used") {
          return jsonResponse({
            "summer-live": [
              {
                filename: "approved.webp",
                url: "/assets/images/eventchronicle/events/used/summer-live/approved.webp",
              },
            ],
          })
        }

        throw new Error(`unexpected request: ${path}`)
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminChronicle />
      </MemoryRouter>
    )

    expect(await screen.findByText("pending.webp")).toBeVisible()
    expect(screen.getByText("上传者：制作人A")).toBeVisible()
    expect(requestedPaths).toEqual(["/eventchronicle/admin/pending"])

    await user.click(screen.getByRole("tab", { name: "已通过" }))

    expect(await screen.findByText("approved.webp")).toBeVisible()
    await waitFor(() => {
      expect(requestedPaths).toEqual([
        "/eventchronicle/admin/pending",
        "/eventchronicle/admin/used",
      ])
    })
  })
})
