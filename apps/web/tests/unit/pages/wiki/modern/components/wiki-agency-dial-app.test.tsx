import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("~/lib/app-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/app-target")>()
  return { ...actual, IS_APP_TARGET: true }
})

import type { WikiPublicAgency } from "~/lib/api"
import { WikiAgencyDial } from "~/pages/wiki/modern/components/wiki-agency-dial"

const imageTransform: WikiPublicAgency["imageTransform"] = {
  fit: "contain",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
}

const agencies: WikiPublicAgency[] = [
  {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f34e6c",
    bannerTitle: "765PRO",
    iconUrl: null,
    idolCount: 1,
    entryCount: 1,
    imageTransform,
  },
  {
    id: 2,
    code: "346",
    name: "346PRO",
    color: "#2581c4",
    bannerTitle: "346PRO",
    iconUrl: null,
    idolCount: 1,
    entryCount: 1,
    imageTransform,
  },
]

describe("WikiAgencyDial App geometry", () => {
  it("centres the App dial on the floating trigger that opens it", async () => {
    const user = userEvent.setup()

    render(
      <WikiAgencyDial
        agencies={agencies}
        selectedAgency="765PRO"
        visibilityClassName=""
        view="modern"
        onSelectAgency={vi.fn()}
      />
    )

    // The popup mirrors this frame: `left-4 size-14` puts the trigger centre at
    // `left-11`, and the popup adds half a box of its own to reach it.
    const trigger = screen.getByRole("button", { name: "打开企划拨盘" })
    expect(trigger).toHaveClass(
      "left-4",
      "size-14",
      "bottom-[var(--app-floating-bottom)]"
    )
    expect(trigger).not.toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    )

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "选择企划" })
    expect(dialog).toHaveClass(
      "bottom-[calc(var(--app-floating-bottom)+1.75rem)]",
      "left-11",
      "-translate-x-1/2",
      "translate-y-1/2"
    )
    expect(dialog).not.toHaveClass(
      "bottom-[calc(2.75rem+env(safe-area-inset-bottom))]",
      "left-(--app-safe-inline)",
      "bottom-[calc(var(--app-bottom-clearance)+1rem)]"
    )

    const dial = screen.getByTestId("wiki-agency-dial")
    expect(dial.style.width).toBe(
      "min(calc(var(--safe-viewport-width) - 2rem), calc(var(--app-viewport-height) - var(--app-bottom-clearance) - 2rem), 22rem)"
    )
    expect(dial.style.width).not.toContain("100dvh")
  })
})
