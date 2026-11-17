import type {
  Map as MapboxMap,
  StyleSpecification,
  SymbolLayerSpecification,
} from "mapbox-gl"

// BCP 47 “multiple languages”: request untranslated Mapbox tiles, independently
// of the browser locale. The TileJSON language entry is null for Streets v8.
export const MAPBOX_LOCAL_LANGUAGE = "mul"

const nameKeys = new Set([
  "name",
  "name_ar",
  "name_en",
  "name_es",
  "name_fr",
  "name_de",
  "name_it",
  "name_pt",
  "name_ru",
  "name_zh-Hans",
  "name_zh-Hant",
  "name_ja",
  "name_ko",
  "name_vi",
])
const labelLayers = new Set([
  "place_label",
  "natural_label",
  "road",
  "poi_label",
  "transit_stop_label",
  "airport_label",
  "waterway_label",
])
type LabelValue =
  | string
  | number
  | boolean
  | null
  | LabelValue[]
  | Record<string, unknown>

function nameKey(value: unknown): string | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "get" &&
    typeof value[1] === "string" &&
    nameKeys.has(value[1])
    ? value[1]
    : null
}

function hasName(key: string) {
  return [
    "all",
    ["==", ["typeof", ["get", key]], "string"],
    ["!=", ["get", key], ""],
  ]
}

/** Recognize only name choices, including our own output for idempotence. */
function nameFields(value: unknown): string[] | null {
  const key = nameKey(value)
  if (key) return [key]
  if (!Array.isArray(value)) return null
  const fields: string[] = []
  if (value[0] === "case" && value.at(-1) === "") {
    for (let i = 1; i < value.length - 1; i += 2) {
      const candidate = nameKey(value[i + 1])
      if (
        !candidate ||
        JSON.stringify(value[i]) !== JSON.stringify(hasName(candidate))
      )
        return null
      fields.push(candidate)
    }
    return fields.length ? fields : null
  }
  if (value[0] !== "coalesce") return null
  for (const [index, part] of value.slice(1).entries()) {
    if (part === "" && index === value.length - 2) continue
    const candidate = nameKey(part)
    if (!candidate) return null
    fields.push(candidate)
  }
  return fields.length ? fields : null
}

function localName(fields: string[]) {
  return [
    "case",
    ...[...new Set(["name", ...fields, "name_en"])].flatMap((key) => [
      hasName(key),
      ["get", key],
    ]),
    "",
  ]
}

function localText(value: LabelValue): LabelValue {
  const fields = nameFields(value)
  if (fields) return localName(fields)
  if (typeof value === "string") {
    if (!/\{name(?:_[\w-]+)?\}/.test(value)) return value
    // Legacy token strings may also contain route refs, house numbers and text.
    return [
      "concat",
      ...value
        .split(/(\{[^{}]+\})/)
        .filter(Boolean)
        .map((part) => {
          if (!part.startsWith("{") || !part.endsWith("}")) return part
          const key = part.slice(1, -1)
          return nameKeys.has(key)
            ? localName([key])
            : ["to-string", ["get", key]]
        }),
    ]
  }
  if (!Array.isArray(value)) return value
  const result = [...value]
  const rewrite = (index: number) => {
    result[index] = localText(value[index])
  }
  switch (value[0]) {
    case "format": {
      const sections = value.filter((_, index) => index % 2 === 1)
      const first = sections.findIndex(
        (section) => nameFields(section) !== null
      )
      // A name-only bilingual label becomes one local name, retaining its font.
      if (
        first >= 0 &&
        sections.every(
          (section) =>
            nameFields(section) !== null ||
            (typeof section === "string" && section.trim() === "")
        )
      )
        return [
          "format",
          localName(sections.flatMap((section) => nameFields(section) ?? [])),
          value[first * 2 + 2],
        ]
      for (let i = 1; i < value.length; i += 2) rewrite(i)
      break
    }
    case "step":
    case "case":
      for (let i = 2; i < value.length; i += 2) rewrite(i)
      if (value[0] === "case") rewrite(value.length - 1)
      break
    case "match":
      for (let i = 3; i < value.length - 1; i += 2) rewrite(i)
      rewrite(value.length - 1)
      break
    case "interpolate":
    case "interpolate-hcl":
    case "interpolate-lab":
      for (let i = 4; i < value.length; i += 2) rewrite(i)
      break
    case "concat":
    case "coalesce":
    case "upcase":
    case "downcase":
    case "to-string":
      for (let i = 1; i < value.length; i++) rewrite(i)
      break
  }
  return result
}

type TextField = NonNullable<SymbolLayerSpecification["layout"]>["text-field"]

function labelChanges(style: StyleSpecification) {
  const changes = new Map<string, TextField>()
  const sources = new Set(
    Object.entries(style.sources ?? {})
      .filter(
        ([, source]) =>
          source.type === "vector" &&
          source.url?.startsWith("mapbox://") &&
          source.url
            .slice("mapbox://".length)
            .split("?")[0]
            .split(",")
            .some(
              (tileset) =>
                tileset === "mapbox.mapbox-streets-v8" ||
                tileset === "mapbox.mapbox-streets-v8-lite"
            )
      )
      .map(([id]) => id)
  )
  for (const layer of style.layers ?? []) {
    if (
      layer.type !== "symbol" ||
      !sources.has(layer.source) ||
      !labelLayers.has(layer["source-layer"] ?? "")
    )
      continue
    const field = layer.layout?.["text-field"]
    if (field === undefined) continue
    const localized = localText(field as LabelValue)
    if (JSON.stringify(localized) !== JSON.stringify(field))
      changes.set(layer.id, localized as TextField)
  }
  return changes
}

/** Imports expose their serialized data, but not their individual layer setters. */
function localStyleData(style: StyleSpecification): StyleSpecification {
  const changes = labelChanges(style)
  const imports = style.imports?.map((spec) => {
    if (!spec.data) return spec
    const data = localStyleData(spec.data)
    return data === spec.data ? spec : { ...spec, data }
  })
  if (
    !changes.size &&
    imports?.every((spec, i) => spec === style.imports?.[i]) !== false
  )
    return style
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.type === "symbol" && changes.has(layer.id)
        ? {
            ...layer,
            layout: { ...layer.layout, "text-field": changes.get(layer.id) },
          }
        : layer
    ),
    ...(imports ? { imports } : {}),
  }
}

export function applyMapboxLocalLabels(
  map: Pick<MapboxMap, "getStyle" | "setLayoutProperty" | "updateImport">
) {
  const style = map.getStyle()
  for (const [id, field] of labelChanges(style))
    map.setLayoutProperty(id, "text-field", field)
  for (const spec of style.imports ?? []) {
    if (!spec.data) continue
    const data = localStyleData(spec.data)
    if (data !== spec.data) map.updateImport(spec.id, { ...spec, data })
  }
}
