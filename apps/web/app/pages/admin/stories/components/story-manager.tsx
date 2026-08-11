import { useRequest } from "alova/client"
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  FolderIcon,
  Link2Icon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button, buttonVariants } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  deleteWikiCategory,
  deleteWikiStoryGroup,
  getAdminWikiCatalog,
  getAdminWikiStories,
  isApiError,
} from "~/lib/api"
import type {
  WikiAdminAgency,
  WikiAdminCatalog,
  WikiAdminStories,
  WikiAdminStory,
} from "~/lib/api"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { StoryEditorDialog } from "~/pages/admin/stories/components/story-editor-dialog"
import { StoryTable } from "~/pages/admin/stories/components/story-table"

type DeleteTarget =
  | { kind: "card"; category: string; cardName: string; linkCount: number }
  | { kind: "category"; category: string; linkCount: number }

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function SelectionControl({
  label,
  value,
  items,
  onValueChange,
}: {
  label: string
  value: string
  items: Array<{ label: string; value: string }>
  onValueChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(nextValue) => onValueChange(String(nextValue))}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export function StoryManager() {
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    send: refreshCatalog,
    onError,
  } = useRequest(getAdminWikiCatalog(), {
    initialData: { status: "success" as const, agencies: [] },
  })
  onError(() => undefined)
  const catalogData = catalog as WikiAdminCatalog
  const [agencyCode, setAgencyCode] = useState("")
  const [idolName, setIdolName] = useState("")
  const [storiesRequest, setStoriesRequest] = useState<{
    key: string
    data: WikiAdminStories | null
    error: unknown
  }>({ key: "", data: null, error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingStory, setEditingStory] = useState<WikiAdminStory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const selectedAgency: WikiAdminAgency | undefined =
    catalogData.agencies.find((agency) => agency.code === agencyCode) ??
    catalogData.agencies[0]
  const selectedAgencyIdols =
    selectedAgency?.groups.flatMap((group) => group.idols) ?? []
  const selectedIdol =
    selectedAgencyIdols.find((idol) => idol.name === idolName) ??
    selectedAgencyIdols[0]

  const selectedAgencyName = selectedAgency?.name ?? ""
  const selectedIdolName = selectedIdol?.name ?? ""
  const storiesRequestKey = [
    selectedAgencyName,
    selectedIdolName,
    refreshVersion,
  ].join("\u0000")

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

  const visibleStories = useMemo(() => {
    if (!stories) return []
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
    return stories.stories.filter((story) => {
      if (categoryFilter !== "all" && story.category !== categoryFilter) {
        return false
      }
      if (!normalizedQuery) return true
      return [
        story.category,
        story.cardName,
        story.subtitle,
        story.upName,
        story.videoTitle,
        story.url,
      ].some((value) =>
        value.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      )
    })
  }, [categoryFilter, query, stories])

  const cardCount = useMemo(
    () =>
      new Set(
        (stories?.stories ?? []).map(
          (story) => `${story.category}\u0000${story.cardName}`
        )
      ).size,
    [stories]
  )

  function chooseAgency(code: string) {
    const agency = catalogData.agencies.find((item) => item.code === code)
    setAgencyCode(code)
    setIdolName(agency?.groups[0]?.idols[0]?.name ?? "")
    setQuery("")
    setCategoryFilter("all")
  }

  function chooseIdol(name: string) {
    setIdolName(name)
    setQuery("")
    setCategoryFilter("all")
  }

  function openCreate() {
    setEditingStory(null)
    setEditorOpen(true)
  }

  function openEdit(story: WikiAdminStory) {
    setEditingStory(story)
    setEditorOpen(true)
  }

  function reloadStories() {
    setRefreshVersion((current) => current + 1)
  }

  async function refreshAll() {
    await refreshCatalog()
    reloadStories()
  }

  async function confirmDelete() {
    if (!deleteTarget || !selectedAgency || !selectedIdol) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === "category") {
        await deleteWikiCategory({
          agency: selectedAgency.name,
          idol: selectedIdol.name,
          category: deleteTarget.category,
        }).send()
        toast.success(`分类“${deleteTarget.category}”已删除`)
      } else {
        await deleteWikiStoryGroup({
          agency: selectedAgency.name,
          idol: selectedIdol.name,
          category: deleteTarget.category,
          cardName: deleteTarget.cardName,
        }).send()
        toast.success(`卡片“${deleteTarget.cardName}”已删除`)
      }
      setDeleteTarget(null)
      reloadStories()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  const storyUrl =
    selectedAgency && selectedIdol
      ? `/story?agency=${encodeURIComponent(selectedAgency.name)}&idol=${encodeURIComponent(selectedIdol.name)}`
      : "/wiki/"
  const selectedCategoryCount =
    categoryFilter === "all"
      ? 0
      : (stories?.stories ?? []).filter(
          (story) => story.category === categoryFilter
        ).length

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="STORY ARCHIVE"
        title="剧情内容管理"
        description="企划、偶像和剧情均从服务端动态读取，写入后以数据库返回状态为准。"
        actions={
          <>
            <a
              href={storyUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowUpRightIcon data-icon="inline-start" />
              打开公开页
            </a>
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

      {catalogLoading && !catalogData.agencies.length ? (
        <AdminPanel
          title="Wiki 目录"
          description="正在读取企划与偶像。"
          icon={BookOpenIcon}
        >
          <p className="py-8 text-sm text-muted-foreground">正在加载目录</p>
        </AdminPanel>
      ) : !catalogData.agencies.length ? (
        <AdminEmptyState
          icon={BookOpenIcon}
          title="还没有可管理的 Wiki 目录"
          description="请先在服务端配置企划与偶像数据。"
        />
      ) : (
        <>
          <AdminPanel
            title="管理范围"
            description="只加载当前偶像的剧情记录。"
            icon={BookOpenIcon}
            contentClassName="grid gap-6 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(20rem,1.4fr)] lg:items-end"
          >
            <SelectionControl
              label="企划"
              value={selectedAgency?.code ?? ""}
              items={catalogData.agencies.map((agency) => ({
                label: agency.name,
                value: agency.code,
              }))}
              onValueChange={chooseAgency}
            />
            <SelectionControl
              label="偶像"
              value={selectedIdol?.name ?? ""}
              items={selectedAgencyIdols.map((idol) => ({
                label: idol.name,
                value: idol.name,
              }))}
              onValueChange={chooseIdol}
            />
            <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 py-2">
              <div className="min-w-0 px-3">
                <dt className="text-xs text-muted-foreground">分类</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {stories?.categories.length ?? 0}
                </dd>
              </div>
              <div className="min-w-0 px-3">
                <dt className="text-xs text-muted-foreground">卡片</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {cardCount}
                </dd>
              </div>
              <div className="min-w-0 px-3">
                <dt className="text-xs text-muted-foreground">链接</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {stories?.stories.length ?? 0}
                </dd>
              </div>
            </dl>
          </AdminPanel>

          {storiesError ? (
            <Alert>
              <AlertTitle>剧情数据加载失败</AlertTitle>
              <AlertDescription>{errorMessage(storiesError)}</AlertDescription>
            </Alert>
          ) : storiesLoading || !stories ? (
            <AdminPanel
              title="剧情链接"
              description={`正在读取${selectedIdolName}的剧情记录。`}
              icon={Link2Icon}
            >
              <p className="py-8 text-sm text-muted-foreground">
                正在加载剧情数据
              </p>
            </AdminPanel>
          ) : (
            <AdminPanel
              title="剧情链接"
              description={`${stories.agency.name} · ${stories.idol.name}`}
              icon={Link2Icon}
              action={
                <Button type="button" onClick={openCreate}>
                  <PlusIcon data-icon="inline-start" />
                  新增链接
                </Button>
              }
              contentClassName="p-0"
            >
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="wiki-story-search">搜索</FieldLabel>
                  <div className="relative">
                    <SearchIcon
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="wiki-story-search"
                      className="pl-8"
                      placeholder="卡片、标题、投稿者或链接"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </Field>
                <Field className="w-full sm:w-56">
                  <FieldLabel>分类</FieldLabel>
                  <Select
                    items={[
                      { label: "全部分类", value: "all" },
                      ...stories.categories.map((category) => ({
                        label: category.name,
                        value: category.name,
                      })),
                    ]}
                    value={categoryFilter}
                    onValueChange={(value) => setCategoryFilter(String(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">全部分类</SelectItem>
                        {stories.categories.map((category) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {categoryFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!selectedCategoryCount}
                    onClick={() =>
                      setDeleteTarget({
                        kind: "category",
                        category: categoryFilter,
                        linkCount: selectedCategoryCount,
                      })
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除分类
                  </Button>
                ) : null}
              </div>

              {!stories.stories.length ? (
                <div className="p-4">
                  <AdminEmptyState
                    icon={BookOpenIcon}
                    title="这个偶像还没有剧情链接"
                    description="新增第一条链接后，公开剧情页会读取同一份数据。"
                  />
                </div>
              ) : !visibleStories.length ? (
                <div className="p-4">
                  <AdminEmptyState
                    icon={SearchIcon}
                    title="没有匹配的剧情链接"
                    description="调整关键词或分类后再试。"
                  />
                </div>
              ) : (
                <StoryTable
                  stories={visibleStories}
                  allStories={stories.stories}
                  onEdit={openEdit}
                  onDelete={(story, linkCount) =>
                    setDeleteTarget({
                      kind: "card",
                      category: story.category,
                      cardName: story.cardName,
                      linkCount,
                    })
                  }
                />
              )}
            </AdminPanel>
          )}
        </>
      )}

      {selectedAgency && selectedIdol && editorOpen ? (
        <StoryEditorDialog
          key={editingStory?.id ?? "new"}
          open={editorOpen}
          story={editingStory}
          agency={selectedAgency.name}
          idol={selectedIdol.name}
          categories={stories?.categories ?? []}
          contentTypes={stories?.contentTypes ?? []}
          sourcePlatforms={stories?.sourcePlatforms ?? []}
          defaultCategory={
            categoryFilter === "all"
              ? (stories?.categories[0]?.name ?? "")
              : categoryFilter
          }
          onOpenChange={setEditorOpen}
          onSaved={reloadStories}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {deleteTarget?.kind === "category" ? (
                <FolderIcon aria-hidden="true" />
              ) : (
                <Trash2Icon aria-hidden="true" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {deleteTarget?.kind === "category"
                ? "删除整个分类？"
                : "删除整张卡片？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "category"
                ? `“${deleteTarget.category}”中的 ${deleteTarget.linkCount} 条链接及图片会永久删除。`
                : `“${deleteTarget?.cardName ?? ""}”的 ${deleteTarget?.linkCount ?? 0} 个来源链接及图片会永久删除。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
