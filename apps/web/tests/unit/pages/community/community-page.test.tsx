import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, type CommunityContentEntry } from "~/lib/api"
import Community from "~/pages/community"
const mocks = vi.hoisted(() => ({ content: vi.fn(), series: vi.fn() }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getCommunityContent: () => ({ send: mocks.content }),
  getFudabaSeries: () => ({ send: mocks.series }),
}))
const entry: CommunityContentEntry = {
  id: "configured",
  title: "配置入口",
  description: "配置说明",
  href: "/community/cards",
  icon: "unknown",
  imageUrl: null,
  enabled: true,
  audience: "all",
  availability: "always",
}
const content = (entries: CommunityContentEntry[] = []) => ({
  version: 1,
  title: "社区标题",
  introduction: "社区简介",
  entries,
  updatedAt: null,
})
const renderPage = () =>
  render(
    <MemoryRouter>
      <Community />
    </MemoryRouter>
  )
describe("configured Community", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.content.mockResolvedValue(content())
    mocks.series.mockResolvedValue({ items: [] })
  })
  it("renders a successful empty configuration without placeholders or a probe", async () => {
    renderPage()
    expect(
      await screen.findByRole("heading", { name: "社区标题" })
    ).toBeVisible()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(mocks.series).not.toHaveBeenCalled()
  })
  it("filters hidden and App-only entries and retains configured ordering and custom images", async () => {
    mocks.content.mockResolvedValue(
      content([
        { ...entry, id: "hidden", enabled: false, availability: "exchange" },
        { ...entry, id: "app", audience: "app", availability: "exchange" },
        { ...entry, imageUrl: "/uploads/community-content/image.webp" },
        { ...entry, id: "second", title: "第二入口", audience: "web" },
      ])
    )
    renderPage()
    await screen.findByRole("link", { name: /配置入口/ })
    expect(screen.getAllByRole("link").map((node) => node.textContent)).toEqual(
      ["配置入口配置说明", "第二入口配置说明"]
    )
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/community-content/image.webp")
    )
    expect(mocks.series).not.toHaveBeenCalled()
  })
  it("retries a failed read without injecting defaults", async () => {
    mocks.content
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(content([entry]))
    renderPage()
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取")
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    await userEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(await screen.findByRole("link", { name: /配置入口/ })).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "重试" })
    ).not.toBeInTheDocument()
    expect(mocks.content).toHaveBeenCalledTimes(2)
  })
  it("hides configured exchange entries for explicit feature-off", async () => {
    mocks.content.mockResolvedValue(
      content([{ ...entry, availability: "exchange" }])
    )
    mocks.series.mockRejectedValue(
      new ApiError("Not Found", {
        kind: "http",
        status: 404,
        payload: "Not Found",
      })
    )
    renderPage()
    await screen.findByRole("heading", { name: "社区标题" })
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    )
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(mocks.series).toHaveBeenCalledTimes(1)
  })
  it.each([503, 404])(
    "keeps configured exchange navigation on unrelated %s errors",
    async (status) => {
      mocks.content.mockResolvedValue(
        content([{ ...entry, availability: "exchange" }])
      )
      mocks.series.mockRejectedValue(
        new ApiError("unavailable", {
          kind: "http",
          status,
          payload: { error: "unavailable" },
        })
      )
      renderPage()
      expect(
        await screen.findByRole("link", { name: /配置入口/ })
      ).toHaveAttribute("href", "/community/cards")
    }
  )
})
