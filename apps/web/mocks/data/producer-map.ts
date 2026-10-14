import type {
  ProducerMapCommunity,
  ProducerMapContent,
  ProducerMapRegion,
} from "@imsweb/contracts/producer-map"

export function makeProducerMapRegion(
  overrides: Partial<ProducerMapRegion> = {}
): ProducerMapRegion {
  return {
    id: "gd",
    province: "广东",
    name: "广东",
    summary: "",
    contact: "",
    linkUrl: "https://example.com/gd",
    imageUrl: "/producer-map/gd.webp",
    series: "all",
    enabled: true,
    ...overrides,
  }
}

export function makeProducerMapCommunity(
  overrides: Partial<ProducerMapCommunity> = {}
): ProducerMapCommunity {
  return {
    id: "c1",
    name: "社群",
    platform: "QQ",
    region: "广东",
    description: "",
    contact: "",
    linkUrl: null,
    imageUrl: null,
    series: "765",
    enabled: true,
    ...overrides,
  }
}

export function makeProducerMapContent(
  overrides: Partial<ProducerMapContent> = {}
): ProducerMapContent {
  return {
    version: 1,
    title: "",
    subtitle: "",
    introduction: "",
    directoryTitle: "",
    mapSourceLabel: "",
    mapSourceUrl: "https://example.com/source",
    regions: [makeProducerMapRegion()],
    communities: [makeProducerMapCommunity()],
    updatedAt: null,
    ...overrides,
  }
}
