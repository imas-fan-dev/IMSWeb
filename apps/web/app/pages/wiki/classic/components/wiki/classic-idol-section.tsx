import { type CSSProperties } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiImageTransform, WikiPublicIdol } from "~/lib/api"
import {
  contrastingWikiText,
  readableWikiAccent,
  safeWikiColor,
} from "~/pages/wiki/wiki-model"
import { NavigationLink } from "~/components/navigation/navigation-link"

interface ClassicIdolSectionProps {
  agency: string
  headingId: string
  title: string
  color: string
  iconUrl: string | null
  imageTransform?: WikiImageTransform
  idols: WikiPublicIdol[]
}

export function ClassicIdolSection({
  agency,
  headingId,
  title,
  color,
  iconUrl,
  imageTransform,
  idols,
}: ClassicIdolSectionProps) {
  return (
    <section
      id={headingId}
      className="wiki-classic-group"
      style={
        {
          "--group-color": safeWikiColor(color),
          "--group-on-color": contrastingWikiText(color),
        } as CSSProperties
      }
      aria-labelledby={`${headingId}-title`}
    >
      <div className="wiki-classic-group-title">
        {iconUrl && imageTransform ? (
          <WikiTransformedImage
            src={iconUrl}
            alt=""
            transform={imageTransform}
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
        ) : null}
        <h2 id={`${headingId}-title`} title={title}>
          {title}
        </h2>
      </div>
      <div className="wiki-classic-idol-grid">
        {idols.map((idol) => (
          <NavigationLink
            key={idol.id}
            to={`/story/classic?agency=${encodeURIComponent(agency)}&idol=${encodeURIComponent(idol.name)}`}
            aria-label={idol.name}
            className="wiki-classic-idol-card"
            style={
              {
                "--idol-color": safeWikiColor(idol.color ?? color),
                "--idol-ink": readableWikiAccent(idol.color ?? color),
                "--idol-on-color": contrastingWikiText(
                  idol.color ?? color,
                  idol.textColor
                ),
              } as CSSProperties
            }
          >
            <span className="wiki-classic-idol-image">
              {idol.imageUrl ? (
                <WikiTransformedImage
                  src={idol.imageUrl}
                  alt={idol.name}
                  transform={idol.imageTransform}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </span>
            <span className="wiki-classic-idol-name" title={idol.name}>
              {idol.name}
            </span>
          </NavigationLink>
        ))}
      </div>
    </section>
  )
}
