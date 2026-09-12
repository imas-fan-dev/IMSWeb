import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { InformationDocumentFrame } from "~/pages/information/components/information-document-frame"

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
})
