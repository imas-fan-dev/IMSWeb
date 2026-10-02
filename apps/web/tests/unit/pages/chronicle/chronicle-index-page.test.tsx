import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useRequest: vi.fn(),
  getEditorialChroniclePage: vi.fn(),
  getEditorialChronicle: vi.fn(),
}))

vi.mock("alova/client", () => ({ useRequest: mocks.useRequest }))
vi.mock("~/lib/api", () => ({
  API_ORIGIN: "",
  PUBLIC_SITE_ORIGIN: "",
  getEditorialChroniclePage: mocks.getEditorialChroniclePage,
  getEditorialChronicle: mocks.getEditorialChronicle,
}))

import ChronicleActivityPage from "~/pages/chronicle/activity-page"
import ChronicleIndexPage from "~/pages/chronicle/index"

const longValue =
  "没有分隔符的超长活动标题与地点https://example.test/chronicle/continuous/path/for/mobile"

describe("ChronicleIndexPage", () => {
  it("uses the wide PageShell and wraps long timeline metadata", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        items: [
          {
            article_id: 7,
            title: longValue,
            occurred_on: "2026-08-30",
            date_precision: "day",
            source_type: "official",
            location: longValue,
          },
        ],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
      loading: false,
      error: null,
      onError: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChronicleIndexPage />
      </MemoryRouter>
    )

    expect(screen.getByRole("main")).toHaveClass(
      "max-w-7xl",
      "px-4",
      "sm:px-6",
      "lg:px-8"
    )
    const entry = screen.getByRole("link", { name: new RegExp(longValue) })
    expect(entry).toHaveAttribute("href", "/chronicle/7")
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass(
      "wrap-anywhere"
    )
    expect(screen.getByText(longValue, { selector: "span" })).toHaveClass(
      "wrap-anywhere"
    )
  })

  it("allows long entry locations to wrap inside detail badges", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        article_id: 7,
        title: longValue,
        occurred_on: "2026-08-30",
        date_precision: "day",
        source_type: "official",
        location: longValue,
        body_html: "<p>记录正文</p>",
      },
      loading: false,
      error: null,
      onError: vi.fn(),
    })

    const props = {
      params: { activityId: "7" },
    } as ComponentProps<typeof ChronicleActivityPage>

    render(
      <MemoryRouter>
        <ChronicleActivityPage {...props} />
      </MemoryRouter>
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "wrap-anywhere"
    )
    expect(
      screen.getByText(longValue, { selector: "span" }).parentElement
    ).toHaveClass("h-auto", "max-w-full", "whitespace-normal")
  })
})
