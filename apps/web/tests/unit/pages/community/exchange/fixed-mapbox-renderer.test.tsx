import { expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { FudabaRegionalProviderMapConfig } from "@imsweb/contracts/fudaba/map-delivery"
import { createMapRenderer } from "~/pages/community/exchange/map-providers/regional"
const mocks = vi.hoisted(() => ({ config: null as unknown }))
vi.mock("~/pages/community/exchange/map-providers/mapbox", () => ({
  createMapRenderer(config: unknown) {
    mocks.config = config
    return () => <div>Mapbox fixed basemap</div>
  },
}))
it("retains the configured Mapbox renderer regardless of search region", () => {
  const config: FudabaRegionalProviderMapConfig = {
    provider: "regional",
    defaultRegion: "mainland",
    mainland: {
      provider: "amap",
      apiKey: "public-key-1234567890",
      securityProxyUrl: "/_AMapService",
      mapStyle: "amap://styles/normal",
    },
    overseas: {
      provider: "mapbox",
      accessToken: "pk.public-token-1234567890",
      styleUrl: "mapbox://styles/owner/custom",
    },
    search: {
      provider: "federated",
      mainland: {
        provider: "amap",
        apiKey: "public-key-1234567890",
        securityProxyUrl: "/_AMapService",
      },
      overseas: {
        provider: "mapbox",
        accessToken: "pk.public-token-1234567890",
      },
    },
  }
  const Renderer = createMapRenderer(config)
  render(
    <Renderer
      groups={[]}
      selectedGroupKey={null}
      onSelectGroup={vi.fn()}
      onViewportChange={vi.fn()}
      onFatalError={vi.fn()}
    />
  )
  expect(mocks.config).toBe(config.overseas)
  expect(screen.getByText("Mapbox fixed basemap")).toBeVisible()
  expect(
    screen.queryByRole("group", { name: "地图区域" })
  ).not.toBeInTheDocument()
})
