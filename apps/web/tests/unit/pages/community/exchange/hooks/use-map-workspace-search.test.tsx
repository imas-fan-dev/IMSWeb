import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { makeFudabaOffice } from "@/mocks/data/fudaba"
import { useMapWorkspaceSearch } from "~/pages/community/exchange/hooks/use-map-workspace-search"
import type { MapPlaceSearcher } from "~/lib/maps/map-search"

const api = vi.hoisted(() => ({ page: vi.fn() }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaOfficePage: api.page,
}))
const office = makeFudabaOffice({
  id: "office-1",
  name: "上海事务所",
  location: { latitude: 31.2, longitude: 121.5, precision: "regional" },
})
beforeEach(() => {
  vi.clearAllMocks()
  api.page.mockReturnValue({
    send: async () => ({
      items: [office],
      pageInfo: { hasNextPage: false, nextCursor: null },
    }),
    abort: vi.fn(),
  })
})

it("defaults to global office search even without a map provider", async () => {
  const hook = renderHook(() => useMapWorkspaceSearch(null))
  expect(hook.result.current.tabs.active).toBe("offices")
  expect(hook.result.current.available).toBe(true)
  await act(async () => {
    await hook.result.current.model.submit("上海")
  })
  expect(api.page).toHaveBeenCalledWith({
    q: "上海",
    limit: 20,
    cursor: undefined,
  })
  expect(hook.result.current.model.results[0]).toMatchObject({
    id: "office:office-1",
    label: "上海事务所",
    office,
  })
})

it("keeps unlocated offices visible but prevents a guessed map destination", async () => {
  api.page.mockReturnValueOnce({
    send: async () => ({
      items: [{ ...office, location: null }],
      pageInfo: { hasNextPage: false, nextCursor: null },
    }),
    abort: vi.fn(),
  })
  const hook = renderHook(() => useMapWorkspaceSearch(null))
  await act(async () => {
    await hook.result.current.model.submit("上海")
  })
  expect(hook.result.current.model.results[0]).toMatchObject({
    disabled: true,
    address: expect.stringContaining("暂未公开地图位置"),
  })
})

it("keeps the query across tabs, advances native revision and cancels stale place results", async () => {
  let finish!: (value: { items: []; attribution: string }) => void
  let signal!: AbortSignal
  const places = vi.fn<MapPlaceSearcher>((_query, nextSignal) => {
    signal = nextSignal
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const hook = renderHook(() => useMapWorkspaceSearch(places))
  await act(async () => {
    await hook.result.current.model.submit("上海")
  })
  const revision = hook.result.current.model.revision
  act(() => hook.result.current.tabs.onChange("places"))
  expect(hook.result.current.model.query).toBe("上海")
  expect(places).toHaveBeenCalledOnce()
  expect(hook.result.current.model.revision).toBeGreaterThan(revision)
  act(() => hook.result.current.tabs.onChange("offices"))
  expect(signal.aborted).toBe(true)
  await act(async () => {
    finish({ items: [], attribution: "old provider" })
  })
  await waitFor(() => expect(hook.result.current.model.busy).toBe(false))
  expect(hook.result.current.tabs.active).toBe("offices")
  expect(hook.result.current.model.results[0]?.label).toBe("上海事务所")
  expect(hook.result.current.model.attribution).toBe("")
})

it("loads another office page and removes its cursor when the query changes", async () => {
  api.page.mockReturnValueOnce({
    send: async () => ({
      items: [office],
      pageInfo: { hasNextPage: true, nextCursor: "next" },
    }),
    abort: vi.fn(),
  })
  const hook = renderHook(() => useMapWorkspaceSearch(null))
  await act(async () => {
    await hook.result.current.model.submit("上海")
  })
  expect(hook.result.current.tabs.hasMore).toBe(true)
  await act(async () => {
    await hook.result.current.model.loadMore()
  })
  expect(api.page).toHaveBeenLastCalledWith({
    q: "上海",
    limit: 20,
    cursor: "next",
  })
  expect(hook.result.current.model.results).toHaveLength(2)
  act(() => hook.result.current.model.edit("北京"))
  expect(hook.result.current.tabs.hasMore).toBe(false)
})
