import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FormEvent } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, type FudabaPlaceSearchResponse } from "~/lib/api"
import { ExchangePlaceSearch } from "~/pages/community/exchange/exchange-place-search"

const mocks = vi.hoisted(() => ({ search: vi.fn(), send: vi.fn() }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  searchFudabaPlaces: mocks.search,
}))

const response: FudabaPlaceSearchResponse = {
  success: true,
  items: [
    {
      id: "way:200",
      label: "西岸艺术中心",
      address: "上海市徐汇区西岸艺术中心",
      city: "上海市",
      location: { latitude: 31.1842, longitude: 121.4665, precision: "exact" },
    },
  ],
  attribution: "© OpenStreetMap contributors",
}

describe("ExchangePlaceSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockReturnValue({ send: mocks.send })
    mocks.send.mockResolvedValue(response)
  })

  it("only searches on explicit Enter or click and never submits the enclosing form", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault()
    )
    const onSelect = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <ExchangePlaceSearch onSelect={onSelect} />
      </form>
    )
    await user.type(
      screen.getByRole("textbox", { name: "搜索地点" }),
      "西岸艺术中心"
    )
    expect(mocks.search).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith("西岸艺术中心")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText(response.attribution)).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: /西岸艺术中心.*上海市/ })
    )
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(response.items[0])
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "搜索" }))
    expect(mocks.search).toHaveBeenCalledTimes(2)
  })

  it("blocks duplicate submissions and shows loading then an actionable empty result", async () => {
    let resolve!: (value: FudabaPlaceSearchResponse) => void
    mocks.send.mockReturnValue(
      new Promise<FudabaPlaceSearchResponse>((done) => {
        resolve = done
      })
    )
    const user = userEvent.setup()
    render(<ExchangePlaceSearch onSelect={vi.fn()} />)
    await user.type(
      screen.getByRole("textbox", { name: "搜索地点" }),
      "上海场馆"
    )
    await user.keyboard("{Enter}{Enter}")
    expect(screen.getByRole("status")).toHaveTextContent("正在搜索地点")
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled()
    await act(async () => resolve({ ...response, items: [] }))
    expect(screen.getByRole("status")).toHaveTextContent("没有找到地点")
  })

  it.each([
    [503, "地点搜索服务尚未配置，请联系管理员。"],
    [429, "地点搜索正忙，请稍后再试。"],
    [502, "地点暂时无法搜索，请稍后再试。"],
  ])("shows a useful error for HTTP %s", async (status, message) => {
    mocks.send.mockRejectedValue(
      new ApiError("search failed", { kind: "http", status })
    )
    const user = userEvent.setup()
    render(<ExchangePlaceSearch onSelect={vi.fn()} />)
    await user.type(
      screen.getByRole("textbox", { name: "搜索地点" }),
      "上海场馆"
    )
    await user.click(screen.getByRole("button", { name: "搜索" }))
    expect(await screen.findByText(message)).toBeVisible()
    expect(screen.queryByLabelText("地点搜索结果")).not.toBeInTheDocument()
  })
})
