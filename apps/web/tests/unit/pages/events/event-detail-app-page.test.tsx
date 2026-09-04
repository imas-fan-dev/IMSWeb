import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import EventDetailPage from "~/pages/events/event-detail-page"

const mocks = vi.hoisted(() => ({ useRequest: vi.fn() }))

vi.mock("alova/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("alova/client")>()),
  useRequest: mocks.useRequest,
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

describe("EventDetailPage in the App target", () => {
  beforeEach(() => {
    mocks.useRequest.mockReturnValue({
      data: {
        id: 43,
        article_id: 70,
        title: "App 社区动态详情",
        summary: "移动端详情摘要",
        cover_url: null,
        cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
        image_url: null,
        body_json: { type: "doc", content: [] },
        body_html: "<p>详情正文</p>",
        status: "published",
        revision: 3,
        kind: "notice",
        name: "测试发布者",
        published_at: "2026-09-03T09:30:00.000Z",
        related_links: [],
        live_franchises: [],
        live_brand_codes: [],
      },
      loading: false,
      error: null,
    })
  })

  it("uses the shared safe-area shell without duplicating the App back action", () => {
    const props = {
      params: { eventId: "43" },
    } as ComponentProps<typeof EventDetailPage>

    render(
      <MemoryRouter>
        <EventDetailPage {...props} />
      </MemoryRouter>
    )

    expect(screen.getByRole("main")).toHaveClass(
      "max-w-7xl",
      "px-(--app-safe-inline)",
      "py-8",
      "sm:py-12"
    )
    expect(
      screen.queryByRole("link", { name: "返回社区动态" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "App 社区动态详情"
    )
  })
})
