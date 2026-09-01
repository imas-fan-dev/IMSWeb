import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

vi.mock("~/lib/app-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/app-target")>()
  return { ...actual, IS_APP_TARGET: true }
})

import Works from "~/pages/works/index"
import WorkDetailPage from "~/pages/works/work-detail-page"

const appDetailMinHeight = "min-h-(--app-content-height)"

function renderDetail(workSlug = "765") {
  const props = {
    params: { workSlug },
  } as ComponentProps<typeof WorkDetailPage>

  return render(
    <MemoryRouter>
      <WorkDetailPage {...props} />
    </MemoryRouter>
  )
}

describe("Works App layout", () => {
  it("uses the shared PageShell App gutter on the works index", () => {
    render(
      <MemoryRouter>
        <Works />
      </MemoryRouter>
    )

    const main = document.getElementById("main-content")
    expect(main).toHaveClass("max-w-5xl", "px-(--app-safe-inline)", "py-5")
    expect(main).not.toHaveClass("px-4", "py-12")
  })

  it("subtracts App chrome from every detail height boundary", () => {
    renderDetail()

    const main = document.getElementById("main-content")
    const surface = screen.getByTestId("work-detail-surface")
    const franchise = screen.getByTestId("work-detail-franchise")

    for (const element of [main, surface, franchise]) {
      expect(element).toHaveClass(appDetailMinHeight)
      expect(element).not.toHaveClass("min-h-[calc(100svh-4rem)]")
    }
  })
})
