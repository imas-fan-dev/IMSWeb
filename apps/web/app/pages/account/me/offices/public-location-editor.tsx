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
import { Checkbox } from "~/components/ui/checkbox"
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
  publicLocationDraft,
  type PublicLocationDraft,
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
  draft,
  disabled,
  busy,
  feedback,
  onChange,
  onSave,
  onReload,
  onWithdraw,
}: {
  office: FudabaOwnerOffice | null
  location: FudabaOwnerLocation | null
  draft: PublicLocationDraft
  disabled: boolean
  busy: boolean
  feedback: WorkspaceFeedback | null
  onChange: (draft: PublicLocationDraft) => void
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
      <CardHeader className="flex flex-col gap-2 sm:grid">
        <CardTitle>
          <h3>地图公开位置</h3>
        </CardTitle>
        <CardDescription>{reviewDescription(location)}</CardDescription>
        {location ? (
          <CardAction className="flex max-w-full flex-wrap items-center gap-2">
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
            <Badge variant="outline">
              {location.location.precision === "exact"
                ? "精确位置"
                : "区域位置"}
            </Badge>
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

        <form id="fudaba-public-location-form" onSubmit={submit}>
          <fieldset disabled={formDisabled} className="mb-5 space-y-3">
            <legend className="mb-2 text-sm font-medium">公开位置精度</legend>
            {(["regional", "exact"] as const).map((precision) => (
              <label
                key={precision}
                className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  name="public-location-precision"
                  value={precision}
                  checked={draft.precision === precision}
                  onChange={() =>
                    onChange(publicLocationDraft(null, office, precision))
                  }
                />
                {precision === "exact" ? "精确位置" : "区域位置"}
              </label>
            ))}
          </fieldset>
          <Alert className="mb-5">
            <MapPinIcon aria-hidden="true" />
            <AlertTitle>
              {draft.precision === "exact" ? "公开精确位置" : "公开大致区域"}
            </AlertTitle>
            <AlertDescription>
              {draft.precision === "exact"
                ? "审核通过后，所有访客都能在地图上查看事务所的精确位置。每次提交都需要重新确认同意。"
                : "地图使用约 0.1° 网格显示大致区域，公开页面同时显示事务所地址。"}
            </AlertDescription>
          </Alert>
          {draft.precision === "exact" ? (
            <label className="mb-5 flex items-start gap-3 text-sm/6">
              <Checkbox
                className="mt-1"
                checked={draft.exactLocationConsent}
                disabled={formDisabled}
                onCheckedChange={(checked) =>
                  onChange({ ...draft, exactLocationConsent: checked })
                }
              />
              审核通过后我同意向所有访客公开该事务所的精确位置
            </label>
          ) : null}
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
          disabled={
            formDisabled ||
            !office ||
            (draft.precision === "exact" && !draft.exactLocationConsent)
          }
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
