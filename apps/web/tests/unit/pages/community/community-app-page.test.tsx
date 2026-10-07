import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { expect, it, vi } from "vitest"
import Community from "~/pages/community"
const mocks = vi.hoisted(() => ({
  series: vi.fn(),
  media: vi.fn((url: string) => `https://api.example.test${url}`),
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  resolveSafeMediaUrl: mocks.media,
  getCommunityContent: () => ({
    send: async () => ({
      version: 1,
      title: "App 社区",
      introduction: "",
      updatedAt: null,
      entries: ["all", "app", "web"].map((audience) => ({
        id: audience,
        title: audience,
        description: "",
        href: "/events",
        icon: "users",
        imageUrl: "/uploads/community-content/test.webp",
        enabled: true,
        availability: "always",
        audience,
      })),
    }),
  }),
  getFudabaSeries: () => ({ send: mocks.series }),
}))
it("renders only configured App/all entries with the shared media resolver", async () => {
  render(
    <MemoryRouter>
      <Community />
    </MemoryRouter>
  )
  expect(await screen.findByRole("link", { name: "app" })).toBeVisible()
  expect(screen.getByRole("link", { name: "all" })).toBeVisible()
  expect(screen.queryByRole("link", { name: "web" })).not.toBeInTheDocument()
  expect(document.querySelector("img")).toHaveAttribute(
    "src",
    "https://api.example.test/uploads/community-content/test.webp"
  )
  expect(mocks.series).not.toHaveBeenCalled()
})
