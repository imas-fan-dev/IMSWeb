/**
 * Returns whether schema output preserves the complete JSON wire value.
 * Contract schemas must neither remove fields nor coerce, default, or transform
 * data before callers observe it.
 */
export function hasExactJsonStructure(raw: unknown, parsed: unknown): boolean {
  if (raw === null || parsed === null) return raw === null && parsed === null

  switch (typeof raw) {
    case "string":
    case "number":
    case "boolean":
      return Object.is(raw, parsed)
    case "object":
      break
    default:
      return false
  }

  if (Array.isArray(raw)) {
    return (
      Array.isArray(parsed) &&
      raw.length === parsed.length &&
      raw.every((value, index) => hasExactJsonStructure(value, parsed[index]))
    )
  }

  if (!isJsonObject(raw) || !isJsonObject(parsed)) return false

  const rawKeys = Object.keys(raw)
  const parsedKeys = Object.keys(parsed)
  return (
    rawKeys.length === parsedKeys.length &&
    rawKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(parsed, key) &&
        hasExactJsonStructure(raw[key], parsed[key])
    )
  )
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}
