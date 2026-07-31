import { seriesWallItems } from "~/lib/series-wall"

export type SeriesItem = (typeof seriesWallItems)[number]

export const seriesItems: readonly SeriesItem[] = seriesWallItems
