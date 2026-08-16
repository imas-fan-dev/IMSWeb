import {
  type CSSProperties,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useSearchParams } from "react-router"

import { BackToTop } from "~/components/shared/back-to-top"
import { WikiMobileSearch } from "~/components/wiki/wiki-mobile-search"
import { getWikiCatalog, getWikiRandomBackground, isApiError } from "~/lib/api"
import type { WikiPublicCatalog } from "~/lib/api"
import { WikiAgencyDial } from "~/pages/wiki/modern/components/wiki-agency-dial"
import { shouldKeepCgIdol } from "~/pages/wiki/cg-voiced-idols"
import { contrastingWikiText, safeWikiColor } from "~/pages/wiki/wiki-model"

import { ClassicAgencyNavigation } from "./components/wiki/classic-agency-navigation"
import { ClassicMobileBar } from "./components/wiki/classic-mobile-bar"
import {
  type ClassicBackgroundLayers,
  ClassicWikiBackground,
} from "./components/wiki/classic-wiki-background"
import { ClassicWikiContent } from "./components/wiki/classic-wiki-content"
import { ClassicWikiTools } from "./components/wiki/classic-wiki-tools"
import "./components/wiki/classic-wiki.css"

function classicErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情导航暂时无法加载"
}

export function meta() {
  return [
    { title: "经典剧情导航 | IMSWeb" },
    {
      name: "description",
      content: "保留原 Wiki 模板信息层级与交互方式的经典剧情导航。",
    },
  ]
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
  const [backgroundLayers, setBackgroundLayers] =
    useState<ClassicBackgroundLayers>({
      current: null,
      previous: null,
    })
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [hideUnvoiced, setHideUnvoiced] = useState(false)
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
  const showOnlyVoiced = hideUnvoiced && selection?.agency.code === "cg"
  const background = backgroundLayers.current
  const pendingAgency = catalog?.agencies.find(
    (agency) => agency.name === requestedAgency
  )
  const accent = safeWikiColor(pendingAgency?.color ?? selection?.agency.color)
  const groups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection) return []
    return selection.groups
      .map((group) => {
        let idols = group.idols
        if (
          normalized &&
          !group.name.toLocaleLowerCase("zh-CN").includes(normalized)
        ) {
          idols = idols.filter((idol) =>
            idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
          )
        }
        if (showOnlyVoiced) idols = idols.filter(shouldKeepCgIdol)
        return { ...group, idols }
      })
      .filter((group) => group.idols.length)
  }, [deferredQuery, selection, showOnlyVoiced])

  const ungroupedIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection) return []
    let idols = selection.ungroupedIdols
    if (normalized) {
      idols = idols.filter((idol) =>
        idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
      )
    }
    if (showOnlyVoiced) idols = idols.filter(shouldKeepCgIdol)
    return idols
  }, [deferredQuery, selection, showOnlyVoiced])
  const modernWikiAgency = requestIsCurrent
    ? selection?.agency.name
    : requestedAgency
  const modernWikiHref = modernWikiAgency
    ? `/wiki?agency=${encodeURIComponent(modernWikiAgency)}`
    : "/wiki"
  const style = {
    "--classic-accent": accent,
    "--classic-banner-ink": contrastingWikiText(accent),
  } as CSSProperties

  function selectAgency(agency: string) {
    setQuery("")
    setSearchParams({ agency }, { preventScrollReset: true })
  }

  return (
    <main id="main-content" className="wiki-classic-shell" style={style}>
      <ClassicWikiBackground layers={backgroundLayers} />
      <ClassicMobileBar modernWikiHref={modernWikiHref} />

      <div className="wiki-classic-window">
        <ClassicAgencyNavigation
          catalog={catalog}
          requestedAgency={requestedAgency}
          requestIsCurrent={requestIsCurrent}
          navigationOpen={false}
          modernWikiHref={modernWikiHref}
          onClose={() => undefined}
          onSelectAgency={selectAgency}
        />
        <ClassicWikiContent
          errorMessage={catalogError ? classicErrorMessage(catalogError) : null}
          loading={loading}
          requestIsCurrent={requestIsCurrent}
          selection={selection}
          groupFilterDisabled={!requestIsCurrent}
          groups={groups}
          ungroupedIdols={ungroupedIdols}
          hideUnvoiced={hideUnvoiced}
          onToggleHideUnvoiced={() => setHideUnvoiced((current) => !current)}
          onQueryChange={setQuery}
          onRetry={() => setRefreshVersion((current) => current + 1)}
        />
      </div>

      <ClassicWikiTools
        background={background}
        query={query}
        searchEntries={catalog?.searchEntries ?? []}
        searchOpen={searchOpen}
        onQueryChange={setQuery}
        onRefreshBackground={() =>
          setBackgroundVersion((current) => current + 1)
        }
        onToggleSearch={() => setSearchOpen((current) => !current)}
      />
      <WikiAgencyDial
        agencies={catalog?.agencies ?? []}
        selectedAgency={requestedAgency || selection?.agency.name || null}
        disabled={!requestIsCurrent}
        visibilityClassName="min-[851px]:hidden"
        onSelectAgency={selectAgency}
      />
      <WikiMobileSearch
        entries={catalog?.searchEntries ?? []}
        view="classic"
        className="min-[851px]:hidden"
      />
      <BackToTop className="wiki-classic-back-to-top" />
    </main>
  )
}

export default ClassicWikiPage
