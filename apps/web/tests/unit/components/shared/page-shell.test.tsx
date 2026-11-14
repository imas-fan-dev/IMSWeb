import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("PageShell", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("uses the App safe inline gutter and compact rhythm", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "app")
    vi.resetModules()
    const { PageShell } = await import("~/components/shared/page-shell")

    render(<PageShell width="read">内容</PageShell>)

    expect(screen.getByRole("main")).toHaveClass(
      "max-w-3xl",
      "px-(--app-safe-inline)",
      "py-5"
    )
  })

  it("keeps the documented Web container rhythm", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "web")
    vi.resetModules()
    const { PageShell } = await import("~/components/shared/page-shell")

    render(<PageShell width="wide">内容</PageShell>)

    expect(screen.getByRole("main")).toHaveClass(
      "max-w-7xl",
      "px-4",
      "py-12",
      "sm:px-6",
      "sm:py-16",
      "lg:px-8"
    )
  })

  it("uses the default reading width and forwards main attributes", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "web")
    vi.resetModules()
    const { PageShell } = await import("~/components/shared/page-shell")

    render(
      <PageShell className="min-w-0" aria-label="页面内容">
        内容
      </PageShell>
    )

    expect(screen.getByRole("main", { name: "页面内容" })).toHaveClass(
      "max-w-5xl",
      "min-w-0"
    )
    expect(screen.getByRole("main", { name: "页面内容" })).toHaveAttribute(
      "id",
      "main-content"
    )
  })
})
