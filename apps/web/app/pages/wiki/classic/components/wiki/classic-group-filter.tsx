import { type CSSProperties, type ReactNode } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiPublicCatalog } from "~/lib/api"
import { contrastingWikiText, safeWikiColor } from "~/pages/wiki/wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

interface ClassicGroupFilterProps {
  groups: PublicGroup[]
  ungroupedCount: number
  disabled: boolean
}

export function ClassicGroupFilter({
  groups,
  ungroupedCount,
  disabled,
}: ClassicGroupFilterProps) {
  return (
    <section className="wiki-classic-group-filter" aria-label="组合与分类导航">
      <span className="wiki-classic-group-filter-label">组合导航</span>
      <nav
        className="wiki-classic-group-filter-tabs"
        aria-label="跳转到组合或分类"
      >
        {groups.map((group) => (
          <ClassicGroupLink
            key={group.id}
            color={group.color}
            label={group.name}
            disabled={disabled}
            href={`#classic-group-${group.id}`}
          >
            <span className="wiki-classic-group-filter-icon">
              <span
                className="wiki-classic-group-filter-dot"
                style={{ backgroundColor: safeWikiColor(group.color) }}
                aria-hidden="true"
              />
              {group.iconUrl ? (
                <WikiTransformedImage
                  src={group.iconUrl}
                  alt=""
                  transform={group.imageTransform}
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : null}
            </span>
          </ClassicGroupLink>
        ))}

        {ungroupedCount ? (
          <ClassicGroupLink
            color="#6b7280"
            label="未归档"
            disabled={disabled}
            href="#classic-group-ungrouped"
          >
            <span className="wiki-classic-group-filter-icon">
              <span
                className="wiki-classic-group-filter-dot"
                aria-hidden="true"
              />
            </span>
          </ClassicGroupLink>
        ) : null}
      </nav>
    </section>
  )
}

function ClassicGroupLink({
  color,
  label,
  disabled,
  children,
  href,
}: {
  color: string
  label: string
  disabled: boolean
  children: ReactNode
  href: string
}) {
  const accent = safeWikiColor(color)

  return (
    <a
      href={href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={(event) => {
        if (disabled) event.preventDefault()
      }}
      className="wiki-classic-group-filter-button"
      style={
        {
          "--filter-color": accent,
          "--filter-on-color": contrastingWikiText(accent),
        } as CSSProperties
      }
    >
      {children}
      <span className="wiki-classic-group-filter-name">{label}</span>
    </a>
  )
}
