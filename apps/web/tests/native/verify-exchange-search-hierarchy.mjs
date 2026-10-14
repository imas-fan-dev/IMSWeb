import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import process from "node:process"
import console from "node:console"
import {
  verifySideGeometry,
  verifySummaryGeometry,
  verifyEssentialGeometry,
} from "./verify-exchange-side-geometry.mjs"

const [path, state, selectedName, selectedAddress] = process.argv.slice(2)
assert(
  path && state,
  "Usage: node verify-exchange-search-hierarchy.mjs <json> <state>"
)
const tree = JSON.parse(readFileSync(path, "utf8"))
const nodes = []
function visit(node) {
  if (node.attributes) nodes.push(node.attributes)
  for (const child of node.children ?? []) visit(child)
}
visit(tree)
const byId = (id) => nodes.filter((node) => node["resource-id"] === id)
const box = (node) => {
  const values = node.bounds.match(/-?\d+(?:\.\d+)?/g).map(Number)
  return {
    left: values[0],
    top: values[1],
    right: values[2],
    bottom: values[3],
    width: values[2] - values[0],
    height: values[3] - values[1],
  }
}
const panel = byId("ims-native-exchange-search")
const input = byId("ims-native-exchange-search-input")
const bar = byId("ims-native-liquid-glass-tab-bar")
const keyboard = byId("inputView")
if (["modal", "route"].includes(state)) {
  assert.equal(panel.length, 0, "native search host must leave the hierarchy")
  assert.equal(input.length, 0, "native search input must leave the hierarchy")
  assert.equal(keyboard.length, 0, "native keyboard must be dismissed")
  for (const id of [
    "ims-native-exchange-side-controls",
    "ims-native-exchange-refresh",
    "locate",
  ]) {
    assert.equal(byId(id).length, 0, "side controls must leave with the host")
  }
  if (state === "route") assert.equal(bar.length, 1)
} else {
  assert.equal(panel.length, 1, "exactly one native search host")
  assert.equal(
    nodes.filter((node) => node.accessibilityText === "地点查找, region")
      .length,
    0,
    "the DOM card must not remain in the native accessibility tree"
  )
  const more = nodes.filter(
    (node) => node.accessibilityText === "更多" && box(node).width >= 40
  )
  assert.equal(
    more.length,
    1,
    "one native More button, excluding its title label"
  )
  assert(
    box(more[0]).width >= 44 && box(more[0]).height >= 44,
    "More target >=44pt"
  )
  if (
    [
      "collapsed",
      "selected",
      "collapsed-landscape",
      "selected-landscape",
    ].includes(state)
  ) {
    verifySideGeometry(nodes, true, state.endsWith("landscape"))
    assert.equal(input.length, 0)
    assert.equal(bar.length, 1)
    assert.equal(keyboard.length, 0)
    const search = byId("ims-native-exchange-selected-summary")
    assert.equal(search.length, 1)
    assert(
      box(search[0]).height >= 48,
      "collapsed search row must retain its 48pt height"
    )
    assert(
      box(panel[0]).bottom <= box(bar[0]).top,
      "collapsed card clears native tabs"
    )
    if (state.startsWith("selected")) {
      assert(
        selectedName && selectedAddress,
        "selected checks require complete expected name and address"
      )
      verifySummaryGeometry(nodes, selectedName, selectedAddress)
      assert(
        search[0].accessibilityText.length > 0,
        "selected summary keeps its accessible reading path"
      )
      assert(box(search[0]).width > 100, "rectangular selected text region")
      assert.equal(byId("ims-native-exchange-selected-reading").length, 0)
    }
  } else {
    verifySideGeometry(nodes, false, state.endsWith("landscape"))
    assert.equal(input.length, 1)
    assert.equal(bar.length, 0)
    assert(box(input[0]).height >= 48, "native search input height >=48pt")
    if (state === "selected-expanded") {
      assert(
        selectedName && selectedAddress,
        "expanded checks require complete expected name and address"
      )
      for (const text of [selectedName, selectedAddress]) {
        assert(
          nodes.some((node) => node.accessibilityText === text),
          "expanded header exposes complete selected text"
        )
      }
    }
    if (state === "editing-landscape") verifyEssentialGeometry(nodes)
    if (["editing", "editing-landscape"].includes(state)) {
      assert.equal(keyboard.length, 1, "real UIKit keyboard is present")
      assert(
        box(panel[0]).bottom <= box(keyboard[0]).top - 12,
        "12pt keyboard clearance"
      )
      if (state === "editing") {
        assert.equal(
          input[0].value,
          "Shanghai",
          "native draft survived model snapshots"
        )
      }
      const submit = nodes.filter(
        (node) => node.accessibilityText === "查找" && box(node).height >= 40
      )
      assert.equal(submit.length, 1)
      assert.equal(
        submit[0].enabled,
        "true",
        "two-character minimum enables native submit"
      )
    } else assert.equal(keyboard.length, 0)
  }
}
console.log(`PASS native hierarchy ${state}: ${path}`)
