import { RefreshCwIcon, SearchIcon, XIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiGlobalSearchResults } from "~/components/wiki/wiki-global-search-results"
import type { WikiRandomBackground } from "~/lib/api"
import type { WikiPublicSearchEntry } from "~/lib/api"

interface ClassicWikiToolsProps {
  background: WikiRandomBackground | null
  query: string
  searchEntries: WikiPublicSearchEntry[]
  searchOpen: boolean
  onQueryChange: (query: string) => void
  onRefreshBackground: () => void
  onToggleSearch: () => void
}

export function ClassicWikiTools({
  background,
  query,
  searchEntries,
  searchOpen,
  onQueryChange,
  onRefreshBackground,
  onToggleSearch,
}: ClassicWikiToolsProps) {
  return (
    <>
      {background?.url ? (
        <Link
          to={`/story?agency=${encodeURIComponent(background.agency_name ?? "")}&idol=${encodeURIComponent(background.idol_name ?? "")}`}
          className="wiki-classic-background-source"
        >
          <SearchIcon />
          <span>
            {background.idol_name || "剧情视觉"}
            {background.card_name ? ` · ${background.card_name}` : ""}
          </span>
        </Link>
      ) : null}
      <button
        type="button"
        className="wiki-classic-background-button"
        aria-label="切换壁纸"
        title="切换壁纸"
        onClick={onRefreshBackground}
      >
        <RefreshCwIcon />
        <span>切换壁纸</span>
      </button>
      <button
        type="button"
        className="wiki-classic-search-button"
        aria-label="全局搜索内容页"
        title="全局搜索内容页"
        aria-expanded={searchOpen}
        onClick={onToggleSearch}
      >
        {searchOpen ? <XIcon /> : <SearchIcon />}
      </button>
      <div
        className={
          searchOpen ? "wiki-classic-search is-open" : "wiki-classic-search"
        }
      >
        <label className="wiki-classic-search-field">
          <SearchIcon />
          <span className="sr-only">全局搜索内容页</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索全站偶像或内容页"
          />
        </label>
        <WikiGlobalSearchResults
          entries={searchEntries}
          query={query}
          view="classic"
          className="wiki-classic-global-search-results"
          onNavigate={() => onQueryChange("")}
        />
      </div>
    </>
  )
}
