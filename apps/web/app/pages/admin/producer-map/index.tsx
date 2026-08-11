import { useRequest } from "alova/client"
import {
  ExternalLinkIcon,
  ImageIcon,
  LoaderCircleIcon,
  MapPinnedIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react"
import { useRef, useState, type FormEvent } from "react"
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
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  getAdminProducerMapContent,
  getProducerMapGeometry,
  updateAdminProducerMapContent,
  type ProducerMapAdminSnapshot,
  type ProducerMapCommunity,
  type ProducerMapContent,
  type ProducerMapRegion,
} from "~/lib/api"
import { SortableList } from "~/components/admin/sortable-list"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
  adminTextareaClass,
} from "~/components/admin/admin-ui"
import {
  CommunityEditorDialog,
  RegionEditorDialog,
} from "~/pages/admin/producer-map/components/producer-map-editor-dialogs"
import { RegionMapManager } from "~/pages/admin/producer-map/components/region-map-manager"
import {
  createCommunity,
  createProducerMapDraft,
  createRegion,
  seriesOptions,
} from "~/pages/admin/producer-map/producer-map-model"

type ChangeContent = (
  update: (content: ProducerMapContent) => ProducerMapContent
) => void

interface EditorState<Item> {
  index: number | null
  value: Item
}

type DeleteTarget =
  | { kind: "region"; item: ProducerMapRegion }
  | { kind: "community"; item: ProducerMapCommunity }

function formatUpdateTime(value: string | null): string {
  if (!value) return "尚未保存过自定义配置"
  return `最近保存：${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`
}

function seriesLabel(value: ProducerMapRegion["series"]): string {
  return seriesOptions.find((option) => option.value === value)?.label ?? value
}

function ListThumbnail({ value }: { value: string | null }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/25 text-muted-foreground">
      {value && !failed ? (
        <img
          src={value}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon aria-hidden="true" />
      )}
    </div>
  )
}

