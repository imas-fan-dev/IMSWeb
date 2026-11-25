/**
 * Contract conformance helpers for the domain fixture factories.
 *
 * Every factory beside this file is a hand-written instance of one
 * `@imsweb/contracts` response shape. These helpers are what keep those
 * instances honest when a contract moves: a newly required field has to break
 * the factory's conformance test rather than let the fixture drift.
 */

import { z } from "@imsweb/contracts/z"

/**
 * Lists the keys a `ZodObject` requires, or `null` when the schema has no
 * enumerable key set.
 *
 * `null` means "nothing to check", not "unverified". Unions, lazy schemas, and
 * the leaf atoms (enum, string, number, array, record) carry no required-key
 * set, so callers skip the coverage assertion instead of inventing one.
 */
export function requiredKeysOf(schema: unknown): string[] | null {
  if (!(schema instanceof z.ZodObject)) return null
  return Object.keys(schema.shape)
    .filter((key) => !schema.shape[key]?.isOptional())
    .sort()
}

/**
 * Asserts that a factory output carries every key the schema requires.
 *
 * `schema.parse(value)` already rejects a missing required field, but its error
 * points at a zod path. This check names the missing key and the fixture that
 * owes it, which is the message someone adding a contract field needs.
 */
export function assertFactoryCoversSchema(
  schema: unknown,
  value: unknown
): void {
  const required = requiredKeysOf(schema)
  if (required === null) return
  if (typeof value !== "object" || value === null) {
    throw new Error("factory output is not an object")
  }
  const present = new Set(Object.keys(value))
  const missing = required.filter((key) => !present.has(key))
  if (missing.length > 0) {
    throw new Error(`fixture is missing contract keys: ${missing.join(", ")}`)
  }
}
