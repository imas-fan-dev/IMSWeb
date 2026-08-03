import {
  type CSSProperties,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useSearchParams } from "react-router"

import { WikiBackToTop } from "~/components/wiki/wiki-back-to-top"
import { getWikiCatalog, getWikiRandomBackground, isApiError } from "~/lib/api"
import type { WikiPublicCatalog } from "~/lib/api"
import { contrastingWikiText, safeWikiColor } from "~/pages/wiki/wiki-model"

import { ClassicAgencyNavigation } from "./components/wiki/classic-agency-navigation"
import { ClassicMobileBar } from "./components/wiki/classic-mobile-bar"
import {
  type ClassicBackgroundLayers,
  ClassicWikiBackground,
} from "./components/wiki/classic-wiki-background"
import {
  CLASSIC_UNGROUPED_FILTER,
  type ClassicGroupFilterValue,
} from "./components/wiki/classic-group-filter"
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
  const requestedGroup = searchParams.get("group")?.trim() ?? ""
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
  const requestedGroupId = Number(requestedGroup)
  const selectedGroup = selection?.groups.find(
    (group) =>
      Number.isInteger(requestedGroupId) && group.id === requestedGroupId
  )
  const showUngroupedOnly = Boolean(
    selection?.ungroupedIdols.length &&
    requestedGroup === CLASSIC_UNGROUPED_FILTER
  )
  const groupFilterValue: ClassicGroupFilterValue = selectedGroup
    ? selectedGroup.id
    : showUngroupedOnly
      ? CLASSIC_UNGROUPED_FILTER
      : null
  const groups = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || showUngroupedOnly) return []
    const visibleGroups = selectedGroup ? [selectedGroup] : selection.groups
    if (!normalized) return visibleGroups
    return visibleGroups
      .map((group) => ({
        ...group,
        idols: group.name.toLocaleLowerCase("zh-CN").includes(normalized)
          ? group.idols
          : group.idols.filter((idol) =>
              idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
            ),
      }))
      .filter((group) => group.idols.length)
  }, [deferredQuery, selectedGroup, selection, showUngroupedOnly])
  const ungroupedIdols = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("zh-CN")
    if (!selection || selectedGroup) return []
    if (!normalized) return selection.ungroupedIdols
    return selection.ungroupedIdols.filter((idol) =>
      idol.name.toLocaleLowerCase("zh-CN").includes(normalized)
    )
  }, [deferredQuery, selectedGroup, selection])
  const contentPageCount = selection
    ? new Set(
        [
          ...selection.groups.flatMap((group) => group.idols),
          ...selection.ungroupedIdols,
        ].map((idol) => idol.id)
      ).size
    : 0
  const modernWikiAgency = requestIsCurrent
    ? selection?.agency.name
    : requestedAgency
  const modernWikiHref = modernWikiAgency
    ? `/wiki/modern?agency=${encodeURIComponent(modernWikiAgency)}`
    : "/wiki/modern"
  const style = {
    "--classic-accent": accent,
    "--classic-banner-ink": contrastingWikiText(accent),
  } as CSSProperties

  function selectAgency(agency: string) {
    setQuery("")
    setNavigationOpen(false)
    setSearchParams({ agency }, { preventScrollReset: true })
  }

  function selectGroup(value: ClassicGroupFilterValue) {
    if (!selection || !requestIsCurrent) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set("agency", selection.agency.name)
    if (value === null) nextSearchParams.delete("group")
    else nextSearchParams.set("group", String(value))
    setSearchParams(nextSearchParams, { preventScrollReset: true })
  }

  return (
    <main id="main-content" className="wiki-classic-shell" style={style}>
      <ClassicWikiBackground layers={backgroundLayers} />
      <ClassicMobileBar
        navigationOpen={navigationOpen}
        modernWikiHref={modernWikiHref}
        onOpenNavigation={() => setNavigationOpen(true)}
      />

      <div className="wiki-classic-window">
        <ClassicAgencyNavigation
          catalog={catalog}
          requestedAgency={requestedAgency}
          requestIsCurrent={requestIsCurrent}
          navigationOpen={navigationOpen}
          modernWikiHref={modernWikiHref}
          onClose={() => setNavigationOpen(false)}
          onSelectAgency={selectAgency}
        />
        <ClassicWikiContent
          errorMessage={catalogError ? classicErrorMessage(catalogError) : null}
          loading={loading}
          requestIsCurrent={requestIsCurrent}
          selection={selection}
          contentPageCount={contentPageCount}
          query={query}
          groupFilterValue={groupFilterValue}
          groupFilterDisabled={!requestIsCurrent}
          groups={groups}
          ungroupedIdols={ungroupedIdols}
          searchEntries={catalog?.searchEntries ?? []}
          onGroupFilterChange={selectGroup}
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
      <WikiBackToTop variant="classic" />
    </main>
  )
}

export default ClassicWikiPage
