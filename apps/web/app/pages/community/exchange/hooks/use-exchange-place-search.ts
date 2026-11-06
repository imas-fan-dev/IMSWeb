import {
  searchFudabaPlaces,
  sendWithAbort,
  type FudabaPlaceSearchResult,
} from "~/lib/api"
import { usePlaceSearch, type PlaceSearchModel } from "./use-place-search"

const searchCanonicalPlaces = (query: string, signal: AbortSignal) =>
  sendWithAbort(searchFudabaPlaces(query), signal)

/** Office editing only: these results remain canonical WGS84. */
export function useExchangePlaceSearch(searcher = searchCanonicalPlaces) {
  return usePlaceSearch(searcher)
}

export type ExchangePlaceSearchModel<Place = FudabaPlaceSearchResult> =
  PlaceSearchModel<Place>
