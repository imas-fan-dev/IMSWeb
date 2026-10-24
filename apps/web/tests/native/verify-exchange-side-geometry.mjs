import assert from "node:assert/strict"

export function bounds(node) {
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

// Operates on real UIKit hierarchy captures; caller supplies the lifecycle state.
export function verifyFocusedGeometry(nodes) {
  for (const id of [
    "ims-native-exchange-side-controls",
    "ims-native-exchange-refresh",
    "locate",
  ]) {
    assert.equal(
      nodes.filter((node) => node["resource-id"] === id).length,
      0,
      `${id} absent throughout focused presentation`
    )
  }
}

export function verifySideGeometry(nodes, expectsLocate, landscape = false) {
  const byId = (id) => nodes.filter((node) => node["resource-id"] === id)
  const side = byId("ims-native-exchange-side-controls")
  const refresh = byId("ims-native-exchange-refresh")
  const locate = byId("locate")
  assert.equal(side.length, 1, "one shared side surface")
  assert.equal(refresh.length, 1, "one refresh action")
  assert.equal(
    locate.length,
    expectsLocate ? 1 : 0,
    "locate lifecycle/identity"
  )
  const skin = bounds(side[0])
  const top = bounds(refresh[0])
  assert.equal(skin.width, 48)
  assert.equal(skin.height, expectsLocate ? 96 : 48)
  assert.equal(top.width, 48)
  assert.equal(top.height, 48)
  assert.equal(top.left, skin.left)
  assert.equal(top.top, skin.top)
  if (expectsLocate) {
    const bottom = bounds(locate[0])
    assert.equal(bottom.width, 48)
    assert.equal(bottom.height, 48)
    assert.equal(bottom.left, top.left)
    assert.equal(bottom.top, top.bottom, "distinct contiguous 48pt targets")
    assert.equal(bottom.bottom, skin.bottom)
  }
  const panel = byId("ims-native-exchange-search")
  assert.equal(panel.length, 1)
  const card = bounds(panel[0])
  assert(
    landscape ? skin.left >= card.right + 12 : skin.bottom <= card.top - 12,
    "side controls clear the card by 12pt"
  )
}

export function verifySummaryGeometry(nodes, name, address) {
  const summary = nodes.filter(
    (node) => node["resource-id"] === "ims-native-exchange-selected-summary"
  )
  const panel = nodes.filter(
    (node) => node["resource-id"] === "ims-native-exchange-search"
  )
  assert.equal(summary.length, 1, "one persistent selected action")
  assert.equal(panel.length, 1)
  const text = summary[0].accessibilityText
  assert(text.includes(name), "complete selected name")
  assert(text.includes(address), "complete selected address")
  const target = bounds(summary[0])
  const card = bounds(panel[0])
  assert(
    target.width > 100 && target.height >= 44,
    "fitted rectangular summary target"
  )
  assert(
    target.left >= card.left + 12 && target.right <= card.right - 12,
    "summary fits card width"
  )
  assert(
    target.top >= card.top && target.bottom <= card.bottom,
    "complete summary target fits its capsule"
  )
}

export function verifyEssentialGeometry(nodes, availableHeight) {
  const one = (id) => {
    const matches = nodes.filter((node) => node["resource-id"] === id)
    assert.equal(matches.length, 1, `one ${id}`)
    return bounds(matches[0])
  }
  const panel = one("ims-native-exchange-search")
  const viewport = one("ims-native-exchange-reading-viewport")
  const ids = [
    "ims-native-exchange-search-input",
    "ims-native-exchange-submit",
    "ims-native-exchange-cancel",
  ]
  const targets = ids.map(one)
  for (const [index, target] of targets.entries()) {
    const id = ids[index]
    assert(target.width >= 44 && target.height >= 44, `${id} target >=44pt`)
    assert(
      target.top >= panel.top &&
        target.bottom <= panel.bottom &&
        target.left >= panel.left &&
        target.right <= panel.right,
      `${id} fully visible at initial offset`
    )
    assert(target.bottom <= viewport.top, `${id} remains above reading content`)
  }
  const overlaps = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      assert(
        !overlaps(targets[i], targets[j]),
        "essential targets do not overlap"
      )
  if (availableHeight !== undefined) {
    const [input, submit] = targets
    const inline = input.top < submit.bottom && input.bottom > submit.top
    assert.equal(
      inline,
      availableHeight < 260,
      "short viewport keeps submit beside input"
    )
    if (!inline)
      assert(
        submit.top >= input.bottom + 12,
        "separate submit keeps its input gap"
      )
  }
  assert(
    viewport.height >= 44 && viewport.bottom <= panel.bottom,
    "bounded middle viewport >=44pt"
  )
}

export function verifyReadingScroll(before, after) {
  verifyEssentialGeometry(before)
  verifyEssentialGeometry(after)
  for (const id of [
    "ims-native-exchange-search",
    "ims-native-exchange-search-input",
    "ims-native-exchange-submit",
    "ims-native-exchange-cancel",
  ]) {
    const find = (nodes) => nodes.find((node) => node["resource-id"] === id)
    assert.equal(
      find(before).bounds,
      find(after).bounds,
      `${id} stays fixed during reading scroll`
    )
  }
  const viewport = bounds(
    after.find(
      (node) => node["resource-id"] === "ims-native-exchange-reading-viewport"
    )
  )
  const more = after.filter(
    (node) => node["resource-id"] === "ims-native-exchange-more-expanded"
  )
  assert.equal(more.length, 1)
  const priorMore = before.find(
    (node) => node["resource-id"] === "ims-native-exchange-more-expanded"
  )
  const target = bounds(more[0])
  assert(target.width >= 44 && target.height >= 44, "footer target >=44pt")
  assert(
    target.top >= viewport.top && target.bottom <= viewport.bottom,
    "manual reading scroll exposes the full footer target"
  )
  assert.notEqual(
    priorMore?.bounds,
    more[0].bounds,
    "reading content moves beneath the fixed rows"
  )
}
