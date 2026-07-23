import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button } from "~/components/ui/button"

describe("Button", () => {
  it("exposes button semantics and handles activation", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={onClick}>Open navigation</Button>)

    const button = screen.getByRole("button", { name: "Open navigation" })
    expect(button).toBeEnabled()

    await user.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("does not activate while disabled", async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(
      <Button disabled onClick={onClick}>
        Submit
      </Button>
    )

    const button = screen.getByRole("button", { name: "Submit" })
    expect(button).toBeDisabled()

    await user.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })
})
