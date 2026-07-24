import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { InformationManager } from "~/pages/admin/information/information-manager"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("InformationManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("connects loaded content to the list, editor, and HTML preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            version: 1,
            cards: [
              {
                id: "summer-live",
                category: "activity",
                contentType: "html",
                image: "/uploads/summer.webp",
                link: "/information/summer-live",
                title: "夏日活动",
                html: "<p>活动正文</p>",
                updatedAt: "2026-07-24T00:00:00.000Z",
              },
            ],
            assets: ["/uploads/summer.webp"],
          })
        )
      )
    )
    vi.stubGlobal("scrollTo", vi.fn())
    const user = userEvent.setup()

    render(<InformationManager />)

    expect(await screen.findByText("夏日活动")).toBeVisible()
    expect(screen.getByText("1 个对象")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "编辑" }))

    expect(screen.getByLabelText("标题")).toHaveValue("夏日活动")
    expect(screen.getByTitle("活动 HTML 预览")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("活动正文")
    )
  })
})
