/**
 * The map attribution is a licence obligation, not decoration: OpenFreeMap,
 * OpenMapTiles and OpenStreetMap all require the notice to stay reachable.
 * `apps/web/public/maps/exchange-style.json` keeps the authored string so
 * MapLibre and any other style consumer still read it from there, and this
 * module turns that string into ordered segments for React to render.
 *
 * The raw value is treated as untrusted. Only `https:` anchors survive as
 * links; every other anchor degrades to text. Nothing here produces HTML, so
 * no call site needs `dangerouslySetInnerHTML`.
 */

export type ExchangeMapAttributionSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; href: string }

export type ExchangeMapAttribution = {
  segments: ExchangeMapAttributionSegment[]
}

/**
 * Elements whose text must never reach the rendered notice. Anchors inside
 * them resolve to nothing rather than to a label.
 */
const skippedElementNames = new Set([
  "embed",
  "iframe",
  "object",
  "script",
  "style",
  "template",
])

const httpsPrefix = "https://"

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ")
}

function isBlankTextSegment(segment: ExchangeMapAttributionSegment) {
  return segment.kind === "text" && segment.value.trim() === ""
}

function collectElementSegments(
  element: Element,
  segments: ExchangeMapAttributionSegment[]
) {
  const name = element.tagName.toLowerCase()
  if (skippedElementNames.has(name)) return

  if (name !== "a") {
    collectSegments(element, segments)
    return
  }

  const label = collapseWhitespace(element.textContent ?? "").trim()
  if (!label) return

  const href = element.getAttribute("href")?.trim() ?? ""
  if (href.startsWith(httpsPrefix)) {
    segments.push({ kind: "link", label, href })
  } else {
    segments.push({ kind: "text", value: label })
  }
}

function collectSegments(
  node: Node,
  segments: ExchangeMapAttributionSegment[]
) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = collapseWhitespace(child.textContent ?? "")
      if (value) segments.push({ kind: "text", value })
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      collectElementSegments(child as Element, segments)
    }
  }
}

/**
 * Returns `null` for anything that would render an empty notice: a missing
 * value, a blank string, or markup carrying no usable text. Callers use that
 * to hide the attribution entry point instead of opening an empty dialog.
 */
export function parseMapAttribution(
  raw: unknown
): ExchangeMapAttribution | null {
  if (typeof raw !== "string") return null

  const source = raw.trim()
  if (!source) return null

  // Prerendering runs without a DOM. The notice is client-rendered anyway, so
  // returning `null` here only keeps the server pass from throwing.
  if (typeof DOMParser === "undefined") return null

  const body = new DOMParser().parseFromString(source, "text/html").body
  const segments: ExchangeMapAttributionSegment[] = []
  collectSegments(body, segments)

  // Drop whitespace-only text at the edges so the notice does not open or
  // close on a stray gap. Interior separators stay: they are what keeps
  // `OpenFreeMap` and `© OpenMapTiles` from running together.
  while (segments.length > 0 && isBlankTextSegment(segments[0]))
    segments.shift()
  while (segments.length > 0 && isBlankTextSegment(segments.at(-1)!)) {
    segments.pop()
  }

  return segments.length > 0 ? { segments } : null
}
