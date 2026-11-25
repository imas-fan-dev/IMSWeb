import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  NamecardReactionRow,
  orderedNamecardReactions,
} from "~/pages/community/components/namecard-reaction-row"

describe("NamecardReactionRow", () => {
  it("orders reactions by count descending and breaks ties with the built-in order", () => {
    expect(
      orderedNamecardReactions({
        "✨": 4,
        "😂": 9,
        "👍": 4,
        "❤️": 4,
        "🚀": 0,
        "not-a-reaction": 7,
      }).map(([emoji]) => emoji)
    ).toEqual(["😂", "❤️", "👍", "✨"])
  })

  it("renders 20px chips in that order and only the leading ones when limited", async () => {
    const user = userEvent.setup()
    const onChipClick = vi.fn()
    render(
      <NamecardReactionRow
        reactions={{ "❤️": 4, "👍": 4, "😂": 9 }}
        limit={2}
        onChipClick={onChipClick}
      />
    )

    const chips = screen.getAllByRole("button", { name: /次反应$/ })
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "😂，9 次反应",
      "❤️，4 次反应",
    ])
    for (const chip of chips) {
      expect(chip).toHaveClass("h-5", "min-h-5", "rounded-sm")
      expect(chip.querySelector("img")).toHaveClass("size-3")
    }

    await user.click(chips[1]!)
    expect(onChipClick).toHaveBeenCalledWith(["❤️", 4], expect.anything())
  })
})
