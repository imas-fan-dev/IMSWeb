import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"

describe("WikiViewSwitchIcon", () => {
  it("renders the uploaded switch artwork as a decorative stable-size image", () => {
    render(<WikiViewSwitchIcon data-testid="wiki-view-switch-icon" />)

    const icon = screen.getByTestId("wiki-view-switch-icon")
    expect(icon).toHaveAttribute("src", "/brand/wiki-view-switch.png")
    expect(icon).toHaveAttribute("alt", "")
    expect(icon).toHaveAttribute("aria-hidden", "true")
    expect(icon).toHaveAttribute("width", "167")
    expect(icon).toHaveAttribute("height", "167")
  })
})
