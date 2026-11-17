import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AdminPagination } from "~/components/admin/admin-pagination"

describe("AdminPagination", () => {
  it("reads out the page and steps to the neighbours", async () => {
    const onChange = vi.fn()
    render(
      <AdminPagination
        page={3}
        totalPages={8}
        disabled={false}
        onChange={onChange}
      />
    )

    expect(screen.getByText("第 3 / 8 页")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "上一页" }))
    expect(onChange).toHaveBeenCalledWith(2)

    await userEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it("jumps to a typed page and keeps the box inside the range", async () => {
    const onChange = vi.fn()
    render(
      <AdminPagination
        page={1}
        totalPages={8}
        disabled={false}
        onChange={onChange}
      />
    )

    const box = screen.getByLabelText("跳转页码")

    await userEvent.clear(box)
    await userEvent.type(box, "7")
    await userEvent.click(screen.getByRole("button", { name: "跳转" }))
    expect(onChange).toHaveBeenCalledWith(7)

    // Letters and symbols never reach the draft.
    onChange.mockClear()
    await userEvent.clear(box)
    await userEvent.type(box, "a3b!")
    expect(box).toHaveValue("3")

    // Anything above the last page is clamped while typing, so submit cannot
    // be handed a page that does not exist.
    await userEvent.clear(box)
    await userEvent.type(box, "99")
    expect(box).toHaveValue("8")

    await userEvent.click(screen.getByRole("button", { name: "跳转" }))
    expect(onChange).toHaveBeenCalledWith(8)
  })

  it("keeps the box on the current page after the arrows move it", async () => {
    const { rerender } = render(
      <AdminPagination
        page={1}
        totalPages={8}
        disabled={false}
        onChange={vi.fn()}
      />
    )

    rerender(
      <AdminPagination
        page={2}
        totalPages={8}
        disabled={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText("跳转页码")).toHaveValue("2")
  })

  it("disables every control while the list is loading", () => {
    render(
      <AdminPagination page={2} totalPages={8} disabled onChange={vi.fn()} />
    )

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "跳转" })).toBeDisabled()
    expect(screen.getByLabelText("跳转页码")).toBeDisabled()
  })
})
