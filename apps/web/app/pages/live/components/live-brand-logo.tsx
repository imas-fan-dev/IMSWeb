import as765Logo from "~/pages/live/assets/765as.svg?url"
import cinderellaLogo from "~/pages/live/assets/cinderella.svg?url"
import gakuenLogo from "~/pages/live/assets/gaku.svg?url"
import millionLogo from "~/pages/live/assets/million.svg?url"
import shinyColorsLogo from "~/pages/live/assets/sc.svg?url"
import sideMLogo from "~/pages/live/assets/sidem.svg?url"
import vaLivLogo from "~/pages/live/assets/valiv.svg?url"

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
  const source = BRAND_LOGOS[code]
  if (!source) return null

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="inline-flex h-7 min-w-9 items-center justify-center rounded-md border bg-background px-1.5 [&>svg]:h-5 [&>svg]:w-auto"
    >
      <svg viewBox="0 0 36 28" aria-hidden="true" focusable="false">
        <image href={source} width="36" height="28" />
      </svg>
    </span>
  )
}
