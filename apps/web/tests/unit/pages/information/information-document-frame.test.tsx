import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { InformationDocumentFrame } from "~/pages/information/components/information-document-frame"

// `IS_APP_TARGET` and `API_ORIGIN` are module-level constants, so a case that
// pins the packaged build has to stub the environment and import the component
// again rather than remount the one imported above.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("InformationDocumentFrame", () => {
  it("fills the reading column without allowing the iframe to widen it", () => {
    render(
      <InformationDocumentFrame
        contentId="activity/with spaces"
        title="超长活动内容"
      />
    )

    expect(screen.getByTitle("超长活动内容")).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full"
    )
    expect(screen.getByTitle("超长活动内容")).toHaveAttribute(
      "src",
      "/information/activity%2Fwith%20spaces/content"
    )
  })

  it("reaches the API origin for the document in a packaged build", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "app")
    vi.stubEnv("VITE_IMS_API_ORIGIN", "https://api.example.test")
    const { InformationDocumentFrame: PackagedFrame } =
      await import("~/pages/information/components/information-document-frame")

    render(<PackagedFrame contentId="activity-1" title="活动内容" />)

    expect(screen.getByTitle("活动内容")).toHaveAttribute(
      "src",
      "https://api.example.test/information/activity-1/content"
    )
  })
})
