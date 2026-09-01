import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useRequest: vi.fn(),
  getChronicleActivities: vi.fn(),
  getChronicleActivity: vi.fn(),
}))

vi.mock("alova/client", () => ({ useRequest: mocks.useRequest }))
vi.mock("~/lib/api", () => ({
  API_ORIGIN: "",
  PUBLIC_SITE_ORIGIN: "",
  getChronicleActivities: mocks.getChronicleActivities,
  getChronicleActivity: mocks.getChronicleActivity,
}))

import ChronicleActivityPage from "~/pages/chronicle/activity-page"
import ChronicleIndexPage from "~/pages/chronicle/index"

const longValue =
  "没有分隔符的超长活动标题与地点https://example.test/chronicle/continuous/path/for/mobile"

describe("ChronicleIndexPage", () => {
  it("uses the wide PageShell and contains long activity metadata", () => {
    mocks.useRequest.mockReturnValue({
      data: [
        {
          id: longValue,
          title: longValue,
          date: "2026-08-30",
          location: longValue,
          cover: null,
        },
      ],
      loading: false,
      error: null,
      onError: vi.fn(),
    })

    const { container } = render(
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
    const cardTitle = container.querySelector('[data-slot="card-title"]')
    expect(cardTitle).toHaveTextContent(longValue)
    expect(cardTitle).toHaveClass("wrap-anywhere")
    expect(screen.getByText(`活动编号 ${longValue}`)).toHaveClass(
      "wrap-anywhere"
    )
    expect(screen.getByText(longValue, { selector: "span" })).toHaveClass(
      "wrap-anywhere"
    )
  })

  it("allows long activity locations to wrap inside detail badges", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        id: "activity-1",
        title: longValue,
        date: "2026-08-30",
        location: longValue,
        images: [],
      },
      loading: false,
      error: null,
    })

    const props = {
      params: { activityId: "activity-1" },
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
