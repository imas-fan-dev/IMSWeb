import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { createCatalogBirthdays } from "@/mocks/data/catalog"
import { installFetchMock, jsonResponse } from "@/tests/unit/support/api-client"
import { BirthdayCalendar } from "~/pages/home/components/birthday-calendar"
import { TodayBirthdayNotice } from "~/pages/home/components/home-hero"
import { HomeBirthdaysProvider } from "~/pages/home/hooks/use-home-birthdays"

describe("BirthdayCalendar", () => {
  it("shares current profile data with today's notice and preserves month navigation", async () => {
    const mock = installFetchMock(async () =>
      jsonResponse(createCatalogBirthdays())
    )
    const user = userEvent.setup()
    render(
      <HomeBirthdaysProvider>
        <TodayBirthdayNotice today={new Date(2026, 6, 23)} />
        <BirthdayCalendar today={new Date(2026, 6, 23)} />
      </HomeBirthdaysProvider>
    )
    await screen.findByText("已收录 6 位偶像")
    expect(screen.getAllByText("相马夏美")).toHaveLength(2)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("calendar-month")).toHaveTextContent(
      "2026 年 7 月"
    )
    expect(screen.getByTestId("calendar-grid").children).toHaveLength(42)
    await user.click(screen.getByRole("button", { name: "下个月" }))
    expect(screen.getByTestId("calendar-month")).toHaveTextContent(
      "2026 年 8 月"
    )
    expect(screen.getByTestId("calendar-grid").children).toHaveLength(49)
    await user.click(
      screen.getByRole("button", { name: "8 月 1 日，3 位偶像生日" })
    )
    for (const name of ["栋方爱海", "皮埃尔", "仓本千奈"])
      expect(screen.getByText(name)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "今日" }))
    expect(screen.getAllByText("相马夏美")).toHaveLength(2)
  })

  it("shows February 29 only in a leap year", async () => {
    installFetchMock(async () => jsonResponse(createCatalogBirthdays()))
    render(
      <HomeBirthdaysProvider>
        <BirthdayCalendar today={new Date(2028, 1, 29)} />
      </HomeBirthdaysProvider>
    )
    expect(await screen.findByText("闰日偶像")).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "上一年" }))
    expect(
      screen.queryByRole("button", { name: /2 月 29 日/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("闰日偶像")).not.toBeInTheDocument()
  })

  it("distinguishes failed loading from no birthdays and retries against current data", async () => {
    const mock = installFetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: "unavailable" }, 500)
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, items: [] }))
    render(
      <HomeBirthdaysProvider>
        <TodayBirthdayNotice today={new Date(2026, 6, 23)} />
        <BirthdayCalendar today={new Date(2026, 6, 23)} />
      </HomeBirthdaysProvider>
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "生日资料加载失败"
    )
    expect(
      screen.queryByText("这一天暂无收录的偶像生日。")
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "重试生日资料" }))
    await waitFor(() =>
      expect(screen.getByText("已收录 0 位偶像")).toBeVisible()
    )
    expect(screen.getByText("这一天暂无收录的偶像生日。")).toBeVisible()
    expect(screen.queryByLabelText("今日生日")).not.toBeInTheDocument()
    expect(mock).toHaveBeenCalledTimes(2)
  })
})
