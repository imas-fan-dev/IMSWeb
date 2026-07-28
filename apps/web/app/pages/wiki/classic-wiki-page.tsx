import {
  AlertCircleIcon,
  HouseIcon,
  LayoutGridIcon,
  MenuIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import {
  type CSSProperties,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link, useSearchParams } from "react-router"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { wikiEntryKindLabel } from "~/components/wiki/wiki-entry-kind"
import { safeWikiColor } from "~/pages/wiki/wiki-model"
import {
  getWikiCatalog,
  getWikiRandomBackground,
  isApiError,
} from "~/shared/api"
import type {
  WikiImageTransform,
  WikiPublicCatalog,
  WikiPublicIdol,
  WikiRandomBackground,
} from "~/shared/api"

import "./classic-wiki-index.css"

function classicErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情导航暂时无法加载"
}

interface BackgroundLayers {
  current: WikiRandomBackground | null
  previous: WikiRandomBackground | null
}

export function ClassicWikiPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedAgency = searchParams.get("agency")?.trim() ?? ""
  const [catalogRequest, setCatalogRequest] = useState<{
    key: string
    data: WikiPublicCatalog | null
    error: unknown
  }>({ key: "", data: null, error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [backgroundVersion, setBackgroundVersion] = useState(0)
  const [backgroundLayers, setBackgroundLayers] = useState<BackgroundLayers>({
    current: null,
    previous: null,
  })
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const requestKey = `${requestedAgency}\u0000${refreshVersion}`

  useEffect(() => {
    let active = true
    void getWikiCatalog(requestedAgency || undefined)
      .send()
      .then((data) => {
        if (!active) return
        startTransition(() => {
          setCatalogRequest({ key: requestKey, data, error: null })
        })
      })
      .catch((error: unknown) => {
        if (active) setCatalogRequest({ key: requestKey, data: null, error })
      })
    return () => {
      active = false
    }
  }, [requestKey, requestedAgency])

  useEffect(() => {
    let active = true
    void getWikiRandomBackground()
      .send()
      .then((data) => {
        if (!active) return
        setBackgroundLayers(({ current }) => ({
          current: data,
          previous: current?.url === data.url ? null : current,
        }))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [backgroundVersion])

  useEffect(() => {
    if (!backgroundLayers.previous) return
    const timeout = window.setTimeout(() => {
      setBackgroundLayers(({ current }) => ({ current, previous: null }))
    }, 1050)
    return () => window.clearTimeout(timeout)
  }, [backgroundLayers.current?.url, backgroundLayers.previous])

  const requestIsCurrent = catalogRequest.key === requestKey
  const catalog = catalogRequest.data
  const catalogError = requestIsCurrent ? catalogRequest.error : null
  const loading = !catalog && !catalogError
  const selection = catalog?.selection ?? null
  const background = backgroundLayers.current
  const pendingAgency = catalog?.agencies.find(
    (agency) => agency.name === requestedAgency
  )
  const accent = safeWikiColor(pendingAgency?.color ?? selection?.agency.color)
  const groups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || !normalized) return selection?.groups ?? []
    return selection.groups
      .map((group) => ({
        ...group,
        idols: group.idols.filter((idol) =>
          idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
        ),
      }))
      .filter((group) => group.idols.length)
  }, [deferredQuery, selection])
  const ungroupedIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || !normalized) return selection?.ungroupedIdols ?? []
    return selection.ungroupedIdols.filter((idol) =>
      idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
    )
  }, [deferredQuery, selection])
  const contentPageCount = selection
    ? new Set(
        [
          ...selection.groups.flatMap((group) => group.idols),
          ...selection.ungroupedIdols,
        ].map((idol) => idol.id)
      ).size
    : 0
  const style = { "--classic-accent": accent } as CSSProperties

  function selectAgency(agency: string) {
    setQuery("")
    setNavigationOpen(false)
    setSearchParams({ agency }, { preventScrollReset: true })
  }

  return (
    <main id="main-content" className="wiki-classic-shell" style={style}>
      {backgroundLayers.previous?.url ? (
        <img
          src={backgroundLayers.previous.url}
          alt=""
          className="wiki-classic-background is-previous"
          aria-hidden="true"
        />
      ) : null}
      {background?.url ? (
        <img
          key={background.url}
          src={background.url}
          alt=""
          className="wiki-classic-background is-current"
          aria-hidden="true"
        />
      ) : null}
      <div className="wiki-classic-pattern" aria-hidden="true" />

      <div className="wiki-classic-mobile-bar">
        <button
          type="button"
          className="wiki-classic-icon-button"
          aria-label="打开企划导航"
          title="打开企划导航"
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen(true)}
        >
          <MenuIcon />
        </button>
        <strong>剧情导航站</strong>
        <Link
          to="/wiki"
          className="wiki-classic-icon-button"
          aria-label="切换到新版视图"
          title="切换到新版视图"
        >
          <LayoutGridIcon />
        </Link>
      </div>

      <div className="wiki-classic-window">
        {navigationOpen ? (
          <button
            type="button"
            className="wiki-classic-nav-backdrop"
            aria-label="关闭企划导航"
            onClick={() => setNavigationOpen(false)}
          />
        ) : null}
        <aside
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
              onClick={() => setNavigationOpen(false)}
            >
              <XIcon />
            </button>
          </div>
          {(catalog?.agencies ?? []).map((agency) => {
            const active = requestIsCurrent
              ? selection?.agency.name === agency.name
              : requestedAgency === agency.name
            const pending = active && !requestIsCurrent
            return (
              <button
                key={agency.id}
                type="button"
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
                  } as CSSProperties
                }
                aria-current={active ? "page" : undefined}
                onClick={() => selectAgency(agency.name)}
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
                <small>{agency.idolCount}</small>
              </button>
            )
          })}
          <Link to="/wiki" className="wiki-classic-agency-button is-secondary">
            <LayoutGridIcon />
            <span>新版视图</span>
          </Link>
          <Link to="/" className="wiki-classic-agency-button is-secondary">
            <HouseIcon />
            <span>返回首页</span>
          </Link>
        </aside>

        <section
          className="wiki-classic-content"
          aria-busy={!requestIsCurrent}
          aria-live="polite"
        >
          {catalogError ? (
            <div className="wiki-classic-status is-error">
              <AlertCircleIcon />
              <h1>剧情导航暂时无法加载</h1>
              <p>{classicErrorMessage(catalogError)}</p>
              <button
                type="button"
                onClick={() => setRefreshVersion((current) => current + 1)}
              >
                重新加载
              </button>
            </div>
          ) : loading ? (
            <div
              className="wiki-classic-loading"
              aria-label="正在加载经典内容目录"
            >
              <span />
              <span />
              <span />
            </div>
          ) : selection ? (
            <div key={selection.agency.id} className="wiki-classic-agency-view">
              <header className="wiki-classic-banner">
                <p>{selection.agency.code.toUpperCase()}</p>
                <h1>{selection.agency.bannerTitle}</h1>
                <span>{contentPageCount} 个内容页</span>
              </header>

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
                    <button type="button" onClick={() => setQuery("")}>
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
      </div>

      {background?.url ? (
        <Link
          to={`/story/classic?agency=${encodeURIComponent(background.agency_name ?? "")}&idol=${encodeURIComponent(background.idol_name ?? "")}`}
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
        onClick={() => setBackgroundVersion((current) => current + 1)}
      >
        <RefreshCwIcon />
        <span>切换壁纸</span>
      </button>
      <button
        type="button"
        className="wiki-classic-search-button"
        aria-label="搜索内容页"
        title="搜索内容页"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((current) => !current)}
      >
        {searchOpen ? <XIcon /> : <SearchIcon />}
      </button>
      <label
        className={
          searchOpen ? "wiki-classic-search is-open" : "wiki-classic-search"
        }
      >
        <SearchIcon />
        <span className="sr-only">搜索内容页</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索偶像、组合或剧情..."
        />
      </label>
    </main>
  )
}

function ClassicIdolSection({
  agency,
  headingId,
  title,
  color,
  iconUrl,
  imageTransform,
  idols,
}: {
  agency: string
  headingId: string
  title: string
  color: string
  iconUrl: string | null
  imageTransform?: WikiImageTransform
  idols: WikiPublicIdol[]
}) {
  return (
    <section
      className="wiki-classic-group"
      style={{ "--group-color": safeWikiColor(color) } as CSSProperties}
      aria-labelledby={headingId}
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
        <h2 id={headingId} title={title}>
          {title}
        </h2>
        <small>{idols.length}</small>
      </div>
      <div className="wiki-classic-idol-grid">
        {idols.map((idol) => (
          <Link
            key={idol.id}
            to={`/story/classic?agency=${encodeURIComponent(agency)}&idol=${encodeURIComponent(idol.name)}`}
            aria-label={idol.name}
            className="wiki-classic-idol-card"
            style={
              {
                "--idol-color": safeWikiColor(idol.color ?? color),
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
            <small className="wiki-classic-idol-kind">
              {wikiEntryKindLabel(idol.entryKind, idol.entrySubtype)}
            </small>
          </Link>
        ))}
      </div>
    </section>
  )
}
