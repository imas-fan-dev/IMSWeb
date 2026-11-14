import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import { makeFudabaOffice } from "@/mocks/data/fudaba"
import { useMapWorkspaceSearch } from "~/pages/community/exchange/hooks/use-map-workspace-search"
import { ExchangeSearchCard } from "~/pages/community/exchange/components/exchange-search-card"
import { ExchangeWebMapWorkspace } from "~/pages/community/exchange/components/exchange-web-map-workspace"
import type { MapPlaceSearcher } from "~/lib/maps/map-search"

const api = vi.hoisted(() => ({ page: vi.fn(), select: vi.fn() }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaOfficePage: api.page,
}))
const placeSearcher: MapPlaceSearcher = async () => ({
  items: [
    {
      id: "place:1",
      label: "上海地点",
      address: "徐汇区",
      distanceLabel: "距你 25 米",
      target: { kind: "wgs84", position: [121, 31] },
    },
  ],
  attribution: "Mapbox",
})
const noop = () => {}
const tools = {
  onOpenFilter: noop,
  onOpenOffices: noop,
  onOpenCards: noop,
  onRefresh: noop,
}
function Harness({
  mobile,
  automatic = false,
}: {
  mobile: boolean
  automatic?: boolean
}) {
  const search = useMapWorkspaceSearch(placeSearcher)
  return mobile ? (
    <ExchangeSearchCard
      {...tools}
      tabs={search.tabs}
      model={search.model}
      selectedPlace={null}
      onSelect={api.select}
      onClear={noop}
      pointCount={0}
      onOcclusion={noop}
    />
  ) : (
    <ExchangeWebMapWorkspace
      tools={tools}
      tabs={search.tabs}
      model={search.model}
      searchOwner={search.owner}
      available={search.available}
      automatic={automatic}
      selectionKey={null}
      selectedPlace={null}
      selectedAttribution=""
      onSelect={api.select}
      onClear={noop}
      onOcclusion={noop}
    />
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  api.page.mockReturnValue({
    send: async () => ({
      items: [
        makeFudabaOffice({
          name: "上海事务所",
          location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
        }),
      ],
      pageInfo: { hasNextPage: false, nextCursor: null },
    }),
    abort: vi.fn(),
  })
})
it.each([false, true])(
  "retains one input and separates office/place results on mobile=%s",
  async (mobile) => {
    const user = userEvent.setup()
    renderPage(<Harness mobile={mobile} />)
    if (mobile)
      await user.click(screen.getByRole("button", { name: "查找事务所" }))
    const input = screen.getByRole("textbox", { name: "搜索事务所" })
    await user.type(input, "上海")
    await user.keyboard("{Enter}")
    expect(
      await screen.findByRole("button", { name: /上海事务所/ })
    ).toBeVisible()
    expect(screen.getByRole("tab", { name: "事务所" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await user.click(screen.getByRole("tab", { name: "地点" }))
    expect(
      await screen.findByRole("button", { name: /上海地点.*距你 25 米/ })
    ).toBeVisible()
    expect(screen.getByRole("textbox", { name: "搜索地点" })).toBe(input)
    expect(input).toHaveValue("上海")
    expect(
      screen.queryByRole("button", { name: /上海事务所/ })
    ).not.toBeInTheDocument()
    await user.keyboard("{ArrowLeft}")
    expect(
      await screen.findByRole("button", { name: /上海事务所/ })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: /上海事务所/ }))
    expect(api.select).toHaveBeenCalledWith(
      expect.objectContaining({
        office: expect.objectContaining({ name: "上海事务所" }),
      })
    )
  }
)

it("keeps an automatic pending query on Enter and cancels it when edited", async () => {
  const user = userEvent.setup()
  const requests: {
    resolve: (value: unknown) => void
    abort: ReturnType<typeof vi.fn>
  }[] = []
  api.page.mockImplementation(() => {
    let resolve!: (value: unknown) => void
    const response = new Promise((done) => {
      resolve = done
    })
    const abort = vi.fn().mockResolvedValue(undefined)
    requests.push({ resolve, abort })
    return { send: () => response, abort }
  })
  renderPage(<Harness mobile={false} automatic />)
  const input = screen.getByRole("textbox", { name: "搜索事务所" })
  await user.type(input, "上海")
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await user.keyboard("{Enter}")
  expect(requests[0].abort).not.toHaveBeenCalled()
  expect(api.page).toHaveBeenCalledTimes(1)
  await user.clear(input)
  await user.type(input, "北京")
  expect(requests[0].abort).toHaveBeenCalledTimes(1)
  await user.keyboard("{Enter}")
  expect(requests).toHaveLength(2)
  const page = (name: string) => ({
    items: [
      makeFudabaOffice({
        name,
        location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
      }),
    ],
    pageInfo: { hasNextPage: false, nextCursor: null },
  })
  await act(async () => {
    requests[1].resolve(page("北京事务所"))
  })
  expect(
    await screen.findByRole("button", { name: /北京事务所/ })
  ).toBeVisible()
  await act(async () => {
    requests[0].resolve(page("上海事务所"))
  })
  expect(
    screen.queryByRole("button", { name: /上海事务所/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: /北京事务所/ })).toBeVisible()
})
