import type { MapSearchPlace } from "~/lib/maps/map-search"
import type { MapPosition } from "~/lib/maps/map-engine"
import type { ExchangeMapAttribution } from "./exchange-map-attribution"
import type {
  FudabaMapOfficeGroup,
  splitViewportBounds,
} from "./exchange-map-model"

/** Offices and bounds use WGS84; display-only search targets carry their CRS. */
export interface ExchangeMapInteractionProps {
  groups: FudabaMapOfficeGroup[]
  selectedGroupKey: string | null
  /** An explicit list selection, separate from passive marker highlighting. */
  groupFocus?: { key: string; sequence: number } | null
  selectedPlace?: MapSearchPlace | null
  occlusion?: { x: number; y: number; width: number; height: number } | null
  attributionPlacement?: "corner" | "avoid-overlay"
  /** One page-owned attempt; its signal retires a late result after selection. */
  claimInitialLocation?: () => AbortSignal | null
  onDevicePosition?(position: MapPosition): void
  onSearchViewportCenter?(position: MapPosition): void
  onSelectGroup: (groupKey: string) => void
  onViewportChange: (bounds: ReturnType<typeof splitViewportBounds>) => void
  onFatalError: (error: Error) => void
  onRetry?: () => void
  onClearSearchSelection?: () => void
  onAttributionChange?: (value: ExchangeMapAttribution | null) => void
}
