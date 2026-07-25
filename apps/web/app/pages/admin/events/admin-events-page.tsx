import {
  CalendarDaysIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/pages/admin/components/admin-ui"
import { createAdminEvent, deleteAdminEvent } from "~/shared/api/endpoints/admin"
import { getEventPage } from "~/shared/api/endpoints/events"
import type { EventListItem } from "~/shared/api/endpoints/events"

export function meta() {
  return [{ title: "活动管理 | IMSWeb" }]
}

async function loadEvents() {
  return (await getEventPage({ limit: 50 }).send()).items
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setEvents(await loadEvents())
    } catch {
      setError(true)
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const image = form.get("image")
    if (!(image instanceof File) || !image.size) {
      toast.error("必须选择一张活动图片")
      return
    }
    if (!image.type.startsWith("image/") || image.size > 3 * 1024 * 1024) {
      toast.error("请选择不超过 3 MiB 的图片")
      return
    }
    setCreating(true)
    try {
      await createAdminEvent(form).send()
      toast.success("活动已发布")
      formElement.reset()
      await refresh()
    } catch {
      toast.error("活动发布失败，请检查内容后重试")
    } finally {
      setCreating(false)
    }
  }

  async function remove(item: EventListItem) {
    setBusyId(item.id)
    try {
      await deleteAdminEvent(item.id).send()
      toast.success("活动已删除")
      await refresh()
    } catch {
      toast.error("活动删除失败")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="EVENT OPERATIONS"
        title="活动管理"
        description="发布面向制作人社区的活动信息，并管理现有活动记录。"
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
        title="发布活动"
        description="活动图片不超过 3 MiB"
        icon={PlusIcon}
      >
        <form
          className="grid gap-5 md:grid-cols-2"
          onSubmit={(event) => void create(event)}
        >
          <AdminField label="活动标题" htmlFor="event-title">
            <input
              id="event-title"
              name="title"
              required
              maxLength={160}
              className={adminControlClass}
            />
          </AdminField>
          <AdminField label="主办方或活动名" htmlFor="event-name">
            <input
              id="event-name"
              name="name"
              required
              maxLength={160}
              className={adminControlClass}
            />
          </AdminField>
          <AdminField
            label="联系方式或外链"
            htmlFor="event-contact"
            description="可以填写 URL、邮箱或其他公开联系信息。"
          >
            <input
              id="event-contact"
              name="contact"
              required
              maxLength={500}
              className={adminControlClass}
            />
          </AdminField>
          <AdminField label="活动图片" htmlFor="event-image">
            <input
              id="event-image"
              name="image"
              type="file"
              required
              accept="image/*"
              className={adminControlClass}
            />
          </AdminField>
          <div className="md:col-span-2">
            <Button type="submit" disabled={creating}>
              <PlusIcon data-icon="inline-start" />
              {creating ? "正在发布" : "发布活动"}
            </Button>
          </div>
        </form>
      </AdminPanel>

      <AdminPanel
        title="现有活动"
        description="展示当前公开 API 返回的最近活动"
        icon={CalendarDaysIcon}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">正在读取活动……</p>
        ) : error ? (
          <AdminEmptyState
            icon={CalendarDaysIcon}
            title="无法读取活动"
            description="请确认服务状态后刷新页面。"
          />
        ) : events.length ? (
          <div className="grid gap-3">
            {events.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="aspect-video w-full rounded-lg bg-muted object-cover sm:w-40"
                    loading="lazy"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.name || "未填写主办方"}
                  </p>
                  {item.contact ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.contact}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  删除
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CalendarDaysIcon}
            title="还没有活动"
            description="使用上方表单发布第一条活动信息。"
          />
        )}
      </AdminPanel>
    </div>
  )
}