function CommunityRow({
  community,
  onEdit,
  onDelete,
}: {
  community: ProducerMapCommunity
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex min-h-18 min-w-0 items-center gap-3 py-3">
      <ListThumbnail
        key={community.imageUrl ?? "empty"}
        value={community.imageUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{community.name}</p>
          <Badge variant={community.enabled ? "secondary" : "outline"}>
            {community.enabled ? "公开" : "隐藏"}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {community.platform} · {community.region ?? "全国"} ·{" "}
          {seriesLabel(community.series)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`编辑${community.name}`}
          onClick={onEdit}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`删除${community.name}`}
          onClick={onDelete}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function PageMetadataFields({
  draft,
  change,
}: {
  draft: ProducerMapContent
  change: ChangeContent
}) {
  return (
    <AdminPanel
      title="页面信息"
      description="公开页的标题、说明、名录名称与地图署名。"
      icon={MapPinnedIcon}
      contentClassName="flex flex-col gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <AdminField label="页面标题" htmlFor="producer-map-title">
          <input
            id="producer-map-title"
            className={adminControlClass}
            maxLength={80}
            required
            value={draft.title}
            onChange={(event) =>
              change((content) => ({
                ...content,
                title: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="英文副标题" htmlFor="producer-map-subtitle">
          <input
            id="producer-map-subtitle"
            className={adminControlClass}
            maxLength={120}
            value={draft.subtitle}
            onChange={(event) =>
              change((content) => ({
                ...content,
                subtitle: event.target.value,
              }))
            }
          />
        </AdminField>
      </div>
      <AdminField label="页面简介" htmlFor="producer-map-introduction">
        <textarea
          id="producer-map-introduction"
          className={`${adminTextareaClass} min-h-24`}
          maxLength={300}
          required
          value={draft.introduction}
          onChange={(event) =>
            change((content) => ({
              ...content,
              introduction: event.target.value,
            }))
          }
        />
      </AdminField>
      <div className="grid gap-5 lg:grid-cols-3">
        <AdminField label="名录标题" htmlFor="producer-map-directory-title">
          <input
            id="producer-map-directory-title"
            className={adminControlClass}
            maxLength={80}
            required
            value={draft.directoryTitle}
            onChange={(event) =>
              change((content) => ({
                ...content,
                directoryTitle: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="地图来源名称" htmlFor="producer-map-source-label">
          <input
            id="producer-map-source-label"
            className={adminControlClass}
            maxLength={100}
            required
            value={draft.mapSourceLabel}
            onChange={(event) =>
              change((content) => ({
                ...content,
                mapSourceLabel: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="地图来源链接" htmlFor="producer-map-source-url">
          <input
            id="producer-map-source-url"
            type="url"
            className={adminControlClass}
            maxLength={500}
            required
            value={draft.mapSourceUrl}
            onChange={(event) =>
              change((content) => ({
                ...content,
                mapSourceUrl: event.target.value,
              }))
            }
          />
        </AdminField>
      </div>
    </AdminPanel>
  )
}

export function meta() {
  return [{ title: "制作人地图配置 | IMSWeb" }]
}

export function ProducerMapManager() {
  const {
    loading,
    error,
    send: refresh,
    onError,
    onSuccess,
  } = useRequest(getAdminProducerMapContent())
  const {
    data: geometry,
    loading: geometryLoading,
    error: geometryError,
    send: refreshGeometry,
    onError: onGeometryError,
  } = useRequest(getProducerMapGeometry(), {
    force: ({ args }) => args[0] === true,
  })
  const [draft, setDraft] = useState<ProducerMapContent | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regionEditor, setRegionEditor] =
    useState<EditorState<ProducerMapRegion> | null>(null)
  const [communityEditor, setCommunityEditor] =
    useState<EditorState<ProducerMapCommunity> | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const regionEditorReturnFocusRef = useRef<HTMLElement | null>(null)

  onError(() => undefined)
  onGeometryError(() => undefined)
  onSuccess((event) => {
    const snapshot = event.data as ProducerMapAdminSnapshot
    setDraft(snapshot.content ?? createProducerMapDraft())
    setRevision(snapshot.revision)
    setDirty(false)
  })

  function change(update: (content: ProducerMapContent) => ProducerMapContent) {
    setDraft((current) => (current ? update(current) : current))
    setDirty(true)
  }

  async function refreshAll() {
    await Promise.allSettled([refresh(), refreshGeometry(true)])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    try {
      const result = await updateAdminProducerMapContent(draft, revision).send()
      setDraft(result.content)
      setRevision(result.revision)
      setDirty(false)
      toast.success("制作人地图已保存")
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "制作人地图保存失败"
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading && !draft) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
        正在读取制作人地图配置
      </div>
    )
  }

  if (error || !draft) {
    return (
      <Alert variant="destructive">
        <AlertTitle>制作人地图配置读取失败</AlertTitle>
        <AlertDescription className="mt-2 flex flex-col items-start gap-4">
          <span>{error?.message || "请检查 API 与对象存储连接。"}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshAll()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const currentDraft = draft
  function openRegionEditor(province: string) {
    const activeElement = document.activeElement
    regionEditorReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.getElementById("producer-map-region-selection")
    const index = currentDraft.regions.findIndex(
      (region) => region.province === province
    )
    setRegionEditor({
      index: index < 0 ? null : index,
      value: index < 0 ? createRegion(province) : currentDraft.regions[index]!,
    })
  }

  function saveRegion(region: ProducerMapRegion) {
    if (!regionEditor) return
    change((content) => ({
      ...content,
      regions:
        regionEditor.index === null
          ? [...content.regions, region]
          : content.regions.map((item, index) =>
              index === regionEditor.index ? region : item
            ),
    }))
    setRegionEditor(null)
  }

  function saveCommunity(community: ProducerMapCommunity) {
    if (!communityEditor) return
    change((content) => ({
      ...content,
      communities:
        communityEditor.index === null
          ? [...content.communities, community]
          : content.communities.map((item, index) =>
              index === communityEditor.index ? community : item
            ),
    }))
    setCommunityEditor(null)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.kind === "region") {
      const id = deleteTarget.item.id
      change((content) => ({
        ...content,
        regions: content.regions.filter((region) => region.id !== id),
      }))
    } else {
      const id = deleteTarget.item.id
      change((content) => ({
        ...content,
        communities: content.communities.filter(
          (community) => community.id !== id
        ),
      }))
    }
    setDeleteTarget(null)
  }

  const deleteLabel = deleteTarget?.item.name ?? "该条目"

  return (
    <>
      <form className="flex flex-col gap-8" onSubmit={save}>
        <AdminPageHeader
          eyebrow="COMMUNITY DIRECTORY"
          title="制作人地图配置"
          description={`${formatUpdateTime(draft.updatedAt)}。保存后公开地图与社群名录会立即使用新配置。`}
          actions={
            <>
              <Button
                variant="outline"
                render={
                  <a href="/producer-map" target="_blank" rel="noreferrer" />
                }
                nativeButton={false}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                查看公开页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || geometryLoading || saving}
                onClick={() => void refreshAll()}
              >
                <RefreshCwIcon data-icon="inline-start" />
                重新读取
              </Button>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? (
                  <LoaderCircleIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                保存更改
              </Button>
            </>
          }
        />

        <PageMetadataFields draft={draft} change={change} />

        <Tabs defaultValue="regions">
          <TabsList className="grid w-full grid-cols-2 sm:w-fit">
            <TabsTrigger value="regions">
              <MapPinnedIcon data-icon="inline-start" />
              地图地点
            </TabsTrigger>
            <TabsTrigger value="communities">
              <UsersRoundIcon data-icon="inline-start" />
              社群名录
            </TabsTrigger>
          </TabsList>

          <TabsContent value="regions">
            <RegionMapManager
              geometry={geometry}
              geometryLoading={geometryLoading}
              geometryError={geometryError}
              regions={draft.regions}
              disabled={saving}
              onCreate={openRegionEditor}
              onEdit={(region) => openRegionEditor(region.province)}
              onDelete={(region) =>
                setDeleteTarget({ kind: "region", item: region })
              }
              onReorder={(regions) =>
                change((content) => ({ ...content, regions }))
              }
              onRetryGeometry={() => void refreshGeometry(true)}
            />
          </TabsContent>

          <TabsContent value="communities">
            <AdminPanel
              title="社群名录"
              description={`${draft.communities.length} 个社群，拖动可调整公开页顺序。`}
              icon={UsersRoundIcon}
              action={
                <Button
                  type="button"
                  size="sm"
                  disabled={draft.communities.length >= 100}
                  onClick={() =>
                    setCommunityEditor({
                      index: null,
                      value: createCommunity(),
                    })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  添加社群
                </Button>
              }
              contentClassName="p-0"
            >
              {draft.communities.length ? (
                <SortableList
                  items={draft.communities}
                  disabled={saving}
                  className="border-y-0"
                  getLabel={(community) => community.name}
                  renderItem={(community) => (
                    <CommunityRow
                      community={community}
                      onEdit={() =>
                        setCommunityEditor({
                          index: draft.communities.findIndex(
                            (item) => item.id === community.id
                          ),
                          value: community,
                        })
                      }
                      onDelete={() =>
                        setDeleteTarget({ kind: "community", item: community })
                      }
                    />
                  )}
                  onReorder={(communities) =>
                    change((content) => ({ ...content, communities }))
                  }
                />
              ) : (
                <div className="p-4">
                  <AdminEmptyState
                    icon={UsersRoundIcon}
                    title="还没有社群"
                    description="新增社群后会加入公开名录。"
                  />
                </div>
              )}
            </AdminPanel>
          </TabsContent>
        </Tabs>
      </form>

      {regionEditor ? (
        <RegionEditorDialog
          key={`${regionEditor.index === null ? "new" : "edit"}-${regionEditor.value.id}`}
          region={regionEditor.value}
          creating={regionEditor.index === null}
          onOpenChange={(open) => {
            if (!open) setRegionEditor(null)
          }}
          finalFocus={() => {
            const target = regionEditorReturnFocusRef.current
            return target?.isConnected
              ? target
              : document.getElementById("producer-map-region-selection")
          }}
          onSave={saveRegion}
        />
      ) : null}

      {communityEditor ? (
        <CommunityEditorDialog
          key={`${communityEditor.index === null ? "new" : "edit"}-${communityEditor.value.id}`}
          community={communityEditor.value}
          creating={communityEditor.index === null}
          onOpenChange={(open) => {
            if (!open) setCommunityEditor(null)
          }}
          onSave={saveCommunity}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除这个条目？</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteLabel}”会从当前草稿中移除，保存页面后生效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={confirmDelete}
            >
              <Trash2Icon data-icon="inline-start" />
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default ProducerMapManager
