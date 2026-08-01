export const CLIENT_CACHE_DURATION = {
  publicFeed: 5 * 60 * 1000,
  stableContent: 30 * 60 * 1000,
  wiki: 60 * 60 * 1000,
} as const

export const NO_CLIENT_CACHE = 0
export const PUBLIC_QUERY_CACHE_FOR = CLIENT_CACHE_DURATION.publicFeed
export const STABLE_CONTENT_CACHE_FOR = CLIENT_CACHE_DURATION.stableContent

export const WIKI_PUBLIC_CACHE = {
  expire: CLIENT_CACHE_DURATION.wiki,
  mode: "restore",
  tag: "wiki-public-v1",
} as const

export const PUBLIC_CACHE_INVALIDATION_SOURCE = {
  about: "public-cache-mutation:about",
  chronicle: "public-cache-mutation:chronicle",
  community: "public-cache-mutation:community",
  events: "public-cache-mutation:events",
  homepageLinks: "public-cache-mutation:homepage-links",
  information: "public-cache-mutation:information",
  producerMap: "public-cache-mutation:producer-map",
  recommendations: "public-cache-mutation:recommendations",
  sitePackages: "public-cache-mutation:site-packages",
  wiki: "public-cache-mutation:wiki",
} as const
