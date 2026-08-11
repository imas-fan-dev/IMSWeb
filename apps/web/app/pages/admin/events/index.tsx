import {
  CalendarDaysIcon,
  FileImageIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Skeleton } from "~/components/ui/skeleton"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  createAdminEvent,
  deleteAdminEvent,
  getEventPage,
  updateAdminEvent,
  type EventListItem,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"

export function meta() {
  return [{ title: "活动管理 | IMSWeb" }]
}

type EventDraft = {
  title: string
  name: string
  contact: string
}

const emptyDraft: EventDraft = { title: "", name: "", contact: "" }
const maxEventImageBytes = 3 * 1024 * 1024
const eventsLimit = 20

async function loadEvents(cursor?: string | null) {
  return getEventPage({
    limit: eventsLimit,
    cursor: cursor ?? undefined,
  }).send(true)
}

function mergeEvents(first: EventListItem[], existing: EventListItem[]) {
  const ids = new Set(first.map((item) => item.id))
  return [...first, ...existing.filter((item) => !ids.has(item.id))]
}

function newIdempotencyKey() {
  return crypto.randomUUID()
}

function validateImage(file: File | null, required: boolean): string | null {
  if (!file) return required ? "必须选择一张活动图片" : null
  if (!file.type.startsWith("image/") || file.size > maxEventImageBytes) {
    return "请选择不超过 3 MiB 的图片"
  }
  return null
}

