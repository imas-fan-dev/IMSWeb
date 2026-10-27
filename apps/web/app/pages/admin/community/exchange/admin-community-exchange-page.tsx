import { CheckIcon, RefreshCwIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useOutletContext } from "react-router"
import { AdminEmptyState, AdminPageHeader } from "~/components/admin/admin-ui"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  getAdminOfficeReviews,
  isApiError,
  sendWithAbort,
  type AdminOfficeReview,
  type AdminOfficeReviewState,
} from "~/lib/api"
import {
  AdminOfficeDialog,
  type OfficeDialogMode,
} from "./office-review-dialog"
import {
  officeOwnerLabel,
  officeReviewerLabel,
  reviewStateLabels,
  userManagementHref,
} from "./office-review-model"
import { officeStatusLabels } from "~/pages/account/me/offices/office-location-model"

const states: readonly AdminOfficeReviewState[] = [
  "pending",
  "published",
  "rejected",
]
export function meta() {
  return [{ title: "事务所审核 | IMSWeb" }]
}

export default function AdminCommunityExchangePage() {
  const context = useOutletContext<{
    adminSession?: { adminRole?: string | null }
  } | null>()
  const canManageUsers = context?.adminSession?.adminRole === "super_admin"
  const [state, setState] = useState<AdminOfficeReviewState>("pending")
  const [items, setItems] = useState<AdminOfficeReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<{
    id: string
    mode: OfficeDialogMode
  } | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController(),
      current = ++generation.current
    void (async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setLoading(true)
      setError("")
      try {
        const result = await sendWithAbort(
          getAdminOfficeReviews(state),
          controller.signal
        )
        if (generation.current === current) setItems(result.items)
      } catch (cause) {
        if (!controller.signal.aborted && generation.current === current)
          setError(isApiError(cause) ? cause.message : "审核队列载入失败")
      } finally {
        if (!controller.signal.aborted && generation.current === current)
          setLoading(false)
      }
    })()
    return () => {
      controller.abort()
      generation.current += 1
    }
  }, [state, refresh])
  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="EXCHANGE OFFICE REVIEW"
        title="事务所审核"
        description="查看事务所资料与地图位置，按当前状态处理审核、发布或撤回。"
        actions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />
      <Tabs
        value={state}
        onValueChange={(value) => {
          if (states.includes(value as AdminOfficeReviewState))
            setState(value as AdminOfficeReviewState)
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="事务所审核状态">
            {states.map((value) => (
              <TabsTrigger key={value} value={value}>
                {reviewStateLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
          <Badge variant="outline" aria-live="polite">
            {loading ? "正在读取" : `${items.length} 条记录`}
          </Badge>
        </div>
      </Tabs>
      <section aria-label={`${reviewStateLabels[state]}事务所队列`}>
        {loading ? (
          <div className="grid gap-3" aria-label="正在读取审核队列">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>无法读取审核队列</AlertTitle>
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => setRefresh((value) => value + 1)}
              >
                重试
              </Button>
            </AlertDescription>
          </Alert>
        ) : !items.length ? (
          <AdminEmptyState
            icon={CheckIcon}
            title={`${reviewStateLabels[state]}队列为空`}
            description="该状态下暂时没有事务所记录。"
          />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card/50">
            {items.map((item) => (
              <article
                key={item.office.id}
                className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.office.name}</h2>
                    <Badge
                      variant={
                        item.office.reviewState === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {reviewStateLabels[item.office.reviewState]}
                    </Badge>
                    {item.office.status !== "active" ? (
                      <Badge variant="outline">
                        {officeStatusLabels[item.office.status]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm/relaxed wrap-break-word text-muted-foreground">
                    {item.office.city} · {item.office.address}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      提交账号：
                      {canManageUsers ? (
                        <NavigationLink
                          className="underline underline-offset-2"
                          href={userManagementHref(item.owner.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {officeOwnerLabel(item)}
                        </NavigationLink>
                      ) : (
                        officeOwnerLabel(item)
                      )}
                    </span>
                    <span>审核人员：{officeReviewerLabel(item)}</span>
                  </p>
                  {item.office.reviewState === "rejected" &&
                  item.office.reviewNote ? (
                    <p className="mt-2 rounded-lg bg-destructive/5 px-3 py-2 text-sm wrap-break-word text-destructive">
                      <span className="font-medium">拒绝理由：</span>
                      {item.office.reviewNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t pt-3 md:border-0 md:pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelected({ id: item.office.id, mode: "details" })
                    }
                  >
                    查看详情
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      item.office.reviewState === "rejected"
                        ? "default"
                        : "outline"
                    }
                    disabled={
                      item.office.status === "archived" ||
                      item.office.reviewInProgress
                    }
                    onClick={() =>
                      setSelected({ id: item.office.id, mode: "edit" })
                    }
                  >
                    {item.office.reviewState === "rejected"
                      ? "修改并重新提交"
                      : "编辑"}
                  </Button>
                  {item.office.reviewState !== "rejected" ? (
                    <Button
                      size="sm"
                      variant={
                        item.office.reviewState === "published"
                          ? "outline"
                          : "default"
                      }
                      disabled={
                        item.office.status !== "active" ||
                        item.office.reviewInProgress
                      }
                      onClick={() =>
                        setSelected({
                          id: item.office.id,
                          mode:
                            item.office.reviewState === "published"
                              ? "withdraw"
                              : "review",
                        })
                      }
                    >
                      {item.office.reviewState === "published"
                        ? "撤回发布"
                        : "发布"}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected ? (
        <AdminOfficeDialog
          key={selected.id}
          officeId={selected.id}
          initialMode={selected.mode}
          canManageUsers={canManageUsers}
          onClose={() => setSelected(null)}
          onChanged={() => setRefresh((value) => value + 1)}
        />
      ) : null}
    </div>
  )
}
