import { act, fireEvent, screen } from "@testing-library/react"
import { renderPage as render } from "../../../../support/harness"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { MapPlaceSearcher, MapSearchPlace } from "~/lib/maps/map-search"
import { usePlaceSearch } from "~/pages/community/exchange/hooks/use-place-search"
import { ExchangeWebMapWorkspace } from "~/pages/community/exchange/components/exchange-web-map-workspace"

const place: MapSearchPlace = {
  id: "shanghai",
  label: "上海市",
  address: "上海市，中国",
  distanceLabel: "距你 25 米",
  distanceMeters: 25,
  target: { kind: "wgs84", position: [121.5, 31.2] },
}
const select = vi.fn()
const noop = () => {}
function Harness({
  searcher,
  automatic = true,
  selectionKey = null,
}: {
  searcher: MapPlaceSearcher
  automatic?: boolean
  selectionKey?: string | null
}) {
  const model = usePlaceSearch(searcher)
  return (
    <ExchangeWebMapWorkspace
      model={model}
      searchOwner={searcher}
      automatic={automatic}
      available
      tools={{
        onOpenFilter: noop,
        onOpenOffices: noop,
        onOpenCards: noop,
        onRefresh: noop,
      }}
      selectionKey={selectionKey}
      selectedPlace={null}
      selectedAttribution=""
      onSelect={select}
      onClear={noop}
      onOcclusion={noop}
    />
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

it("collapses search for a map point without losing the input or queued search", async () => {
  const searcher = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place],
    attribution: "Map source",
  }))
  const view = render(<Harness searcher={searcher} />)
  const input = screen.getByRole("textbox", { name: "搜索地点" })
  fireEvent.change(input, { target: { value: "上海" } })
  view.rerender(<Harness searcher={searcher} selectionKey="shanghai" />)
  expect(screen.getByRole("button", { name: "展开地图面板" })).toHaveAttribute(
    "aria-expanded",
    "false"
  )
  await advance(350)
  expect(searcher).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("textbox", { name: "搜索地点" })).toBe(input)
  expect(input).toHaveValue("上海")
  expect(
    screen.queryByRole("button", { name: /上海市 上海市/ })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "展开地图面板" }))
  expect(screen.getByRole("button", { name: /上海市 上海市/ })).toBeVisible()
})

it("shows results, distance and attribution without a success explanation banner", async () => {
  const notice = "地图中心附近 3 公里内没有匹配结果，已扩大到全国关键词搜索。"
  const searcher = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place],
    attribution: "© 高德地图",
    notice,
  }))
  render(<Harness searcher={searcher} />)
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地点" }), {
    target: { value: "上海" },
  })
  await advance(350)
  expect(
    screen.getByRole("button", { name: /上海市.*距你 25 米/ })
  ).toBeVisible()
  expect(screen.getByText("© 高德地图")).toBeVisible()
  expect(screen.queryByText(notice)).not.toBeInTheDocument()
  expect(
    document.querySelector('.exchange-search-status[data-kind="notice"]')
  ).toBeNull()
})

it("keeps the same editable input while debouncing, selecting and collapsing results", async () => {
  const searcher = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place],
    attribution: "Map source",
  }))
  render(<Harness searcher={searcher} />)
  const input = screen.getByRole("textbox", { name: "搜索地点" })
  expect(screen.getByRole("button", { name: "展开地图面板" })).toHaveAttribute(
    "aria-expanded",
    "false"
  )
  input.focus()
  fireEvent.change(input, { target: { value: "上海" } })
  await advance(349)
  expect(searcher).not.toHaveBeenCalled()
  await advance(1)
  expect(searcher).toHaveBeenCalledTimes(1)
  expect(searcher.mock.calls[0]?.[2]).toBeUndefined()
  expect(screen.getByRole("button", { name: /距你 25 米/ })).toBeVisible()
  expect(input).toHaveFocus()
  fireEvent.click(
    screen.getByRole("button", { name: "上海市 上海市，中国 · 距你 25 米" })
  )
  expect(select).toHaveBeenCalledWith(place)
  expect(input).toHaveValue("上海市")
  expect(input).toHaveFocus()
  fireEvent.click(screen.getByRole("button", { name: "展开地图面板" }))
  fireEvent.click(screen.getByRole("button", { name: "收起地图面板" }))
  expect(screen.getByRole("button", { name: "展开地图面板" })).toHaveAttribute(
    "aria-expanded",
    "false"
  )
  expect(screen.getByRole("textbox", { name: "搜索地点" })).toBe(input)
  expect(document.querySelector(".exchange-web-drawer")).toHaveAttribute(
    "inert"
  )
  await advance(500)
  expect(searcher).toHaveBeenCalledTimes(1)
})

it("defers requests during Chinese composition and cancels superseded work", async () => {
  let finish!: (value: Awaited<ReturnType<MapPlaceSearcher>>) => void
  const searcher = vi
    .fn<MapPlaceSearcher>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    .mockResolvedValue({ items: [], attribution: "current" })
  render(<Harness searcher={searcher} />)
  const input = screen.getByRole("textbox", { name: "搜索地点" })
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: "shanghai" } })
  await advance(600)
  expect(searcher).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input, { target: { value: "上海" } })
  await advance(350)
  expect(searcher).toHaveBeenCalledTimes(1)
  expect(input).not.toBeDisabled()
  fireEvent.change(input, { target: { value: "北京" } })
  expect(searcher.mock.calls[0]![1].aborted).toBe(true)
  await act(async () => {
    finish({ items: [place], attribution: "old" })
  })
  expect(
    screen.queryByRole("button", { name: /上海市/ })
  ).not.toBeInTheDocument()
  await advance(350)
  expect(searcher.mock.calls[1]![0]).toBe("北京")
  expect(screen.getByText("没有找到地点")).toBeVisible()
})

it("opens results while typing but requires explicit submission for Nominatim", async () => {
  const searcher = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place],
    attribution: "© OpenStreetMap contributors",
  }))
  render(<Harness searcher={searcher} automatic={false} />)
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地点" }), {
    target: { value: "上海" },
  })
  await advance(1000)
  expect(searcher).not.toHaveBeenCalled()
  expect(screen.getByText("输入后按回车，或点击搜索。")).toBeVisible()
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))
  })
  expect(searcher).toHaveBeenCalledTimes(1)
  expect(screen.getByText("© OpenStreetMap contributors")).toBeVisible()
})

it("retires a queued search when its source changes or the workspace unmounts", async () => {
  const first = vi.fn<MapPlaceSearcher>(async () => ({
    items: [],
    attribution: "first",
  }))
  const second = vi.fn<MapPlaceSearcher>(async () => ({
    items: [],
    attribution: "second",
  }))
  const view = render(<Harness searcher={first} />)
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地点" }), {
    target: { value: "上海" },
  })
  view.rerender(<Harness searcher={second} />)
  await advance(500)
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: "搜索地点" })).toHaveValue("上海")
  fireEvent.change(screen.getByRole("textbox", { name: "搜索地点" }), {
    target: { value: "北京" },
  })
  view.unmount()
  await advance(500)
  expect(second).not.toHaveBeenCalled()
})
