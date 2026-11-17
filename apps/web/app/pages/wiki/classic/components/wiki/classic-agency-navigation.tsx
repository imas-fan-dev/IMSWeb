import { HouseIcon, XIcon } from "lucide-react"
import { type CSSProperties } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { WikiViewSwitchIcon } from "~/components/wiki/wiki-view-switch-icon"
import type { WikiPublicCatalog } from "~/lib/api"
import { contrastingWikiText, safeWikiColor } from "~/pages/wiki/wiki-model"
import { NavigationLink } from "~/components/navigation/navigation-link"

interface ClassicAgencyNavigationProps {
  catalog: WikiPublicCatalog | null
  requestedAgency: string
  requestIsCurrent: boolean
  navigationOpen: boolean
  modernWikiHref: string
  onClose: () => void
  onSelectAgency: (agency: string) => void
}

export function ClassicAgencyNavigation({
  catalog,
  requestedAgency,
  requestIsCurrent,
  navigationOpen,
  modernWikiHref,
  onClose,
  onSelectAgency,
}: ClassicAgencyNavigationProps) {
  const selection = catalog?.selection ?? null

  return (
    <>
      {navigationOpen ? (
        <button
          type="button"
          className="wiki-classic-nav-backdrop"
          aria-label="关闭企划导航"
          onClick={onClose}
        />
      ) : null}
      <aside
        id="classic-agency-navigation"
        className={
          navigationOpen
            ? "wiki-classic-sidebar is-open"
            : "wiki-classic-sidebar"
        }
        aria-label="企划导航"
      >
        <div className="wiki-classic-sidebar-heading">
          <span>企划导航</span>
          <button
            type="button"
            className="wiki-classic-sidebar-close"
            aria-label="关闭企划导航"
            title="关闭企划导航"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>
        <div
          className="wiki-classic-agency-list"
          role="tablist"
          aria-label="偶像大师企划"
          aria-busy={!requestIsCurrent}
        >
          {(catalog?.agencies ?? []).map((agency) => {
            const active = requestIsCurrent
              ? selection?.agency.name === agency.name
              : requestedAgency === agency.name
            const pending = active && !requestIsCurrent
            return (
              <button
                key={agency.id}
                type="button"
                role="tab"
                className={
                  pending
                    ? "wiki-classic-agency-button is-active is-pending"
                    : active
                      ? "wiki-classic-agency-button is-active"
                      : "wiki-classic-agency-button"
                }
                style={
                  {
                    "--agency-color": safeWikiColor(agency.color),
                    "--agency-on-color": contrastingWikiText(agency.color),
                  } as CSSProperties
                }
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectAgency(agency.name)}
              >
                <span className="wiki-classic-agency-icon">
                  {agency.iconUrl ? (
                    <WikiTransformedImage
                      src={agency.iconUrl}
                      alt=""
                      transform={agency.imageTransform}
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                    />
                  ) : null}
                </span>
                <span>{agency.name}</span>
              </button>
            )
          })}
        </div>
        <NavigationLink
          to={modernWikiHref}
          className="wiki-classic-agency-button is-secondary"
        >
          <WikiViewSwitchIcon tone="dark" className="size-4.5" />
          <span>新版视图</span>
        </NavigationLink>
        <NavigationLink
          to="/"
          className="wiki-classic-agency-button is-secondary"
        >
          <HouseIcon />
          <span>返回首页</span>
        </NavigationLink>
      </aside>
    </>
  )
}
