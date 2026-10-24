import { describe, expect, it } from "vitest"
import {
  advanceExchangeRouteSession as advance,
  exchangeRouteReturnDistance as distance,
  initialExchangeRouteSession as initial,
} from "~/pages/community/exchange/hooks/use-exchange-route-session"

const map = {
  key: "map",
  pathname: "/community/exchange",
  search: "?city=上海&series=765&open=true",
}
const office = {
  key: "office",
  pathname: "/community/exchange/offices/test-office",
  search: "",
}
const profile = {
  key: "profile",
  pathname: "/community/exchange/me",
  search: "?section=cards",
}

describe("exchange route session", () => {
  it("preserves map filters while opening office and profile routes", () => {
    const session = advance(
      advance(initial(map), office, "PUSH"),
      profile,
      "PUSH"
    )
    expect(session.mapSearch).toBe(map.search)
    expect(distance(session)).toBe(2)
  })
  it("never returns to unknown browser history from a direct profile link", () => {
    const session = initial({ ...profile, search: "?section=cards&city=上海" })
    expect(distance(session)).toBeNull()
    const filters = new URLSearchParams(session.mapSearch)
    expect(filters.get("city")).toBe("上海")
    expect(filters.has("section")).toBe(false)
  })
  it("tracks back and forward without discarding the map return entry", () => {
    let session = advance(initial(map), office, "PUSH")
    session = advance(session, map, "POP")
    expect(session.mapSearch).toBe(map.search)
    session = advance(session, office, "POP")
    expect(distance(session)).toBe(1)
  })
  it("retains a safe return when a child replaces its section query", () => {
    const session = advance(
      advance(initial(map), profile, "PUSH"),
      { ...profile, key: "replace", search: "?section=offices" },
      "REPLACE"
    )
    expect(distance(session)).toBe(1)
    expect(session.mapSearch).toBe(map.search)
  })
  it("does not infer a return destination from an unobserved POP", () => {
    const session = advance(
      advance(initial(map), office, "PUSH"),
      { ...profile, key: "unknown" },
      "POP"
    )
    expect(distance(session)).toBeNull()
    expect(session.mapSearch).toBe(map.search)
  })
  it("drops stale forward entries after a new navigation", () => {
    let session = advance(initial(map), office, "PUSH")
    session = advance(session, map, "POP")
    session = advance(session, profile, "PUSH")
    expect(session.entries.map((entry) => entry.key)).toEqual([
      "map",
      "profile",
    ])
    expect(distance(session)).toBe(1)
  })
})