export default function AdminEventsPage() {
  const { t } = useTranslation()
  const [events, setEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventListItem | null>(null)
  const [draft, setDraft] = useState<EventDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [eventImage, setEventImage] = useState<File | null>(null)
  const listFocusRef = useRef<HTMLDivElement>(null)
  const requestGenerationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const idempotencyKeyRef = useRef(newIdempotencyKey())

  const refresh = useCallback(async () => {
    const generation = ++requestGenerationRef.current
    loadingMoreRef.current = false
    setLoading(true)
    setLoadingMore(false)
    setError(false)
    try {
      const page = await loadEvents()
      if (generation !== requestGenerationRef.current) return false
      setEvents(page.items)
      setNextCursor(page.pageInfo.nextCursor)
      setHasMore(page.pageInfo.hasNextPage)
      return true
    } catch {
      if (generation !== requestGenerationRef.current) return false
      setError(true)
      return false
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(refreshTimer)
      requestGenerationRef.current += 1
      loadingMoreRef.current = false
    }
  }, [refresh])

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return
    const generation = requestGenerationRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const page = await loadEvents(nextCursor)
      if (generation !== requestGenerationRef.current) return
      setEvents((current) => mergeEvents(current, page.items))
      setNextCursor(page.pageInfo.nextCursor)
      setHasMore(page.pageInfo.hasNextPage)
    } catch {
      if (generation === requestGenerationRef.current) {
        toast.error("加载更多活动失败")
      }
    } finally {
      if (generation === requestGenerationRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  function changeEditorOpen(open: boolean) {
    if (!open && saving) return
    setEditorOpen(open)
    if (!open) {
      setEditingEvent(null)
      setDraft(emptyDraft)
      setEventImage(null)
    }
  }

  function createEvent() {
    idempotencyKeyRef.current = newIdempotencyKey()
    setEditingEvent(null)
    setDraft(emptyDraft)
    setEventImage(null)
    setEditorOpen(true)
  }

  function editEvent(item: EventListItem) {
    setEditingEvent(item)
    setDraft({
      title: item.title,
      name: item.name ?? "",
      contact: item.contact ?? "",
    })
    setEventImage(null)
    setEditorOpen(true)
  }

  function updateDraft(field: keyof EventDraft, value: string) {
    if (!editingEvent && !saving) {
      idempotencyKeyRef.current = newIdempotencyKey()
    }
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const editingTarget = editingEvent
    const imageError = validateImage(eventImage, !editingTarget)
    if (imageError) {
      toast.error(imageError)
      return
    }

    const form = new FormData()
    form.set("title", draft.title)
    form.set("name", draft.name)
    form.set("contact", draft.contact)
    if (eventImage) form.set("image", eventImage)

    setSaving(true)
    try {
      if (editingTarget) {
        await updateAdminEvent(editingTarget.id, form).send()
      } else {
        await createAdminEvent(form, idempotencyKeyRef.current).send()
      }
    } catch (mutationError) {
      toast.error(adminErrorMessage(mutationError))
      setSaving(false)
      return
    }

    toast.success(editingTarget ? "活动已更新" : "活动已发布")
    setEditorOpen(false)
    setEditingEvent(null)
    setDraft(emptyDraft)
    setEventImage(null)

    try {
      const firstPage = await loadEvents()
      if (editingTarget) {
        const fresh = firstPage.items.find(
          (item) => item.id === editingTarget.id
        )
        setEvents((current) =>
          current.map((item) =>
            item.id === editingTarget.id
              ? (fresh ?? { ...item, ...draft })
              : item
          )
        )
      } else {
        setEvents((current) => mergeEvents(firstPage.items, current))
        if (!events.length) {
          setNextCursor(firstPage.pageInfo.nextCursor)
          setHasMore(firstPage.pageInfo.hasNextPage)
        }
        idempotencyKeyRef.current = newIdempotencyKey()
      }
    } catch {
      toast.error(
        editingTarget
          ? "活动更新已成功，但列表同步失败"
          : "活动发布已成功，但列表同步失败"
      )
    } finally {
      setSaving(false)
    }
  }

  const getFallbackFocus = useCallback(
    (target: EventListItem) => {
      const index = events.findIndex((item) => item.id === target.id)
      const neighbour = events[index + 1] ?? events[index - 1]
      if (neighbour) {
        return document.querySelector<HTMLElement>(
          `[data-event-id="${neighbour.id}"] button`
        )
      }
      return listFocusRef.current
    },
    [events]
  )

  const deleteConfirm = useConfirmAction<EventListItem>({
    onConfirm: async (item) => {
      await deleteAdminEvent(item.id).send()
      setEvents((current) =>
        current.filter((eventItem) => eventItem.id !== item.id)
      )
    },
    getTitle: () => "删除社区活动？",
    getDescription: (item) =>
      `“${item.title}”及其托管图片将永久删除。此操作不可撤销。`,
    successMessage: "活动已删除",
    getFallbackFocus,
  })

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="EVENT OPERATIONS"
        title="社区活动"
        description="发布面向制作人社区的活动信息，并逐条维护现有活动。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <AdminPanel
        title="现有活动"
        description={`${events.length} 条活动`}
        icon={CalendarDaysIcon}
        contentClassName="min-w-0 pt-1"
        action={
          <Button type="button" size="sm" onClick={createEvent}>
            <PlusIcon data-icon="inline-start" />
            新建活动
          </Button>
        }
      >
        <div ref={listFocusRef} tabIndex={-1} aria-label="活动列表内容">
          {loading ? (
            <EventsSkeleton />
          ) : error ? (
            <AdminEmptyState
              icon={CalendarDaysIcon}
              title="无法读取活动"
              description="请确认服务状态后刷新页面。"
            />
          ) : events.length ? (
            <>
              <div className="divide-y border-y">
                {events.map((item) => (
                  <article
                    key={item.id}
                    data-event-id={item.id}
                    className="grid min-w-0 gap-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="aspect-video w-full overflow-hidden rounded-md border bg-muted sm:w-32">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={`${item.title}活动图片`}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageUpIcon className="size-5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <h3 className="line-clamp-2 text-sm font-semibold wrap-break-word">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.name || "未填写主办方"}
                      </p>
                      {item.contact ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.contact}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`编辑“${item.title}”`}
                        disabled={deleteConfirm.submitting}
                        onClick={() => editEvent(item)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label={`删除“${item.title}”`}
                        disabled={deleteConfirm.submitting}
                        onClick={(clickEvent) =>
                          deleteConfirm.requestAction(
                            item,
                            clickEvent.currentTarget
                          )
                        }
                      >
                        <Trash2Icon data-icon="inline-start" />
                        删除
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-muted-foreground">
                  已加载 {events.length} 条
                </p>
                {hasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : null}
                    加载更多
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <AdminEmptyState
              icon={CalendarDaysIcon}
              title="还没有活动"
              description="新建第一条面向制作人社区的活动信息。"
            />
          )}
        </div>
      </AdminPanel>

      <Dialog open={editorOpen} onOpenChange={changeEditorOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={(formEvent) => void submit(formEvent)}>
            <DialogHeader>
              <DialogTitle>
                {editingEvent ? "编辑社区活动" : "新建社区活动"}
              </DialogTitle>
              <DialogDescription>
                {editingEvent
                  ? "修改活动资料；不选择新图片时保留当前图片。"
                  : "填写活动资料并选择一张不超过 3 MiB 的图片。"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 py-5 sm:grid-cols-2">
              <AdminField
                label="活动标题"
                htmlFor="event-title"
                className="sm:col-span-2"
              >
                <input
                  id="event-title"
                  required
                  disabled={saving}
                  maxLength={160}
                  className={adminControlClass}
                  value={draft.title}
                  onChange={(changeEvent) =>
                    updateDraft("title", changeEvent.target.value)
                  }
                />
              </AdminField>
              <AdminField label="主办方或活动名" htmlFor="event-name">
                <input
                  id="event-name"
                  required
                  disabled={saving}
                  maxLength={160}
                  className={adminControlClass}
                  value={draft.name}
                  onChange={(changeEvent) =>
                    updateDraft("name", changeEvent.target.value)
                  }
                />
              </AdminField>
              <AdminField
                label="联系方式或外链"
                htmlFor="event-contact"
                description="可以填写 URL、邮箱或其他公开联系信息。"
              >
                <input
                  id="event-contact"
                  required
                  disabled={saving}
                  maxLength={500}
                  className={adminControlClass}
                  value={draft.contact}
                  onChange={(changeEvent) =>
                    updateDraft("contact", changeEvent.target.value)
                  }
                />
              </AdminField>

              {editingEvent?.image_url ? (
                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-medium">当前活动图片</p>
                  <img
                    src={editingEvent.image_url}
                    alt={`${editingEvent.title}当前活动图片`}
                    className="aspect-video w-full max-w-xs rounded-md border bg-muted object-cover"
                  />
                </div>
              ) : null}

              <div className="sm:col-span-2">
                <AdminField
                  label={editingEvent ? "替换活动图片" : "活动图片"}
                  htmlFor="event-image"
                >
                  <FileUploadControl
                    id="event-image"
                    name="image"
                    compact
                    accept="image/*"
                    emptyTitle={
                      editingEvent
                        ? "选择图片以替换当前图片"
                        : t("upload.eventImage.emptyTitle")
                    }
                    emptyDetail={t("upload.eventImage.emptyDetail")}
                    fileKind={t("upload.eventImage.fileKind")}
                    file={eventImage}
                    disabled={saving}
                    required={!editingEvent}
                    selectedIcon={FileImageIcon}
                    emptyIcon={ImageUpIcon}
                    onSelect={(file) => {
                      if (!editingEvent && !saving) {
                        idempotencyKeyRef.current = newIdempotencyKey()
                      }
                      setEventImage(file)
                    }}
                  />
                </AdminField>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => changeEditorOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : editingEvent ? (
                  <PencilIcon data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {editingEvent ? "保存活动" : "发布活动"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

function EventsSkeleton() {
  return (
    <div className="grid gap-3" aria-label="正在加载活动列表">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}
