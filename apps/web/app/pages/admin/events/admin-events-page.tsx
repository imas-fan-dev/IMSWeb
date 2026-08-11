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
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { FileUploadControl } from "~/components/shared/file-upload-control"
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
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  createAdminEvent,
  deleteAdminEvent,
  getEventPage,
  isApiError,
  updateAdminEvent,
  type EventListItem,
} from "~/lib/api"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/pages/admin/components/admin-ui"

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

async function loadEvents() {
  const items: EventListItem[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const page = await getEventPage({ limit: 100, cursor }).send(true)
    items.push(...page.items)
    const nextCursor = page.pageInfo.nextCursor
    if (!page.pageInfo.hasNextPage || !nextCursor) return items
    if (seenCursors.has(nextCursor)) {
      throw new Error("活动分页游标重复")
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
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
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventListItem | null>(null)
  const [draft, setDraft] = useState<EventDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EventListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [eventImage, setEventImage] = useState<File | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setEvents(await loadEvents())
      return true
    } catch {
      setError(true)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void loadEvents()
      .then((next) => {
        if (active) setEvents(next)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const editing = editingEvent !== null
    const imageError = validateImage(eventImage, !editing)
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
      if (editingEvent) {
        await updateAdminEvent(editingEvent.id, form).send()
      } else {
        await createAdminEvent(form).send()
      }
    } catch (mutationError) {
      toast.error(
        isApiError(mutationError)
          ? mutationError.message
          : editing
            ? "活动更新失败，请检查内容后重试"
            : "活动发布失败，请检查内容后重试"
      )
      setSaving(false)
      return
    }

    toast.success(editing ? "活动已更新" : "活动已发布")
    setEditorOpen(false)
    setEditingEvent(null)
    setDraft(emptyDraft)
    setEventImage(null)
    try {
      if (!(await refresh())) {
        toast.error(
          editing
            ? "活动更新已成功，但列表刷新失败"
            : "活动发布已成功，但列表刷新失败"
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await deleteAdminEvent(target.id).send()
    } catch {
      toast.error("活动删除失败")
      setDeleting(false)
      return
    }

    toast.success("活动已删除")
    setDeleteTarget(null)
    try {
      if (!(await refresh())) {
        toast.error("活动删除已成功，但列表刷新失败")
      }
    } finally {
      setDeleting(false)
    }
  }

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
        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">正在读取活动</p>
        ) : error ? (
          <AdminEmptyState
            icon={CalendarDaysIcon}
            title="无法读取活动"
            description="请确认服务状态后刷新页面。"
          />
        ) : events.length ? (
          <div className="divide-y border-y">
            {events.map((item) => (
              <article
                key={item.id}
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
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CalendarDaysIcon}
            title="还没有活动"
            description="新建第一条面向制作人社区的活动信息。"
          />
        )}
      </AdminPanel>

      <Dialog open={editorOpen} onOpenChange={changeEditorOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={(event) => void submit(event)}>
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
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
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
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
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
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      contact: event.target.value,
                    }))
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
                    onSelect={setEventImage}
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除社区活动？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}”及其托管图片将被删除。`
                : "该活动及其托管图片将被删除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void remove()}
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
