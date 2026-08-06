import { AlertCircleIcon, SearchIcon } from "lucide-react"

import type { WikiPublicCatalog, WikiPublicIdol } from "~/lib/api"

import { ClassicGroupFilter } from "./classic-group-filter"
import { ClassicIdolSection } from "./classic-idol-section"

type ClassicSelection = NonNullable<WikiPublicCatalog["selection"]>

interface ClassicWikiContentProps {
  errorMessage: string | null
  loading: boolean
  requestIsCurrent: boolean
  selection: WikiPublicCatalog["selection"] | null
  groupFilterDisabled: boolean
  groups: ClassicSelection["groups"]
  ungroupedIdols: WikiPublicIdol[]
  onQueryChange: (query: string) => void
  onRetry: () => void
}

export function ClassicWikiContent({
  errorMessage,
  loading,
  requestIsCurrent,
  selection,
  groupFilterDisabled,
  groups,
  ungroupedIdols,
  onQueryChange,
  onRetry,
}: ClassicWikiContentProps) {
  return (
    <section
      className="wiki-classic-content"
      aria-busy={!requestIsCurrent}
      aria-live="polite"
    >
      {errorMessage ? (
        <div className="wiki-classic-status is-error">
          <AlertCircleIcon />
          <h1>剧情导航暂时无法加载</h1>
          <p>{errorMessage}</p>
          <button type="button" onClick={onRetry}>
            重新加载
          </button>
        </div>
      ) : loading ? (
        <div className="wiki-classic-loading" aria-label="正在加载经典内容目录">
          <span />
          <span />
          <span />
        </div>
      ) : selection ? (
        <div key={selection.agency.id} className="wiki-classic-agency-view">
          <header className="wiki-classic-banner">
            <p>{selection.agency.code.toUpperCase()}</p>
            <h1>{selection.agency.bannerTitle}</h1>
          </header>

          <ClassicGroupFilter
            groups={selection.groups}
            ungroupedCount={selection.ungroupedIdols.length}
            disabled={groupFilterDisabled}
          />

          <div className="wiki-classic-groups">
            {groups.length || ungroupedIdols.length ? (
              <>
                {groups.map((group) => (
                  <ClassicIdolSection
                    key={group.id}
                    agency={selection.agency.name}
                    headingId={`classic-group-${group.id}`}
                    title={group.name}
                    color={group.color}
                    iconUrl={group.iconUrl}
                    imageTransform={group.imageTransform}
                    idols={group.idols}
                  />
                ))}
                {ungroupedIdols.length ? (
                  <ClassicIdolSection
                    agency={selection.agency.name}
                    headingId="classic-group-ungrouped"
                    title="未归档"
                    color={selection.agency.color}
                    iconUrl={null}
                    idols={ungroupedIdols}
                  />
                ) : null}
              </>
            ) : (
              <div className="wiki-classic-status">
                <SearchIcon />
                <h2>没有匹配的内容页</h2>
                <button type="button" onClick={() => onQueryChange("")}>
                  清除搜索词
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="wiki-classic-status">
          <h1>当前没有可展示的 Wiki 数据</h1>
        </div>
      )}
    </section>
  )
}
