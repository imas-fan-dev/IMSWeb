import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

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

describe("WikiAgencyDial", () => {
  it("keeps its custom lower-left geometry outside inset dialog sizing", async () => {
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

    await user.click(screen.getByRole("button", { name: "打开企划拨盘" }))

    const dialog = await screen.findByRole("dialog", { name: "选择企划" })

    expect(dialog).toHaveAttribute("data-safe-area", "custom")
    expect(dialog).toHaveClass(
      "top-auto",
      "bottom-[calc(2.75rem+env(safe-area-inset-bottom))]",
      "left-11",
      "w-auto",
      "max-w-none",
      "-translate-x-1/2",
      "translate-y-1/2"
    )
    expect(dialog).not.toHaveClass(
      "top-1/2",
      "left-1/2",
      "w-(--overlay-safe-width)",
      "-translate-1/2"
    )
  })
})
