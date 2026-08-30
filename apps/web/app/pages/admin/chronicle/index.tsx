import { useRequest } from "alova/client"
import {
  CheckIcon,
  ConstructionIcon,
  HistoryIcon,
  ImageIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import {
  approveChronicleMedia,
  deleteUsedChronicleMedia,
  getPendingChronicleMedia,
  getUsedChronicleMedia,
  rejectChronicleMedia,
  type PendingChronicleMedia,
  type UsedChronicleMedia,
} from "~/lib/api"
import { NavigationLink } from "~/components/navigation/navigation-link"

export function meta() {
  return [{ title: "活动纪年审核 | IMSWeb" }]
}

function PendingSection() {
  const {
    data,
    loading,
    error,
    send: load,
    onError,
  } = useRequest(getPendingChronicleMedia(), {
    initialData: {} as PendingChronicleMedia,
  })
  onError(() => undefined)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  if (loading) {
    return <Skeleton className="h-48 w-full rounded-xl" />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ConstructionIcon aria-hidden="true" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>无法读取待审核队列，请稍后重试。</AlertDescription>
      </Alert>
    )
  }

  const entries = Object.entries(data)

  if (entries.length === 0) {
    return (
      <AdminEmptyState
        icon={ImageIcon}
        title="待审核队列为空"
        description="还没有新的活动纪年投稿需要审核。"
      />
    )
  }

  async function handleApprove(activityId: string, filename: string) {
    const key = `${activityId}/${filename}`
    setBusyKey(key)
    try {
      await approveChronicleMedia(activityId, filename).send()
      toast.success(`${filename} 已批准`)
      await load()
    } catch {
      toast.error(`批准 ${filename} 失败`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleReject(activityId: string, filename: string) {
    const key = `${activityId}/${filename}`
    setBusyKey(key)
    try {
      await rejectChronicleMedia(activityId, filename).send()
      toast.success(`${filename} 已拒绝`)
      await load()
    } catch {
      toast.error(`拒绝 ${filename} 失败`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-8">
      {entries.map(([activityId, items]) => (
        <div key={activityId}>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            活动：{activityId}
          </h3>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.filename}
                className="flex items-start gap-4 rounded-lg border bg-card p-4"
              >
                <NavigationLink
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block size-24 shrink-0 overflow-hidden rounded-md border bg-muted"
                >
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </NavigationLink>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.filename}
                  </p>
                  {item.uploader ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      上传者：{item.uploader}
                    </p>
                  ) : null}
                  {item.time ? (
                    <p className="text-xs text-muted-foreground">{item.time}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyKey === `${activityId}/${item.filename}`}
                    onClick={() => handleApprove(activityId, item.filename)}
                  >
                    <CheckIcon aria-hidden="true" />
                    批准
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyKey === `${activityId}/${item.filename}`}
                    onClick={() => handleReject(activityId, item.filename)}
                  >
                    <XIcon aria-hidden="true" />
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function UsedSection() {
  const {
    data,
    loading,
    error,
    send: load,
    onError,
  } = useRequest(getUsedChronicleMedia(), {
    initialData: {} as UsedChronicleMedia,
  })
  onError(() => undefined)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  if (loading) {
    return <Skeleton className="h-48 w-full rounded-xl" />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ConstructionIcon aria-hidden="true" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>无法读取已通过队列，请稍后重试。</AlertDescription>
      </Alert>
    )
  }

  const entries = Object.entries(data)

  if (entries.length === 0) {
    return (
      <AdminEmptyState
        icon={ImageIcon}
        title="已通过队列为空"
        description="还没有审核通过的活动纪年照片。"
      />
    )
  }

  async function handleDelete(activityId: string, filename: string) {
    const key = `${activityId}/${filename}`
    setBusyKey(key)
    try {
      await deleteUsedChronicleMedia(activityId, filename).send()
      toast.success(`${filename} 已删除`)
      await load()
    } catch {
      toast.error(`删除 ${filename} 失败`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-8">
      {entries.map(([activityId, items]) => (
        <div key={activityId}>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            活动：{activityId}
          </h3>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.filename}
                className="flex items-start gap-4 rounded-lg border bg-card p-4"
              >
                <NavigationLink
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block size-24 shrink-0 overflow-hidden rounded-md border bg-muted"
                >
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </NavigationLink>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.filename}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyKey === `${activityId}/${item.filename}`}
                    onClick={() => handleDelete(activityId, item.filename)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminChronicle() {
  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="CHRONICLE REVIEW"
        title="活动纪年审核"
        description="审核活动纪年投稿与图片素材。"
      />

      <AdminPanel
        title="审核队列"
        description="待处理投稿与素材状态"
        icon={HistoryIcon}
      >
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">待审核</TabsTrigger>
            <TabsTrigger value="used">已通过</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <PendingSection />
          </TabsContent>
          <TabsContent value="used">
            <UsedSection />
          </TabsContent>
        </Tabs>
      </AdminPanel>
    </div>
  )
}
