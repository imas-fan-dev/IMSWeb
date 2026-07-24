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
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Link, useSearchParams } from "react-router"

import {
  classicAgencyBanner,
  classicAgencyIcons,
  groupWikiIdols,
} from "~/pages/wiki/wiki-groups"
import { safeWikiColor } from "~/pages/wiki/wiki-model"
import {
  getWikiCatalog,
  getWikiRandomBackground,
  isApiError,
} from "~/shared/api"
import type { WikiPublicCatalog, WikiRandomBackground } from "~/shared/api"

import "./classic-wiki.css"

function classicErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情导航暂时无法加载"
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
  const [background, setBackground] = useState<WikiRandomBackground | null>(
    null
  )
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
        if (active) setCatalogRequest({ key: requestKey, data, error: null })
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
        if (active) setBackground(data)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [backgroundVersion])

  const requestIsCurrent = catalogRequest.key === requestKey
  const catalog = requestIsCurrent ? catalogRequest.data : null
  const catalogError = requestIsCurrent ? catalogRequest.error : null
  const loading = !requestIsCurrent
  const selection = catalog?.selection ?? null
  const accent = safeWikiColor(selection?.agency.color)
  const visibleIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || !normalized) return selection?.idols ?? []
    return selection.idols.filter((idol) =>
      idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
    )
  }, [deferredQuery, selection])
  const groups = useMemo(
    () => groupWikiIdols(selection?.agency.name ?? "", visibleIdols),
    [selection?.agency.name, visibleIdols]
  )
  const style = { "--classic-accent": accent } as CSSProperties

  function selectAgency(agency: string) {
    setQuery("")
    setNavigationOpen(false)
    setSearchParams({ agency })
  }

  return (
    <main id="main-content" className="wiki-classic-shell" style={style}>
      {background?.url && background.agency_name && background.idol_name ? (
        <img
          src={background.url}
          alt=""
          className="wiki-classic-background"
          aria-hidden="true"
        />
      ) : null}
      <div className="wiki-classic-pattern" aria-hidden="true" />

      <div className="wiki-classic-mobile-bar">
        <button
          type="button"
          className="wiki-classic-icon-button"
          aria-label="打开企划导航"
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
          className={`wiki-classic-sidebar${navigationOpen ? " is-open" : ""}`}
          aria-label="企划导航"
        >
          <div className="wiki-classic-sidebar-heading">
            <span>PROJECTS</span>
            <button
              type="button"
              className="wiki-classic-sidebar-close"
              aria-label="关闭企划导航"
              onClick={() => setNavigationOpen(false)}
            >
              <XIcon />
            </button>
          </div>
          {(catalog?.agencies ?? []).map((agency) => {
            const active = selection?.agency.name === agency.name
            return (
              <button
                key={agency.id}
                type="button"
                className={`wiki-classic-agency-button${active ? " is-active" : ""}`}
                style={
                  {
                    "--agency-color": safeWikiColor(agency.color),
                  } as CSSProperties
                }
                aria-current={active ? "page" : undefined}
                onClick={() => selectAgency(agency.name)}
              >
                <span className="wiki-classic-agency-icon">
                  <img
                    src={classicAgencyIcons[agency.name]}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
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

        <section className="wiki-classic-content" aria-live="polite">
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
              aria-label="正在加载经典角色目录"
            >
              <span />
              <span />
              <span />
            </div>
          ) : selection ? (
            <>
              <header className="wiki-classic-banner">
                <p>{selection.agency.code.toUpperCase()} ARCHIVE</p>
                <h1>{classicAgencyBanner(selection.agency.name)}</h1>
                <span>{selection.idols.length} 位角色</span>
              </header>

              <div className="wiki-classic-groups">
                {groups.length ? (
                  groups.map((group) => (
                    <section
                      key={group.key}
                      className="wiki-classic-group"
                      style={
                        {
                          "--group-color": safeWikiColor(group.color),
                        } as CSSProperties
                      }
                      aria-labelledby={`classic-group-${group.key}`}
                    >
                      <div className="wiki-classic-group-title">
                        {group.iconUrl ? (
                          <img
                            src={group.iconUrl}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.hidden = true
                            }}
                          />
                        ) : null}
                        <h2 id={`classic-group-${group.key}`}>{group.name}</h2>
                        <small>{group.idols.length}</small>
                      </div>
                      <div className="wiki-classic-idol-grid">
                        {group.idols.map((idol) => (
                          <Link
                            key={idol.id}
                            to={`/story/classic?agency=${encodeURIComponent(selection.agency.name)}&idol=${encodeURIComponent(idol.name)}`}
                            className="wiki-classic-idol-card"
                            style={
                              {
                                "--idol-color": safeWikiColor(
                                  idol.color ?? group.color
                                ),
                              } as CSSProperties
                            }
                          >
                            <span className="wiki-classic-idol-image">
                              <img
                                src={idol.imageUrl}
                                alt={idol.name}
                                loading="lazy"
                                decoding="async"
                                style={{ objectFit: idol.imageFit }}
                              />
                            </span>
                            <span className="wiki-classic-idol-name">
                              {idol.name}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="wiki-classic-status">
                    <SearchIcon />
                    <h2>没有匹配的角色</h2>
                    <button type="button" onClick={() => setQuery("")}>
                      清除搜索词
                    </button>
                  </div>
                )}
              </div>
            </>
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
        onClick={() => setBackgroundVersion((current) => current + 1)}
      >
        <RefreshCwIcon />
        <span>切换壁纸</span>
      </button>
      <button
        type="button"
        className="wiki-classic-search-button"
        aria-label="搜索角色"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((current) => !current)}
      >
        {searchOpen ? <XIcon /> : <SearchIcon />}
      </button>
      <label className={`wiki-classic-search${searchOpen ? " is-open" : ""}`}>
        <SearchIcon />
        <span className="sr-only">搜索角色</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索偶像名字..."
        />
      </label>
    </main>
  )
}
