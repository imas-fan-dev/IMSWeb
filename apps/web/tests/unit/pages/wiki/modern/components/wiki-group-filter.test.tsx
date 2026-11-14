import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { WikiPublicCatalog } from "~/lib/api"
import { APP_STICKY_HEADER_OFFSET } from "~/lib/app-target"
import { WikiGroupFilter } from "~/pages/wiki/modern/components/wiki-group-filter"

vi.mock("~/lib/app-target", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/app-target")>()
  return { ...actual, IS_APP_TARGET: true }
})

type WikiGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

const groups: WikiGroup[] = [
  {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f34e6c",
    iconUrl: null,
    imageTransform: {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    idols: [],
  },
]

describe("WikiGroupFilter", () => {
  it("sticks below the App title bar and iOS safe area", () => {
    render(<WikiGroupFilter groups={groups} ungroupedCount={0} />)

    const navigation = screen.getByRole("region", {
      name: "组合与分类导航",
    })

    expect(navigation).toHaveClass("sticky", APP_STICKY_HEADER_OFFSET)
    expect(navigation).not.toHaveClass("top-16")
  })
})
