export const seriesWallItems = [
  {
    name: "765PRO ALLSTARS",
    accent: "765",
    background: "bg-franchise-765",
    image: "/brand/series/wall/765pro.webp",
    icon: "/brand/series/wall/765pro.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/765",
  },
  {
    name: "CINDERELLA GIRLS",
    accent: "cg",
    background: "bg-franchise-cg",
    image: "/brand/series/wall/cinderella-girls.webp",
    icon: "/brand/series/wall/cinderella-girls.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/cg",
  },
  {
    name: "MILLION LIVE!",
    accent: "ml",
    background: "bg-franchise-ml",
    image: "/brand/series/wall/million-live.webp",
    icon: "/brand/series/wall/million-live.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/ml",
  },
  {
    name: "SideM",
    accent: "sidem",
    background: "bg-franchise-sidem",
    image: "/brand/series/wall/sidem.webp",
    icon: "/brand/series/wall/sidem.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/sidem",
  },
  {
    name: "SHINY COLORS",
    accent: "sc",
    background: "bg-franchise-sc",
    image: "/brand/series/wall/shiny-colors.webp",
    icon: "/brand/series/wall/shiny-colors.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/sc",
  },
  {
    name: "学园偶像大师",
    accent: "gk",
    background: "bg-franchise-gk",
    image: "/brand/series/wall/gakuen.webp",
    icon: "/brand/series/wall/gakuen.webp",
    iconWidth: 585,
    iconHeight: 500,
    href: "/works/gakuen",
  },
] as const

/**
 * Mirrors the `--franchise-*` token suffix so `data-glass-accent` can tint the
 * liquid glass material with the active franchise hue.
 */
export type SeriesAccentKey = (typeof seriesWallItems)[number]["accent"]
