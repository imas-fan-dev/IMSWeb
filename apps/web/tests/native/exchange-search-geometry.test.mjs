import { test } from "node:test"
import assert from "node:assert/strict"
import {
  verifySideGeometry,
  verifySummaryGeometry,
  verifyEssentialGeometry,
  verifyReadingScroll,
} from "./verify-exchange-side-geometry.mjs"

const node = (id, x, y, w, h) => ({
  "resource-id": id,
  bounds: `[${x},${y}][${x + w},${y + h}]`,
})
const capture = (width, locate = true) => [
  node("ims-native-exchange-search", 8, 500, width - 16, 180),
  node(
    "ims-native-exchange-side-controls",
    width - 56,
    locate ? 392 : 440,
    48,
    locate ? 96 : 48
  ),
  node("ims-native-exchange-refresh", width - 56, locate ? 392 : 440, 48, 48),
  ...(locate ? [node("locate", width - 56, 440, 48, 48)] : []),
]

for (const width of [402, 440]) {
  test(`${width}pt grouped locate has distinct targets across suppression`, () => {
    verifySideGeometry(capture(width), true)
    verifySideGeometry(capture(width, false), false)
    verifySideGeometry(capture(width), true)
  })
  test(`${width}pt rejects the overlapping original geometry`, () => {
    const nodes = capture(width)
    nodes[3] = node("locate", width - 56, 392, 48, 48)
    assert.throws(() => verifySideGeometry(nodes, true), /distinct contiguous/)
  })
}

for (const bottom of [166, 204]) {
  test(`landscape ${bottom}pt card pins essentials while footer intentionally scrolls`, () => {
    const header = [
      node("ims-native-exchange-search", 8, 8, 420, bottom - 8),
      node("ims-native-exchange-search-input", 62, 8, 310, 48),
      node("ims-native-exchange-cancel", 376, 10, 44, 44),
      node("ims-native-exchange-submit", 62, 60, 354, 44),
      node("ims-native-exchange-reading-viewport", 20, 108, 396, bottom - 120),
    ]
    const before = [
      ...header,
      node("ims-native-exchange-more-expanded", 62, 188, 172, 44),
    ]
    const after = [
      ...header,
      node("ims-native-exchange-more-expanded", 62, bottom - 56, 172, 44),
    ]
    verifyEssentialGeometry(before)
    verifyReadingScroll(before, after)
    assert.throws(
      () => verifyReadingScroll(before, before),
      /full footer target/
    )
    const shifted = after.map((entry) => ({ ...entry }))
    shifted[1] = node("ims-native-exchange-search-input", 62, -20, 310, 48)
    assert.throws(() => verifyReadingScroll(before, shifted), /fully visible/)
  })
}
test("rejects duplicate and stale locate targets", () => {
  const nodes = capture(402)
  assert.throws(
    () => verifySideGeometry([...nodes, nodes[3]], true),
    /locate lifecycle/
  )
  assert.throws(() => verifySideGeometry(nodes, false), /locate lifecycle/)
})
test("landscape docks side controls clear of the search surface", () => {
  const nodes = [
    node("ims-native-exchange-search", 8, 100, 420, 180),
    node("ims-native-exchange-side-controls", 818, 184, 48, 96),
    node("ims-native-exchange-refresh", 818, 184, 48, 48),
    node("locate", 818, 232, 48, 48),
  ]
  verifySideGeometry(nodes, true, true)
  nodes[1] = node("ims-native-exchange-side-controls", 430, 184, 48, 96)
  nodes[2] = node("ims-native-exchange-refresh", 430, 184, 48, 48)
  nodes[3] = node("locate", 430, 232, 48, 48)
  assert.throws(() => verifySideGeometry(nodes, true, true), /clear the card/)
})

for (const width of [402, 440]) {
  for (const long of [false, true]) {
    test(`${width}pt ${long ? "long" : "ordinary"} summary has a bounded complete reading path`, () => {
      const name = long ? "Selected long name ".repeat(8) : "Native Hall 1"
      const address = long
        ? "Shanghai local fixture address 1. ".repeat(10)
        : "Shanghai"
      const summary = {
        ...node(
          "ims-native-exchange-selected-summary",
          68,
          510,
          width - 184,
          long ? 600 : 60
        ),
        accessibilityText: `${name}, ${address}`,
      }
      const nodes = [...capture(width), summary]
      verifySummaryGeometry(nodes, name, address)
      assert.throws(
        () => verifySummaryGeometry([...nodes, summary], name, address),
        /one persistent/
      )
      summary.accessibilityText = name
      assert.throws(
        () => verifySummaryGeometry(nodes, name, address),
        /complete selected address/
      )
    })
  }
}
