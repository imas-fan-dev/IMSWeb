import { MapPinIcon } from "lucide-react"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type { AdminOfficeReview, FudabaSeries } from "~/lib/api"
import {
  officeOwnerLabel,
  officeReviewerLabel,
  userManagementHref,
  reviewStateLabels,
} from "./office-review-model"

const time = (value: string | null) =>
  value ? new Date(value).toLocaleString("zh-CN") : "尚未审核"

export function OfficeReviewDetails({
  item,
  series,
  canManageUsers,
  onViewUser,
  onViewMap,
}: {
  item: AdminOfficeReview
  series: FudabaSeries[]
  canManageUsers: boolean
  onViewUser(): void
  onViewMap(): void
}) {
  const { office } = item
  return (
    <div className="space-y-6">
      {office.reviewInProgress ? (
        <p role="status" className="text-sm text-muted-foreground">
          此版本正在处理审核，完成后请载入最新事务所。
        </p>
      ) : null}
      {office.reviewState === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>审核未通过</AlertTitle>
          <AlertDescription>
            {office.reviewNote || "请修改资料后重新提交。"}
          </AlertDescription>
        </Alert>
      ) : null}
      <section aria-label="事务所资料" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">事务所资料</h3>
          <Badge
            variant={
              office.reviewState === "rejected" ? "destructive" : "secondary"
            }
          >
            {reviewStateLabels[office.reviewState]}
          </Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">事务所名称</dt>
            <dd className="mt-1 font-medium">{office.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">现场交换</dt>
            <dd className="mt-1">
              {office.isOpen ? "接受现场交换" : "暂不交换"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">事务所介绍</dt>
            <dd className="mt-1 wrap-break-word whitespace-pre-wrap">
              {office.intro || "暂无介绍"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">企划标签</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {office.seriesCodes.length
                ? office.seriesCodes.map((code) => (
                    <Badge key={code} variant="outline">
                      {series.find((value) => value.code === code)
                        ?.displayName ?? code}
                    </Badge>
                  ))
                : "未设置"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">强调色</dt>
            <dd className="mt-2 flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 rounded-full border"
                style={{ backgroundColor: office.accent }}
              />
              <span className="font-mono text-xs">
                {office.accent.toUpperCase()}
              </span>
            </dd>
          </div>
        </dl>
      </section>
      <section aria-label="位置与地址" className="space-y-3 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">位置与地址</h3>
          <Button variant="outline" size="sm" onClick={onViewMap}>
            <MapPinIcon data-icon="inline-start" />
            在地图中查看
          </Button>
        </div>
        <p className="text-sm/relaxed wrap-break-word">
          {office.city} · {office.address}
        </p>
        <dl className="grid gap-3 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">纬度 · WGS84</dt>
            <dd className="mt-1 font-mono wrap-break-word">
              {office.location.latitude}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">经度 · WGS84</dt>
            <dd className="mt-1 font-mono wrap-break-word">
              {office.location.longitude}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-label="提交与审核" className="space-y-3 border-t pt-5">
        <h3 className="font-semibold">提交与审核</h3>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">提交账号</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {canManageUsers ? (
                <>
                  <Button
                    variant="link"
                    className="h-auto max-w-full p-0 wrap-break-word whitespace-normal"
                    onClick={onViewUser}
                  >
                    {officeOwnerLabel(item)}
                  </Button>
                  <NavigationLink
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    href={userManagementHref(item.owner.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    用户管理 ↗
                  </NavigationLink>
                </>
              ) : (
                officeOwnerLabel(item)
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">审核人员</dt>
            <dd className="mt-1">{officeReviewerLabel(item)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">提交时间</dt>
            <dd className="mt-1 text-muted-foreground">
              {time(office.submittedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">审核时间</dt>
            <dd className="mt-1 text-muted-foreground">
              {time(office.reviewedAt)}
            </dd>
          </div>
          {office.reviewState === "published" && office.reviewNote ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">已记录审核备注</dt>
              <dd className="mt-1 wrap-break-word whitespace-pre-wrap">
                {office.reviewNote}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  )
}
