import as765Logo from "~/pages/live/assets/765as.svg?raw"
import cinderellaLogo from "~/pages/live/assets/cinderella.svg?raw"
import gakuenLogo from "~/pages/live/assets/gaku.svg?raw"
import millionLogo from "~/pages/live/assets/million.svg?raw"
import shinyColorsLogo from "~/pages/live/assets/sc.svg?raw"
import sideMLogo from "~/pages/live/assets/sidem.svg?raw"
import vaLivLogo from "~/pages/live/assets/valiv.svg?raw"

const BRAND_LOGOS: Record<string, string> = {
  IDOLMASTER: as765Logo,
  CINDERELLAGIRLS: cinderellaLogo,
  MILLIONLIVE: millionLogo,
  SIDEM: sideMLogo,
  SHINYCOLORS: shinyColorsLogo,
  GAKUEN: gakuenLogo,
  "VA-LIV": vaLivLogo,
}

export function hasLiveBrandLogo(code: string): boolean {
  return Boolean(BRAND_LOGOS[code])
}

export function LiveBrandLogo({ code, name }: { code: string; name: string }) {
  const markup = BRAND_LOGOS[code]
  if (!markup) return null

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="inline-flex h-7 min-w-9 items-center justify-center rounded-md border bg-background px-1.5 [&>svg]:h-5 [&>svg]:w-auto"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
