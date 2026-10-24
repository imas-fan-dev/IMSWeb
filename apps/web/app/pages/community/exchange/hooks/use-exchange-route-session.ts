import { useCallback, useMemo, useState } from "react"
import { useLocation, useNavigationType } from "react-router"
import { useNavigation } from "~/lib/navigation/use-navigation"

const mapPath = "/community/exchange"
type Entry = { key: string; pathname: string; search: string }
export type ExchangeRouteSession = {
  entries: Entry[]
  index: number
  mapSearch: string
}

function isMap(entry: Entry) {
  return entry.pathname.replace(/\/+$/, "") === mapPath
}

export function initialExchangeRouteSession(
  entry: Entry
): ExchangeRouteSession {
  const params = new URLSearchParams(entry.search)
  const filters = new URLSearchParams()
  for (const name of ["city", "series", "open"]) {
    for (const value of params.getAll(name)) filters.append(name, value)
  }
  return {
    entries: [entry],
    index: 0,
    mapSearch: isMap(entry) ? entry.search : filters.size ? `?${filters}` : "",
  }
}

export function advanceExchangeRouteSession(
  session: ExchangeRouteSession,
  entry: Entry,
  action: "POP" | "PUSH" | "REPLACE"
): ExchangeRouteSession {
  if (session.entries[session.index]?.key === entry.key) return session
  let entries = [...session.entries]
  let index = session.index
  if (action === "PUSH") {
    entries = [...entries.slice(0, index + 1), entry]
    index = entries.length - 1
  } else if (action === "REPLACE") {
    entries[index] = entry
  } else {
    index = entries.findIndex((item) => item.key === entry.key)
    if (index < 0) {
      entries = [entry]
      index = 0
    }
  }
  return {
    entries,
    index,
    mapSearch: isMap(entry) ? entry.search : session.mapSearch,
  }
}

export function exchangeRouteReturnDistance(
  session: ExchangeRouteSession
): number | null {
  for (let index = session.index - 1; index >= 0; index--) {
    if (isMap(session.entries[index]!)) return session.index - index
  }
  return null
}

/** Tracks only router entries observed by this mounted map. A direct link may
 * replace itself with the map, but must never go back to an unknown website. */
export function useExchangeRouteSession(enabled = true) {
  const location = useLocation()
  const action = useNavigationType()
  const navigate = useNavigation()
  const [retained, setRetained] = useState(() =>
    initialExchangeRouteSession(location)
  )
  const session = enabled
    ? advanceExchangeRouteSession(retained, location, action)
    : retained
  if (session !== retained) setRetained(session)
  const searchParams = useMemo(
    () => new URLSearchParams(session.mapSearch),
    [session.mapSearch]
  )
  const setSearchParams = useCallback(
    (next: URLSearchParams, options?: { replace?: boolean }) => {
      const query = next.toString()
      const pathname = isMap(location) ? location.pathname : mapPath
      navigate(`${pathname}${query ? `?${query}` : ""}`, options)
    },
    [location, navigate]
  )
  const close = useCallback(() => {
    const distance = exchangeRouteReturnDistance(session)
    if (distance !== null) void navigate(-distance)
    else void navigate(`${mapPath}${session.mapSearch}`, { replace: true })
  }, [navigate, session])
  return { searchParams, setSearchParams, close }
}
