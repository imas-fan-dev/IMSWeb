export const WORK_SLUG = Object.freeze({
  allStars: "765",
  cinderellaGirls: "cg",
  millionLive: "ml",
  sideM: "sidem",
  shinyColors: "sc",
  gakuen: "gakuen",
  games: "games",
  worldOfWarships: "wows",
} as const)

export type WorkSlug = (typeof WORK_SLUG)[keyof typeof WORK_SLUG]
export const WORK_SLUGS: readonly WorkSlug[] = Object.freeze(
  Object.values(WORK_SLUG)
)
