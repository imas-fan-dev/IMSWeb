import { fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
import { PlatformAccountKindIcon } from "~/pages/account/me/components/platform-account-kind-icon"
import type { PlatformAccountKind } from "~/lib/api"

const kind: PlatformAccountKind = {
  id: "github",
  name: "GitHub",
  group: "showcase",
  pattern: "^[a-z0-9-]+$",
  baseUrl: "https://github.com/{value}",
  color: "#181717",
  icon: "github",
  iconUrl: null,
  displayOrder: 1,
  enabled: true,
  uppercase: false,
}

describe("platform account icons", () => {
  it.each(["switch", "nintendoswitch", "xbox"])(
    "bundles %s instead of relying on a removed CDN icon",
    (slug) => {
      const { container } = renderPage(
        <PlatformAccountKindIcon kind={{ ...kind, id: slug, icon: slug }} />
      )
      expect(container.querySelector("img")?.getAttribute("src")).toMatch(
        /^(?:data:image\/svg\+xml|\/.*\.svg)/
      )
    }
  )

  it.each(["github", "x"])(
    "uses theme foreground for %s even when the catalogue color is black",
    (slug) => {
      const { container } = renderPage(
        <PlatformAccountKindIcon kind={{ ...kind, id: slug, icon: slug }} />
      )
      expect(
        container
          .querySelector<HTMLElement>("[style]")
          ?.style.backgroundColor.toLowerCase()
      ).toBe("currentcolor")
    }
  )

  it("falls back from an unavailable upload to the catalogue icon, then to the platform initial", () => {
    const { container } = renderPage(
      <PlatformAccountKindIcon
        kind={{ ...kind, iconUrl: "/missing-upload.svg" }}
      />
    )
    const image = container.querySelector("img")!
    expect(image).toHaveAttribute("src", "/missing-upload.svg")
    fireEvent.error(image)
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /^(?:data:image\/svg\+xml|\/.*\.svg)/
    )
    fireEvent.error(container.querySelector("img")!)
    expect(container).toHaveTextContent("G")
    expect(container.querySelector("img")).toBeNull()
  })
})
