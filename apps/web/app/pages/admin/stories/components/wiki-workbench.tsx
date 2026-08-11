import { useRequest } from "alova/client"
import {
  ArrowUpRightIcon,
  Building2Icon,
  ImagesIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { WikiEntryKindBadge } from "~/components/wiki/wiki-entry-kind"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { Skeleton } from "~/components/ui/skeleton"
import { AdminPageHeader } from "~/components/admin/admin-ui"
import { StoryCategoryEditorDialog } from "~/pages/admin/stories/components/story-category-editor-dialog"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import {
  StoryEditorDialog,
  type StoryEditorDefaults,
  type StoryEditorMode,
} from "~/pages/admin/stories/components/story-editor-dialog"
import {
  StoryOutline,
  type StoryCreateDefaults,
} from "~/pages/admin/stories/components/story-outline"
import { StorySourceCatalogDialog } from "~/pages/admin/stories/components/story-source-catalog-dialog"
import {
  WikiEntityEditorDialog,
  type WikiEntityEditorTarget,
} from "~/pages/admin/stories/components/wiki-entity-editor-sheet"
import { WikiHierarchyExplorer } from "~/pages/admin/stories/components/wiki-hierarchy-explorer"
import {
  deleteWikiCategory,
  deleteWikiStoryLink,
  deleteWikiStoryGroup,
  getAdminWikiCatalog,
  getAdminWikiStoryCoverAssets,
  getAdminWikiStories,
  getWikiStorySourceCatalog,
  isApiError,
} from "~/lib/api"
import type {
  WikiAdminAgency,
  WikiAdminCatalog,
  WikiAdminIdol,
  WikiAdminStories,
  WikiAdminStory,
  WikiAdminStoryCard,
  WikiStorySourceCatalog,
  WikiStoryCoverAsset,
} from "~/lib/api"

type StoriesRequest = {
  key: string
  data: WikiAdminStories | null
  error: unknown
}

type StoryEditorState = {
  story: WikiAdminStory | WikiAdminStoryCard | null
  defaults: StoryEditorDefaults
  mode: StoryEditorMode
}

type WikiAdminCategory = WikiAdminStories["categories"][number]

type CategoryEditorState = {
  category: WikiAdminCategory | null
}

type DeleteTarget =
  | {
      kind: "card"
      category: string
      cardName: string
      linkCount: number
      revision: number
    }
  | {
      kind: "category"
      category: string
      linkCount: number
      revision: number
    }
  | {
      kind: "source"
      storyId: number
      videoTitle: string
      cardName: string
      sourceCount: number
      mediaRevision: number
    }

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function WikiWorkbench() {
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

  const explorer = selectedAgency ? (
    <WikiHierarchyExplorer
      agency={selectedAgency}
      selectedIdolId={selectedIdol?.id ?? null}
      onSelectIdol={chooseIdol}
      onCreateGroup={() =>
        setEntityTarget({ kind: "group", agency: selectedAgency, entity: null })
      }
      onEditGroup={(group) =>
        setEntityTarget({
          kind: "group",
          agency: selectedAgency,
          entity: group,
        })
      }
      onCreateIdol={() =>
        setEntityTarget({ kind: "idol", agency: selectedAgency, entity: null })
      }
    />
  ) : null

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminPageHeader
        eyebrow="WIKI WORKBENCH"
        title="Wiki 内容工作台"
        description="按企划、栏目与内容页定位资料，维护卡片媒体、来源平台和页面信息。"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={sourceCatalogLoading || Boolean(sourceCatalogError)}
              onClick={() => setSourceCatalogOpen(true)}
            >
              <Settings2Icon data-icon="inline-start" />
              类型与来源
            </Button>
            <Link
              to={`/admin/stories/assets?agencyId=${selectedAgency?.id ?? ""}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ImagesIcon data-icon="inline-start" />
              企划素材库
            </Link>
            <Button
              variant="outline"
              render={<a href={storyUrl} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              <ArrowUpRightIcon data-icon="inline-start" />
              打开公开页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={catalogLoading || storiesLoading}
              onClick={() => void refreshAll()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
          </>
        }
      />

      {catalogError ? (
        <Alert>
          <AlertTitle>Wiki 目录加载失败</AlertTitle>
          <AlertDescription>{errorMessage(catalogError)}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="企划工具栏"
        className="flex flex-col gap-3 border-y bg-muted/20 p-3 sm:flex-row sm:items-end"
      >
        {catalog.agencies.length ? (
          <Field className="min-w-0 flex-1 sm:max-w-sm">
            <FieldLabel htmlFor="wiki-workbench-agency">当前企划</FieldLabel>
            <Select
              items={catalog.agencies.map((agency) => ({
                label: agency.name,
                value: String(agency.id),
              }))}
              value={selectedAgency ? String(selectedAgency.id) : ""}
              onValueChange={(value) => chooseAgency(String(value))}
            >
              <SelectTrigger id="wiki-workbench-agency" className="w-full">
                <SelectValue>
                  {() =>
                    selectedAgency ? (
                      <AgencySelectLabel agency={selectedAgency} />
                    ) : (
                      "选择企划"
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {catalog.agencies.map((agency) => (
                    <SelectItem
                      key={agency.id}
                      value={String(agency.id)}
                      className="h-9"
                    >
                      <AgencySelectLabel agency={agency} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">企划目录</p>
            <p className="text-xs text-muted-foreground">
              创建首个企划后即可继续添加栏目与内容页。
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {selectedAgency ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setEntityTarget({
                  kind: "agency",
                  entity: selectedAgency,
                })
              }
            >
              <PencilIcon data-icon="inline-start" />
              编辑企划
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => setEntityTarget({ kind: "agency", entity: null })}
          >
            <PlusIcon data-icon="inline-start" />
            新增企划
          </Button>
        </div>
      </section>

      {catalogLoading && !catalog.agencies.length ? (
        <WorkbenchSkeleton />
      ) : !selectedAgency ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有 Wiki 企划</EmptyTitle>
            <EmptyDescription>
              从企划开始建立栏目、内容页和剧情内容层级。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              onClick={() => setEntityTarget({ kind: "agency", entity: null })}
            >
              <PlusIcon data-icon="inline-start" />
              新增企划
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="min-h-128 overflow-hidden rounded-lg border lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden min-w-0 border-r bg-muted/20 lg:block">
            {explorer}
          </aside>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 border-b p-3 lg:hidden">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">当前内容页</p>
                <p className="truncate text-sm font-medium">
                  {selectedIdol?.name ?? "尚未选择"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMobileExplorerOpen(true)}
              >
                <MenuIcon data-icon="inline-start" />
                选择内容页
              </Button>
            </div>

            {selectedIdol ? (
              <>
                <IdolSummary
                  agency={selectedAgency}
                  idol={selectedIdol}
                  onEdit={() =>
                    setEntityTarget({
                      kind: "idol",
                      agency: selectedAgency,
                      entity: selectedIdol,
                    })
                  }
                />

                {storiesError ? (
                  <div className="p-4">
                    <Alert>
                      <AlertTitle>剧情数据加载失败</AlertTitle>
                      <AlertDescription>
                        {errorMessage(storiesError)}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : storiesLoading || !stories ? (
                  <StoryOutlineSkeleton />
                ) : (
                  <StoryOutline
                    stories={stories}
                    query={storyQuery}
                    onQueryChange={setStoryQuery}
                    expandedCategoryIds={expandedCategoryIds}
                    onCategoryOpenChange={setCategoryOpen}
                    onCreateCategory={() =>
                      setCategoryEditor({ category: null })
                    }
                    onCreate={openCreateStory}
                    onEditCategory={(category) =>
                      setCategoryEditor({ category })
                    }
                    onEditCard={(card) => {
                      setStoryEditor({
                        story: card,
                        defaults: {},
                        mode: "edit-card",
                      })
                    }}
                    onEdit={(story) =>
                      setStoryEditor({
                        story,
                        defaults: {},
                        mode: "edit-source",
                      })
                    }
                    onDeleteSource={(story, sourceCount) =>
                      deleteConfirm.requestAction({
                        kind: "source",
                        storyId: story.id,
                        videoTitle: story.videoTitle,
                        cardName: story.cardName,
                        sourceCount,
                        mediaRevision: story.mediaRevision,
                      })
                    }
                    onDeleteCard={(card) =>
                      deleteConfirm.requestAction({
                        kind: "card",
                        category: card.category,
                        cardName: card.name,
                        linkCount: card.stories.length,
                        revision: card.mediaRevision,
                      })
                    }
                    onDeleteCategory={(category, linkCount) =>
                      deleteConfirm.requestAction({
                        kind: "category",
                        category: category.name,
                        linkCount,
                        revision: category.revision ?? 0,
                      })
                    }
                  />
                )}
              </>
            ) : (
              <Empty className="min-h-128 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRoundIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>这个企划还没有内容页</EmptyTitle>
                  <EmptyDescription>
                    可以直接新增内容页，也可以先建立栏目后再归档。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setEntityTarget({
                        kind: "group",
                        agency: selectedAgency,
                        entity: null,
                      })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    新增栏目
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      setEntityTarget({
                        kind: "idol",
                        agency: selectedAgency,
                        entity: null,
                      })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    新增内容页
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>
        </div>
      )}

      <Sheet open={mobileExplorerOpen} onOpenChange={setMobileExplorerOpen}>
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))]">
          <SheetHeader className="border-b">
            <SheetTitle>选择内容页</SheetTitle>
            <SheetDescription>
              同一内容页可归入多个栏目，选择状态会自动同步。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{explorer}</div>
        </SheetContent>
      </Sheet>

      <WikiEntityEditorDialog
        target={entityTarget}
        open={Boolean(entityTarget)}
        onOpenChange={(open) => {
          if (!open) setEntityTarget(null)
        }}
        onSaved={handleEntitySaved}
      />

      {selectedAgency && selectedIdol && storyEditor ? (
        <StoryEditorDialog
          key={[
            storyEditor.story?.cardId ?? "new",
            storyEditor.mode,
            storyEditor.defaults.category ?? "",
            storyEditor.defaults.cardName ?? "",
          ].join("-")}
          open
          story={storyEditor.story}
          agency={selectedAgency.name}
          idol={selectedIdol.name}
          categories={stories?.categories ?? []}
          contentTypes={stories?.contentTypes ?? []}
          sourcePlatforms={stories?.sourcePlatforms ?? []}
          coverAssets={coverAssets}
          defaultCategory=""
          defaults={storyEditor.defaults}
          mode={storyEditor.mode}
          onOpenChange={(open) => {
            if (!open) setStoryEditor(null)
          }}
          onSaved={reloadStories}
        />
      ) : null}

      {sourceCatalogOpen ? (
        <StorySourceCatalogDialog
          open={sourceCatalogOpen}
          contentTypes={sourceCatalog.contentTypes}
          sourcePlatforms={sourceCatalog.sourcePlatforms}
          onOpenChange={setSourceCatalogOpen}
          onSaved={() => {
            reloadStories()
            void refreshSourceCatalog().catch(() => undefined)
          }}
        />
      ) : null}

      {selectedAgency && selectedIdol && categoryEditor ? (
        <StoryCategoryEditorDialog
          key={categoryEditor.category?.id ?? "new"}
          open
          agencyId={selectedAgency.id}
          idolId={selectedIdol.id}
          agencyName={selectedAgency.name}
          idolName={selectedIdol.name}
          category={categoryEditor.category}
          onOpenChange={(open) => {
            if (!open) setCategoryEditor(null)
          }}
          onSaved={reloadStories}
        />
      ) : null}

      <ConfirmActionDialog
        open={deleteConfirm.open}
        onOpenChange={deleteConfirm.onOpenChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        submitting={deleteConfirm.submitting}
        onConfirm={() => void deleteConfirm.confirmAction()}
      />
    </div>
  )
}

function IdolSummary({
  agency,
  idol,
  onEdit,
}: {
  agency: WikiAdminAgency
  idol: WikiAdminIdol
  onEdit: () => void
}) {
  const groups = agency.groups.filter(
    (group) =>
      idol.groupIds.includes(group.id) ||
      group.idolIds.includes(idol.id) ||
      group.idols.some((candidate) => candidate.id === idol.id)
  )

  return (
    <section
      aria-labelledby="wiki-idol-summary-title"
      className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center"
    >
      <Avatar className="size-14 rounded-lg">
        {idol.imageUrl ? (
          <WikiTransformedImage
            src={idol.imageUrl}
            alt=""
            transform={idol.imageTransform}
            className="rounded-lg"
          />
        ) : null}
        {!idol.imageUrl ? (
          <AvatarFallback className="rounded-lg">
            {idol.name.slice(0, 1)}
          </AvatarFallback>
        ) : null}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="wiki-idol-summary-title" className="text-base font-semibold">
            {idol.name}
          </h2>
          <Badge variant={idol.wikiEnabled ? "secondary" : "outline"}>
            {idol.wikiEnabled ? "公开显示" : "暂不公开"}
          </Badge>
          <WikiEntryKindBadge
            kind={idol.entryKind}
            subtype={idol.entrySubtype}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ID {idol.id} · 素材目录 {idol.folderName}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <Badge key={group.id} variant="outline">
              {group.name}
            </Badge>
          ))}
          {!groups.length ? <Badge variant="outline">未归档</Badge> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onEdit}>
          <PencilIcon data-icon="inline-start" />
          编辑内容页
        </Button>
      </div>
    </section>
  )
}

function WorkbenchSkeleton() {
  return (
    <div className="grid min-h-128 overflow-hidden rounded-lg border lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="hidden border-r bg-muted/20 p-3 lg:flex lg:flex-col lg:gap-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-11/12" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

function StoryOutlineSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="正在加载剧情大纲">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function uniqueAgencyIdols(agency?: WikiAdminAgency) {
  if (!agency) return []
  const idolsById = new Map<number, WikiAdminIdol>()
  for (const idol of agency.idols) idolsById.set(idol.id, idol)
  for (const group of agency.groups) {
    for (const idol of group.idols) {
      if (!idolsById.has(idol.id)) idolsById.set(idol.id, idol)
    }
  }
  return [...idolsById.values()].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id - right.id
  )
}

function positiveId(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function positiveIds(value: string) {
  return [
    ...new Set(value.split(",").map((item) => positiveId(item.trim()))),
  ].filter((item): item is number => item !== null)
}

function AgencySelectLabel({ agency }: { agency: WikiAdminAgency }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted">
        {agency.iconUrl ? (
          <WikiTransformedImage
            src={agency.iconUrl}
            alt=""
            transform={agency.imageTransform}
          />
        ) : (
          <span
            className="size-2 rounded-full border"
            style={{ backgroundColor: agency.color ?? undefined }}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="truncate">{agency.name}</span>
    </span>
  )
}
