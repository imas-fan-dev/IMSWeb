import type { WikiRandomBackground } from "~/lib/api"

export interface ClassicBackgroundLayers {
  current: WikiRandomBackground | null
  previous: WikiRandomBackground | null
}

interface ClassicWikiBackgroundProps {
  layers: ClassicBackgroundLayers
}

export function ClassicWikiBackground({ layers }: ClassicWikiBackgroundProps) {
  return (
    <>
      {layers.previous?.url ? (
        <img
          src={layers.previous.url}
          alt=""
          className="wiki-classic-background is-previous"
          aria-hidden="true"
        />
      ) : null}
      {layers.current?.url ? (
        <img
          key={layers.current.url}
          src={layers.current.url}
          alt=""
          className="wiki-classic-background is-current"
          aria-hidden="true"
        />
      ) : null}
      <div className="wiki-classic-pattern" aria-hidden="true" />
    </>
  )
}
