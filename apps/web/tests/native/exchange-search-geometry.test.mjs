import { test } from "node:test"
import assert from "node:assert/strict"
import {
  verifySideGeometry,
  verifySummaryGeometry,
  verifyEssentialGeometry,
  verifyReadingScroll,
  verifyFocusedGeometry,
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

test("focused search has no refresh, locate, or shared skin", () => {
  verifyFocusedGeometry([node("ims-native-exchange-search", 8, 62, 386, 500)])
  for (const id of [
    "ims-native-exchange-refresh",
    "locate",
    "ims-native-exchange-side-controls",
  ]) {
    assert.throws(
      () => verifyFocusedGeometry([node(id, 340, 70, 48, 48)]),
      /absent throughout/
    )
  }
})

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
      node("ims-native-exchange-search-input", 20, 8, 300, 48),
      node("ims-native-exchange-cancel", 376, 10, 44, 44),
      node("ims-native-exchange-submit", 324, 10, 44, 44),
      node("ims-native-exchange-reading-viewport", 20, 68, 396, bottom - 80),
    ]
    const before = [
      ...header,
      node("ims-native-exchange-more-expanded", 62, 188, 172, 44),
    ]
    const after = [
      ...header,
      node("ims-native-exchange-more-expanded", 62, bottom - 56, 172, 44),
    ]
    verifyEssentialGeometry(before, bottom - 8)
    verifyReadingScroll(before, after)
    assert.throws(
      () => verifyReadingScroll(after, after),
      /reading content moves/
    )
    assert.throws(
      () => verifyReadingScroll(before, before),
      /full footer target/
    )
    const shifted = after.map((entry) => ({ ...entry }))
    shifted[1] = node("ims-native-exchange-search-input", 20, -20, 300, 48)
    assert.throws(() => verifyReadingScroll(before, shifted), /fully visible/)
    shifted[1] = node("ims-native-exchange-search-input", 20, 9, 300, 48)
    assert.throws(() => verifyReadingScroll(before, shifted), /stays fixed/)
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
          500,
          width - 184,
          long ? 84 : 44
        ),
        accessibilityText: `${name}, ${address}`,
      }
      const nodes = [
        node("ims-native-exchange-search", 8, 500, width - 72, long ? 84 : 44),
        summary,
      ]
      verifySummaryGeometry(nodes, name, address)
      assert.throws(
        () => verifySummaryGeometry([...nodes, summary], name, address),
        /one persistent/
      )
      const clipped = {
        ...summary,
        ...node(
          "ims-native-exchange-selected-summary",
          68,
          501,
          width - 184,
          long ? 84 : 44
        ),
      }
      assert.throws(
        () => verifySummaryGeometry([nodes[0], clipped], name, address),
        /fits its capsule/
      )
      const small = {
        ...summary,
        ...node(
          "ims-native-exchange-selected-summary",
          68,
          500,
          width - 184,
          40
        ),
      }
      assert.throws(
        () => verifySummaryGeometry([nodes[0], small], name, address),
        /rectangular summary target/
      )
      summary.accessibilityText = name
      assert.throws(
        () => verifySummaryGeometry(nodes, name, address),
        /complete selected address/
      )
    })
  }
}

for (const available of [259, 260]) {
  test(`${available}pt viewport verifies submit placement and rejects overlapping essentials`, () => {
    const inline = available < 260
    const nodes = [
      node("ims-native-exchange-search", 8, 8, 420, available),
      node("ims-native-exchange-search-input", 20, 8, inline ? 300 : 350, 48),
      node(
        "ims-native-exchange-submit",
        inline ? 324 : 20,
        inline ? 10 : 68,
        inline ? 44 : 396,
        44
      ),
      node("ims-native-exchange-cancel", 376, 10, 44, 44),
      node(
        "ims-native-exchange-reading-viewport",
        20,
        inline ? 68 : 124,
        396,
        100
      ),
    ]
    verifyEssentialGeometry(nodes, available)
    assert.throws(
      () => verifyEssentialGeometry(nodes, inline ? 260 : 259),
      /beside input/
    )
    nodes[2] = node("ims-native-exchange-submit", 20, 10, 44, 44)
    assert.throws(() => verifyEssentialGeometry(nodes), /do not overlap/)
  })
}
