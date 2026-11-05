import type { MapSearchTarget } from "./map-search"
import { createRandomId } from "~/lib/random-id"

const storageKey = "ims:office-create-intent"
const maxAge = 30 * 60 * 1000
let pending: { id: string; createdAt: number; target: MapSearchTarget } | null =
  null

/** A short-lived session token survives login without exposing coordinates in URLs. */
export function startOfficeCreateIntent(target: MapSearchTarget): string {
  const id = createRandomId()
  pending = {
    id,
    createdAt: Date.now(),
    target: { ...target, position: [...target.position] },
  }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(pending))
  } catch {
    // The current page can still hand off when browser storage is unavailable.
  }
  return `/account/me/offices?create=${encodeURIComponent(id)}`
}

export function readOfficeCreateIntent(
  id: string | null
): MapSearchTarget | null {
  if (!id) return null
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null"
    )
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      value.id === id
    ) {
      if (
        !("createdAt" in value) ||
        typeof value.createdAt !== "number" ||
        Date.now() - value.createdAt > maxAge ||
        value.createdAt > Date.now() ||
        !("target" in value) ||
        !value.target ||
        typeof value.target !== "object"
      )
        return null
      const target = value.target
      if (
        !("kind" in target) ||
        !("position" in target) ||
        !Array.isArray(target.position) ||
        target.position.length !== 2 ||
        !target.position.every(
          (n) => typeof n === "number" && Number.isFinite(n)
        ) ||
        Math.abs(target.position[0]) > 180 ||
        Math.abs(target.position[1]) > 90
      )
        return null
      if (target.kind === "wgs84")
        return {
          kind: "wgs84",
          position: [target.position[0], target.position[1]],
        }
      if (
        target.kind === "native" &&
        "provider" in target &&
        target.provider === "amap"
      )
        return {
          kind: "native",
          provider: "amap",
          position: [target.position[0], target.position[1]],
        }
    }
  } catch {
    // Fall back to the in-memory handoff only for this session.
  }
  return pending?.id === id && Date.now() - pending.createdAt <= maxAge
    ? { ...pending.target, position: [...pending.target.position] }
    : null
}

export function clearOfficeCreateIntent() {
  pending = null
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // Storage is optional.
  }
}
