import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import Live from "~/pages/live/index"

const FIXED_TODAY = new Date(2026, 7, 20, 12)

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  })
}

function shiftedDate(days: number) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date
}

function liveEvent(
  id: string,
  date: Date,
  title: string,
  brandCode = "IDOLMASTER"
) {
  return {
    id,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    title,
    time: "17:00 开演",
    location: "",
    detailUrl: "https://idolmaster-official.jp/live_event/test/",
    franchises: [brandCode === "IDOLMASTER" ? "765PRO ALLSTARS" : "VA-LIV"],
    brandCodes: [brandCode],
  }
}

function archiveEvents() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, index) =>
    liveEvent(
      `archive-${index + 1}`,
      new Date(now.getFullYear(), now.getMonth(), index + 1, 12),
      `归档公演 ${String(index + 1).padStart(2, "0")}`
    )
  )
}

describe("Live", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("shows the next two weeks, monthly archives, and ten-item pages", async () => {
    vi.setSystemTime(FIXED_TODAY)
    const initialEvents = [
      ...archiveEvents(),
      liveEvent("later", shiftedDate(8), "稍后公演", "VA-LIV"),
      liveEvent("sooner", shiftedDate(2), "近期公演"),
      liveEvent("outside", shiftedDate(14), "两周外公演"),
    ]
    const historicalEvents = [
      liveEvent("history-late", new Date(2020, 7, 20, 12), "历史公演 B"),
      liveEvent("history-early", new Date(2020, 7, 3, 12), "历史公演 A"),
    ]
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const rawUrl = input instanceof Request ? input.url : String(input)
      const months = new URL(rawUrl, "http://localhost").searchParams.get(
        "months"
      )
      return Promise.resolve(
        jsonResponse(months === "2020-08" ? historicalEvents : initialEvents)
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<Live />)

    const featuredSection = screen
      .getByRole("heading", { name: "未来两周" })
      .closest("section")!
    expect(await within(featuredSection).findByText("近期公演")).toBeVisible()
    const featuredHeadings = within(featuredSection).getAllByRole("heading", {
      level: 3,
    })
    expect(featuredHeadings.map((heading) => heading.textContent)).toEqual([
      "近期公演",
      "稍后公演",
    ])
    expect(within(featuredSection).queryByText("两周外公演")).toBeNull()
    expect(
      within(featuredSection).getByRole("img", { name: "VA-LIV" })
    ).toContainHTML("<svg")

    const firstArchivePage = screen.getByLabelText("更多日程列表")
    expect(
      within(firstArchivePage).getAllByRole("heading", { level: 3 })
    ).toHaveLength(10)
    expect(screen.getByText("第 1 / 2 页")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "下一页" }))
    expect(screen.getByText("第 2 / 2 页")).toBeVisible()

    fireEvent.change(screen.getByLabelText("筛选日程月份"), {
      target: { value: "2020-08" },
    })
    expect(await screen.findByText("历史公演 A")).toBeVisible()
    const historicalList = screen.getByLabelText("更多日程列表")
    expect(
      within(historicalList)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["历史公演 A", "历史公演 B"])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1]?.[0]).toContain("months=2020-08")
  })

  it("shows empty states for both schedule areas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]))
    )

    render(<Live />)

    expect(await screen.findByText("未来两周暂无日程")).toBeVisible()
    expect(screen.getByText("该月份暂无日程")).toBeVisible()
  })

  it("shows independent initial loading errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"))
    )

    render(<Live />)

    expect(await screen.findByText("无法加载日程")).toBeVisible()
    expect(screen.getByText("无法加载所选月份")).toBeVisible()
  })
})
