import { useRequest } from "alova/client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import {
  deleteWikiCategory,
  deleteWikiStoryGroup,
  deleteWikiStoryLink,
  getAdminWikiCatalog,
  getAdminWikiStoryCoverAssets,
  getAdminWikiStories,
  getWikiStorySourceCatalog,
} from "~/lib/api"
import type {
  WikiAdminCatalog,
  WikiAdminIdol,
  WikiStoryCoverAsset,
  WikiStorySourceCatalog,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import type { StoryCreateDefaults } from "~/pages/admin/stories/components/story-outline"
import type { WikiEntityEditorTarget } from "~/pages/admin/stories/components/wiki-entity-editor-sheet"
import {
  positiveId,
  positiveIds,
  uniqueAgencyIdols,
  type CategoryEditorState,
  type DeleteTarget,
  type StoriesRequest,
  type StoryEditorState,
} from "./wiki-workbench-model"

export function useWikiWorkbenchState() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedAgencyId = positiveId(searchParams.get("agencyId"))
  const requestedIdolId = positiveId(searchParams.get("idolId"))
  const storyQuery = searchParams.get("query") ?? ""
  const expandedParam = searchParams.get("expanded")
  const expandedCategoryIds = useMemo(
    () =>
      expandedParam === null ? undefined : new Set(positiveIds(expandedParam)),
    [expandedParam]
  )
  const {
    data: catalogResult,
    loading: catalogLoading,
    error: catalogError,
    send: refreshCatalog,
    onError,
  } = useRequest(getAdminWikiCatalog(), {
    initialData: { status: "success" as const, agencies: [] },
  })
  onError(() => undefined)
  const catalog = catalogResult as WikiAdminCatalog
  const {
    data: sourceCatalogResult,
    loading: sourceCatalogLoading,
    error: sourceCatalogError,
    send: refreshSourceCatalog,
    onError: onSourceCatalogError,
  } = useRequest(getWikiStorySourceCatalog(), {
    initialData: {
      status: "success" as const,
      contentTypes: [],
      sourcePlatforms: [],
    },
  })
  onSourceCatalogError(() => undefined)
  const sourceCatalog = sourceCatalogResult as WikiStorySourceCatalog
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false)
  const [entityTarget, setEntityTarget] =
    useState<WikiEntityEditorTarget | null>(null)
  const [storyEditor, setStoryEditor] = useState<StoryEditorState | null>(null)
  const [categoryEditor, setCategoryEditor] =
    useState<CategoryEditorState | null>(null)
  const [sourceCatalogOpen, setSourceCatalogOpen] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [coverAssets, setCoverAssets] = useState<WikiStoryCoverAsset[]>([])
  const [storiesRequest, setStoriesRequest] = useState<StoriesRequest>({
    key: "",
    data: null,
    error: null,
  })

  const selectedAgency =
    catalog.agencies.find((agency) => agency.id === requestedAgencyId) ??
    catalog.agencies[0]
  const agencyIdols = useMemo(
    () => uniqueAgencyIdols(selectedAgency),
    [selectedAgency]
  )
  const selectedIdol =
    agencyIdols.find((idol) => idol.id === requestedIdolId) ?? agencyIdols[0]
  const normalizedAgencyId = selectedAgency?.id ?? null
  const normalizedIdolId = selectedIdol?.id ?? null
  const selectedAgencyName = selectedAgency?.name ?? ""
  const selectedIdolName = selectedIdol?.name ?? ""
  const storiesRequestKey = [
    selectedAgency?.id ?? "",
    selectedIdol?.id ?? "",
    refreshVersion,
  ].join("\u0000")
  const setSelection = useCallback(
    (agencyId: number, idolId: number | null, replace = false) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("agencyId", String(agencyId))
          if (idolId) next.set("idolId", String(idolId))
          else next.delete("idolId")
          return next
        },
        { preventScrollReset: true, replace }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    if (!normalizedAgencyId) return
    if (
      requestedAgencyId === normalizedAgencyId &&
      requestedIdolId === normalizedIdolId
    ) {
      return
    }
    setSelection(normalizedAgencyId, normalizedIdolId, true)
  }, [
    normalizedAgencyId,
    normalizedIdolId,
    requestedAgencyId,
    requestedIdolId,
    setSelection,
  ])

  useEffect(() => {
    if (!normalizedAgencyId) return
    let active = true
    void getAdminWikiStoryCoverAssets(normalizedAgencyId)
      .send()
      .then((result) => {
        if (active) setCoverAssets(result.assets)
      })
      .catch(() => {
        if (active) setCoverAssets([])
      })
    return () => {
      active = false
    }
  }, [normalizedAgencyId, refreshVersion])

  useEffect(() => {
    if (!selectedAgencyName || !selectedIdolName) return

    let active = true
    void getAdminWikiStories(selectedAgencyName, selectedIdolName)
      .send()
      .then((result) => {
        if (active) {
          setStoriesRequest({
            key: storiesRequestKey,
            data: result,
            error: null,
          })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStoriesRequest({
            key: storiesRequestKey,
            data: null,
            error,
          })
        }
      })

    return () => {
      active = false
    }
  }, [selectedAgencyName, selectedIdolName, storiesRequestKey])

  const requestIsCurrent = storiesRequest.key === storiesRequestKey
  const stories = requestIsCurrent ? storiesRequest.data : null
  const storiesError = requestIsCurrent ? storiesRequest.error : null
  const storiesLoading = Boolean(
    selectedAgencyName && selectedIdolName && !requestIsCurrent
  )
  const setStoryQuery = useCallback(
    (query: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (query) next.set("query", query)
          else next.delete("query")
          return next
        },
        { preventScrollReset: true, replace: true }
      )
    },
    [setSearchParams]
  )
  const setCategoryOpen = useCallback(
    (categoryId: number, open: boolean) => {
      const currentIds = new Set(
        expandedCategoryIds ?? stories?.categories.map(({ id }) => id) ?? []
      )
      if (open) currentIds.add(categoryId)
      else currentIds.delete(categoryId)
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("expanded", [...currentIds].sort((a, b) => a - b).join(","))
          return next
        },
        { preventScrollReset: true }
      )
    },
    [expandedCategoryIds, setSearchParams, stories]
  )
  const storyUrl =
    selectedAgency && selectedIdol
      ? `/story?agency=${encodeURIComponent(selectedAgency.name)}&idol=${encodeURIComponent(selectedIdol.name)}`
      : "/wiki/"

  function chooseAgency(value: string) {
    const agencyId = Number(value)
    const agency = catalog.agencies.find((item) => item.id === agencyId)
    setSelection(agencyId, uniqueAgencyIdols(agency)[0]?.id ?? null)
  }

  function chooseIdol(idol: WikiAdminIdol) {
    if (selectedAgency) setSelection(selectedAgency.id, idol.id)
    setMobileExplorerOpen(false)
  }

  function reloadStories() {
    setRefreshVersion((current) => current + 1)
  }

  async function refreshAll() {
    try {
      await refreshCatalog()
      reloadStories()
    } catch {
      // The request state renders the actionable error message.
    }
  }

  function handleEntitySaved() {
    void refreshCatalog().catch(() => undefined)
    reloadStories()
  }

  function openCreateStory(defaults: StoryCreateDefaults) {
    const template = defaults.template
    setStoryEditor({
      story: defaults.cardName ? (template ?? null) : null,
      mode: defaults.cardName ? "add-sources" : "create-card",
      defaults: {
        category: defaults.category,
        cardName: defaults.cardName,
        subtitle: template?.subtitle,
        imageUrl: template?.imageUrl,
        imageTransform: template?.imageTransform,
        mediaRevision: template?.mediaRevision,
      },
    })
  }

  const deleteConfirm = useConfirmAction<DeleteTarget>({
    onConfirm: async (target) => {
      if (!selectedAgency || !selectedIdol) {
        throw new Error("未选择企划或内容页")
      }
      if (target.kind === "category") {
        await deleteWikiCategory({
          agency: selectedAgency.name,
          idol: selectedIdol.name,
          category: target.category,
          expectedRevision: target.revision,
        }).send()
      } else if (target.kind === "card") {
        await deleteWikiStoryGroup({
          agency: selectedAgency.name,
          idol: selectedIdol.name,
          category: target.category,
          cardName: target.cardName,
          expectedRevision: target.revision,
        }).send()
      } else {
        await deleteWikiStoryLink({
          agency: selectedAgency.name,
          idol: selectedIdol.name,
          storyId: target.storyId,
          expectedRevision: target.mediaRevision,
        }).send()
      }
      reloadStories()
    },
    getTitle: (target) =>
      target.kind === "category"
        ? "删除整个分类？"
        : target.kind === "card"
          ? "删除整张卡片？"
          : "删除这条来源？",
    getDescription: (target) =>
      target.kind === "category"
        ? target.linkCount
          ? `“${target.category}”中的 ${target.linkCount} 条来源链接及图片会永久删除。`
          : `空分类“${target.category}”会永久删除。`
        : target.kind === "card"
          ? `“${target.cardName}”的 ${target.linkCount} 条来源链接及图片会永久删除。`
          : target.sourceCount === 1
            ? `“${target.videoTitle}”是“${target.cardName}”的最后一个来源，删除后卡片会保留为空卡片。`
            : `来源“${target.videoTitle}”会从卡片中永久删除，其他来源和卡片图片保持不变。`,
    successMessage: (target) =>
      target.kind === "category"
        ? `分类“${target.category}”已删除`
        : target.kind === "card"
          ? `卡片“${target.cardName}”已删除`
          : "剧情来源已删除",
  })

  return {
    catalog,
    catalogLoading,
    catalogError,
    sourceCatalog,
    sourceCatalogLoading,
    sourceCatalogError,
    selectedAgency,
    selectedIdol,
    stories,
    storiesError,
    storiesLoading,
    coverAssets,
    expandedCategoryIds,
    storyQuery,
    mobileExplorerOpen,
    setMobileExplorerOpen,
    entityTarget,
    setEntityTarget,
    storyEditor,
    setStoryEditor,
    categoryEditor,
    setCategoryEditor,
    sourceCatalogOpen,
    setSourceCatalogOpen,
    setSelection,
    chooseAgency,
    chooseIdol,
    reloadStories,
    refreshAll,
    handleEntitySaved,
    openCreateStory,
    setStoryQuery,
    setCategoryOpen,
    storyUrl,
    deleteConfirm,
    refreshCatalog,
    refreshSourceCatalog,
  }
}
