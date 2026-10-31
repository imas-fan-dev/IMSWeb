import type { MapSearchTarget } from "./map-search"

export type MapPosition = [longitude: number, latitude: number]
export interface MapFocusOptions {
  zoom: number
  duration: number
  signal?: AbortSignal
}
export interface MapBounds {
  west: number
  south: number
  east: number
  north: number
}
export interface MapViewport {
  center: MapPosition
  zoom: number
}
export interface MapScreenPoint {
  x: number
  y: number
}
export interface MapMarker {
  remove(): void
}

export interface MapMarkerOptions {
  element: HTMLElement
  anchor: "bottom" | "center"
  draggable?: boolean
  onDragStart?(): void
  onDragEnd?(target: MapSearchTarget): void
}

export interface MapPointPickerOptions {
  target: MapSearchTarget | null
  disabled: boolean
  onPickStart?(): void
  onPick(target: MapSearchTarget, origin: "click" | "drag"): void
}

/** Business positions/bounds use WGS84. Search targets explicitly own their CRS. */
export interface MapView {
  read(): { zoom: number; bounds: MapBounds }
  /** Transient camera snapshot; native targets retain their coordinate identity. */
  readCamera?(): { target: MapSearchTarget; zoom: number }
  project(positions: MapPosition[]): Promise<MapScreenPoint[]>
  addMarker(
    options: MapMarkerOptions & {
      position: MapPosition
    }
  ): Promise<MapMarker>
  /** False means interrupted: skip any follow-up camera adjustment. */
  focus(position: MapPosition, options: MapFocusOptions): Promise<void | false>
  addSearchMarker(
    options: MapMarkerOptions & {
      target: MapSearchTarget
    }
  ): Promise<MapMarker>
  focusSearch(
    target: MapSearchTarget,
    options: MapFocusOptions
  ): Promise<void | false>
  panBy(offset: MapScreenPoint, duration: number): void
  resize(): void
  destroy(): void
}

export interface MapOpenOptions {
  viewport: MapViewport
  /** Explicit cross-engine handoff overrides provider-local retained views. */
  initialTarget?: MapSearchTarget
  persistViewport?: boolean
  minZoom: number
  signal: AbortSignal
  onChange(change?: import("./map-camera-change").MapCameraChange): void
  onResourceError(): void
  onMapClick?(target: MapSearchTarget): void
}

export interface MapDriver<View extends MapView = MapView> {
  readonly id: string
  /** Provider-owned native attribution positioning, using the host CSS offsets. */
  readonly containerClassName?: string
  /** Resolves when the map is ready; abort disposes pending and ready views. */
  open(container: HTMLDivElement, options: MapOpenOptions): Promise<View>
}
