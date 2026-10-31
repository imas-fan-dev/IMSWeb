import { expect, it } from "vitest"
import {
  cameraChangeSource,
  canonicalCameraPosition,
} from "~/lib/maps/map-camera-change"

it.each(["mousemove", "mouseup", "touchmove", "touchend", "wheel", "keydown"])(
  "accepts the SDK-propagated %s original event and retains its timestamp",
  (type) => {
    const originalEvent = new Event(type)
    expect(cameraChangeSource({ originalEvent })).toEqual({
      origin: "user",
      interactionTime: originalEvent.timeStamp,
    })
  }
)
it("defaults resize, missing metadata and unknown events to programmatic", () => {
  expect(cameraChangeSource()).toEqual({ origin: "programmatic" })
  for (const unknown of [null, 0, "moveend", true, new Event("resize")])
    expect(cameraChangeSource(unknown)).toEqual({ origin: "programmatic" })
  expect(cameraChangeSource({ originalEvent: new Event("resize") })).toEqual({
    origin: "programmatic",
  })
  expect(cameraChangeSource({ originalEvent: { type: "mousemove" } })).toEqual({
    origin: "programmatic",
  })
})
it.each([
  [181, 0, -179],
  [-181, 0, 179],
  [540, 0, -180],
  [0, 0, 0],
])(
  "normalizes world copies without swapping longitude and latitude",
  (lng, lat, expected) => {
    expect(canonicalCameraPosition([lng, lat])).toEqual([expected, lat])
  }
)
it.each([
  [NaN, 0],
  [Infinity, 0],
  [0, NaN],
  [0, Infinity],
  [0, 91],
  [0, -91],
])("rejects invalid WGS84 camera", (lng, lat) => {
  expect(canonicalCameraPosition([lng, lat])).toBeNull()
})
