import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { birthdays } from "./birthday-data"
import { BirthdayCalendar } from "./birthday-calendar"

describe("BirthdayCalendar", () => {
  it("imports the complete legacy birthday dataset", () => {
    expect(birthdays).toHaveLength(347)
  })

  it("shows birthdays and supports month navigation", async () => {
    const user = userEvent.setup()
    render(<BirthdayCalendar today={new Date(2026, 6, 23)} />)

    expect(screen.getByTestId("calendar-month")).toHaveTextContent(
      "2026 年 7 月"
    )
    expect(screen.getByText("相马夏美")).toBeVisible()
    expect(screen.getByText("舞滨步")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "下个月" }))
    expect(screen.getByTestId("calendar-month")).toHaveTextContent(
      "2026 年 8 月"
    )

    await user.click(
      screen.getByRole("button", { name: "8 月 1 日，4 位偶像生日" })
    )
    expect(screen.getByText("栋方爱海")).toBeVisible()
    expect(screen.getByText("皮埃尔")).toBeVisible()
    expect(screen.getByText("仓本千奈")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "今日" }))
    expect(screen.getByTestId("calendar-month")).toHaveTextContent(
      "2026 年 7 月"
    )
    expect(screen.getByText("相马夏美")).toBeVisible()
  })
})
