import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("~/lib/app-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/app-target")>()
  return { ...actual, IS_APP_TARGET: true }
})

import { StoryPage } from "~/pages/wiki/modern/story-page"

const storyPayload = {
  status: "success",
  agency: {
    id: 6,
    code: "sc",
    name: "闪耀色彩",
    color: "#8dbbff",
  },
  idol: {
    id: 6,
    name: "樱木真乃",
    folderName: "sakuragi_mano",
    color: "#f1b0c9",
    wikiUrl: null,
    imageUrl: "/image/mano.webp",
    imageFit: "cover",
    textColor: "#ffffff",
  },
  categories: [],
}

afterEach(() => vi.unstubAllGlobals())

describe("StoryPage App layout", () => {
  it("clears App chrome for the floating navigation and short drawer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(storyPayload))
    )
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={["/story?agency=闪耀色彩&idol=樱木真乃"]}>
        <StoryPage />
      </MemoryRouter>
    )

    const trigger = await screen.findByRole("button", {
      name: "打开樱木真乃剧情导航",
    })
    expect(trigger).toHaveClass("bottom-[var(--app-floating-bottom)]")
    expect(trigger).not.toHaveClass("bottom-4")

    await user.click(trigger)

    expect(screen.getByRole("dialog")).toHaveClass(
      "max-h-[min(82svh,var(--app-viewport-height))]"
    )
  })
})
