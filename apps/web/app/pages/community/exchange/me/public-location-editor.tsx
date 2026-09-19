import {
  CircleAlertIcon,
  LoaderCircleIcon,
  MapPinIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import type { FormEvent } from "react"

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
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { FudabaOwnerLocation, FudabaOwnerOffice } from "~/lib/api"
import {
  locationReviewLabels,
  type WorkspaceFeedback,
} from "./office-location-model"

function reviewDescription(location: FudabaOwnerLocation | null) {
  if (!location) return "尚未提交公开地图地址。"
  if (location.reviewState === "published") {
    return "这个地址当前显示在公开地图。"
  }
  if (location.reviewState === "rejected") {
    return "该地址未公开。重新选择地点后可以再次提交审核。"
  }
  return "地址正在审核，审核通过前不会显示在公开地图。"
}

export function PublicLocationEditor({
  office,
  location,
  disabled,
  busy,
  feedback,
  onSave,
  onReload,
  onWithdraw,
}: {
  office: FudabaOwnerOffice | null
  location: FudabaOwnerLocation | null
  disabled: boolean
  busy: boolean
  feedback: WorkspaceFeedback | null
  onSave: () => void
  onReload: () => void
  onWithdraw: () => void
}) {
  const formDisabled = disabled || busy || office?.status === "archived"

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave()
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>地图公开位置</h3>
        </CardTitle>
        <CardDescription>{reviewDescription(location)}</CardDescription>
        {location ? (
          <CardAction className="flex items-center gap-2">
            <Badge
              variant={
                location.reviewState === "rejected"
                  ? "destructive"
                  : "secondary"
              }
            >
              {locationReviewLabels[location.reviewState]}
            </Badge>
            <Badge variant="outline">版本 {location.revision}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {feedback ? (
          <Alert
            className="mb-5"
            variant={feedback.kind === "error" ? "destructive" : "default"}
          >
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>
              {feedback.kind === "success"
                ? "操作成功"
                : feedback.kind === "conflict"
                  ? "地图位置版本冲突"
                  : "操作未完成"}
            </AlertTitle>
            <AlertDescription>
              <p>{feedback.message}</p>
              {feedback.kind === "conflict" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onReload}
                >
                  <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                  载入最新地图位置
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {location?.reviewNote ? (
          <Alert className="mb-5">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>审核备注</AlertTitle>
            <AlertDescription>{location.reviewNote}</AlertDescription>
          </Alert>
        ) : null}

        <Alert className="mb-5">
          <MapPinIcon aria-hidden="true" />
          <AlertTitle>公开地址，隐藏坐标</AlertTitle>
          <AlertDescription>
            地图定位由已选择地点生成，并使用经过区域化处理的位置。公开页面显示地址，不显示经纬度数字。
          </AlertDescription>
        </Alert>

        <form id="fudaba-public-location-form" onSubmit={submit}>
          <dl className="grid gap-3 border-y py-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">城市</dt>
              <dd className="mt-1 font-medium">{office?.city ?? "尚未选择"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">公开地址</dt>
              <dd className="mt-1 font-medium">
                {office?.address ?? "尚未选择地点"}
              </dd>
            </div>
          </dl>
        </form>

        {location ? (
          <dl className="mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">提交时间</dt>
              <dd className="mt-1 font-medium">
                {new Date(location.submittedAt).toLocaleString("zh-CN")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">审核时间</dt>
              <dd className="mt-1 font-medium">
                {location.reviewedAt
                  ? new Date(location.reviewedAt).toLocaleString("zh-CN")
                  : "尚未审核"}
              </dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        {location ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={formDisabled}
                />
              }
            >
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              撤回公开位置
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Trash2Icon aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>撤回地图公开位置？</AlertDialogTitle>
                <AlertDialogDescription>
                  确认后该事务所会立即从区域地图下线。事务所资料和名片不会被删除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={onWithdraw}
                >
                  确认撤回
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span className="text-sm text-muted-foreground">
            当前地址不在地图上
          </span>
        )}
        <Button
          type="submit"
          form="fudaba-public-location-form"
          disabled={formDisabled || !office}
        >
          {busy ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <SaveIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {busy ? "正在提交" : location ? "重新提交审核" : "提交地址审核"}
        </Button>
      </CardFooter>
    </Card>
  )
}
