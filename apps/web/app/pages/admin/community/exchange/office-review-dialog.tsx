import { useEffect, useRef, useState } from "react"
import { OfficeEditorDialog } from "~/components/community/office-editor-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Textarea } from "~/components/ui/textarea"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getAdminOffice,
  getAdminOfficeSeries,
  getAdminOfficeMapConfig,
  reverseAdminOfficePlace,
  searchAdminOfficePlaces,
  updateAdminOffice,
  reviewAdminOffice,
  isApiError,
  sendWithAbort,
  type AdminOfficeReview,
  type FudabaSeries,
} from "~/lib/api"
import { OfficeEditor } from "~/pages/account/me/offices/office-editor"
import {
  emptyOfficeDraft,
  officeDraft,
  parseOfficeDraft,
  type OfficeDraft,
  type WorkspaceFeedback,
} from "~/pages/account/me/offices/office-location-model"
import type { OfficePlaceServices } from "~/pages/account/me/offices/office-place-services"
import { UserDetailDialog } from "~/pages/admin/platform-users/user-detail-dialog"
import { OfficePointMapDialog } from "./office-point-map-dialog"
import { OfficeReviewDetails } from "./office-review-details"
import { officeOwnerLabel } from "./office-review-model"

const adminPlaces: OfficePlaceServices = {
  loadConfig: (signal) => sendWithAbort(getAdminOfficeMapConfig(), signal),
  reverse: (point, signal) =>
    sendWithAbort(
      reverseAdminOfficePlace({ longitude: point[0], latitude: point[1] }),
      signal
    ),
  searchCanonical: (query, signal) =>
    sendWithAbort(searchAdminOfficePlaces(query), signal),
}
export type OfficeDialogMode = "details" | "edit" | "review" | "withdraw"

export function AdminOfficeDialog({
  officeId,
  canManageUsers,
  onClose,
  onChanged,
  initialMode = "details",
}: {
  officeId: string
  canManageUsers: boolean
  onClose(): void
  onChanged(): void
  initialMode?: OfficeDialogMode
}) {
  const [mode, setMode] = useState<OfficeDialogMode>(initialMode)
  const [item, setItem] = useState<AdminOfficeReview | null>(null)
  const [draft, setDraft] = useState<OfficeDraft>(() => emptyOfficeDraft(null))
  const [series, setSeries] = useState<FudabaSeries[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [reload, setReload] = useState(0)
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [note, setNote] = useState("")
  const [noteError, setNoteError] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const generation = useRef(0)
  const mutationLock = useRef(false)
  useEffect(() => {
    const controller = new AbortController(),
      current = ++generation.current
    void (async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setLoading(true)
      setLoadError("")
      const [detail, catalog] = await Promise.allSettled([
        sendWithAbort(getAdminOffice(officeId), controller.signal),
        sendWithAbort(getAdminOfficeSeries(), controller.signal),
      ])
      if (controller.signal.aborted || generation.current !== current) return
      if (detail.status === "rejected")
        setLoadError(
          isApiError(detail.reason)
            ? detail.reason.message
            : "事务所详情载入失败"
        )
      else {
        setItem(detail.value.item)
        setDraft(officeDraft(detail.value.item.office))
        setNote("")
        setNoteError(false)
        setConflict(false)
        setFeedback(null)
      }
      setCatalogError(catalog.status === "rejected")
      setSeries(catalog.status === "fulfilled" ? catalog.value.items : [])
      setLoading(false)
    })()
    return () => {
      controller.abort()
      generation.current += 1
    }
  }, [officeId, reload])

  const dirty = Boolean(
    item && JSON.stringify(draft) !== JSON.stringify(officeDraft(item.office))
  )
  const latitude = Number(draft.latitude),
    longitude = Number(draft.longitude)
  const validPoint = Boolean(
    draft.latitude.trim() &&
    draft.longitude.trim() &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  )
  const canReview = Boolean(
    item &&
    item.office.status === "active" &&
    item.office.reviewState === "pending" &&
    !item.office.reviewInProgress &&
    !dirty &&
    !conflict &&
    !busy
  )
  const canWithdraw = Boolean(
    item &&
    item.office.status === "active" &&
    item.office.reviewState === "published" &&
    !item.office.reviewInProgress &&
    !dirty &&
    !conflict &&
    !busy
  )
  const canEdit = Boolean(
    item &&
    item.office.status !== "archived" &&
    !item.office.reviewInProgress &&
    !conflict &&
    !busy
  )
  const editing = mode === "edit"
  const formId = `admin-office-form-${officeId}`

  async function submit(action: "save" | "publish" | "reject" | "withdraw") {
    if (
      !item ||
      mutationLock.current ||
      conflict ||
      item.office.reviewInProgress
    )
      return
    if (action === "withdraw" && !canWithdraw) return
    if (
      (action === "publish" || action === "reject") &&
      (!canReview || editing)
    )
      return
    if (action === "save" && (!editing || !canEdit)) return
    if (action === "reject" && !note.trim()) {
      setNoteError(true)
      document.getElementById(`office-review-note-${officeId}`)?.focus()
      return
    }
    const parsed = parseOfficeDraft(draft)
    if (action === "save" && !parsed.success) {
      setFeedback({ kind: "error", message: "请填写完整资料和有效精确坐标。" })
      return
    }
    const current = generation.current
    mutationLock.current = true
    setBusy(true)
    setFeedback(null)
    try {
      const result =
        action === "save" && parsed.success
          ? await updateAdminOffice(officeId, {
              ...parsed.data,
              expectedRevision: item.office.revision,
            }).send()
          : await reviewAdminOffice(officeId, {
              decision:
                action === "reject"
                  ? "reject"
                  : action === "withdraw"
                    ? "withdraw"
                    : "publish",
              expectedRevision: item.office.revision,
              note: note.trim(),
            }).send()
      if (generation.current !== current) return
      setItem(result.item)
      setDraft(officeDraft(result.item.office))
      setNote("")
      setNoteError(false)
      setMode("details")
      setFeedback({
        kind: "success",
        message:
          action === "save"
            ? result.item.office.reviewState === "published"
              ? "资料未发生变化，保留原审核结论。"
              : "修改已保存并进入待审核，请核对后再通过。"
            : action === "publish"
              ? "事务所整体审核已通过，精确位置和资料已公开。"
              : action === "withdraw"
                ? "已撤回发布，事务所已停止公开，可修改后重新提交审核。"
                : "事务所已拒绝，当前不公开。",
      })
      onChanged()
    } catch (error) {
      if (generation.current !== current) return
      const uncertain =
        !isApiError(error) ||
        error.status === 409 ||
        error.status === 404 ||
        !error.status ||
        error.status >= 500
      setConflict(uncertain)
      setFeedback({
        kind: uncertain ? "conflict" : "error",
        message: uncertain
          ? "当前版本或提交结果需要重新核对。输入已保留，请载入最新事务所后继续。"
          : error.message,
      })
    } finally {
      mutationLock.current = false
      if (generation.current === current) setBusy(false)
    }
  }

  return (
    <>
      <OfficeEditorDialog
        open
        busy={busy}
        onClose={onClose}
        title={
          item
            ? `${item.office.name} · ${editing ? "编辑资料" : "事务所详情"}`
            : "事务所详情"
        }
        description={
          editing
            ? "保存修改后将重新进入审核，审核通过前不公开。"
            : item?.office.reviewState === "published"
              ? "当前资料已发布，可查看、编辑或撤回发布。"
              : item?.office.reviewState === "rejected"
                ? "请先查看拒绝理由，修改资料后重新提交审核。"
                : "核对资料与地图位置后，可审核发布或填写拒绝理由。"
        }
        bodyKey={mode}
        footer={
          item && !loading && !loadError ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {editing
                  ? "修改保存后需重新审核"
                  : `资料版本 ${item.office.revision}`}
              </span>
              <div
                key={`${mode}-${item.office.reviewState}`}
                className="flex flex-wrap justify-end gap-2"
              >
                {editing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setDraft(officeDraft(item.office))
                        setMode("details")
                        setFeedback(null)
                      }}
                    >
                      取消编辑
                    </Button>
                    <Button
                      size="sm"
                      type="submit"
                      form={formId}
                      disabled={
                        !canEdit ||
                        (!dirty && item.office.reviewState !== "rejected")
                      }
                    >
                      {busy ? "正在保存" : "保存并提交审核"}
                    </Button>
                  </>
                ) : mode === "withdraw" &&
                  item.office.reviewState === "published" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setMode("details")}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!canWithdraw}
                      onClick={() => void submit("withdraw")}
                    >
                      {busy ? "正在撤回" : "确认撤回"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={onClose}
                    >
                      关闭
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        item.office.reviewState === "rejected"
                          ? "default"
                          : "outline"
                      }
                      disabled={!canEdit}
                      onClick={() => {
                        setMode("edit")
                        setNote("")
                        setNoteError(false)
                      }}
                    >
                      {item.office.reviewState === "rejected"
                        ? "修改并重新提交"
                        : "编辑资料"}
                    </Button>
                    {item.office.reviewState === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canReview}
                          onClick={() => void submit("reject")}
                        >
                          拒绝
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canReview}
                          onClick={() => void submit("publish")}
                        >
                          通过并发布
                        </Button>
                      </>
                    ) : item.office.reviewState === "published" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canWithdraw}
                        onClick={() => setMode("withdraw")}
                      >
                        撤回发布
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>无法读取事务所</AlertTitle>
            <AlertDescription>
              {loadError}
              <Button onClick={() => setReload((value) => value + 1)}>
                重试详情
              </Button>
            </AlertDescription>
          </Alert>
        ) : item ? (
          <div className="space-y-5">
            {!editing && feedback ? (
              <Alert
                variant={feedback.kind === "error" ? "destructive" : "default"}
              >
                <AlertTitle>
                  {feedback.kind === "success"
                    ? "操作成功"
                    : feedback.kind === "conflict"
                      ? "事务所版本冲突"
                      : "操作未完成"}
                </AlertTitle>
                <AlertDescription>
                  <p>{feedback.message}</p>
                  {feedback.kind === "conflict" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setReload((value) => value + 1)}
                    >
                      载入最新事务所
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {mode === "withdraw" && item.office.reviewState === "published" ? (
              <Alert>
                <AlertTitle>确认撤回发布？</AlertTitle>
                <AlertDescription>
                  撤回后事务所将停止公开并返回待审核。资料与精确位置会保留，可修改后重新提交。
                </AlertDescription>
              </Alert>
            ) : null}
            {catalogError ? (
              <p role="status" className="text-sm text-muted-foreground">
                企划选项载入失败，已有标签仍保留在表单中。
              </p>
            ) : null}
            {editing ? (
              <OfficeEditor
                mode="edit"
                office={item.office}
                draft={draft}
                series={series}
                disabled={conflict}
                busy={busy}
                feedback={feedback}
                onChange={setDraft}
                onSubmit={() => void submit("save")}
                onReload={() => setReload((value) => value + 1)}
                placeServices={adminPlaces}
                showCoordinates
                embedded
                formId={formId}
              />
            ) : (
              <OfficeReviewDetails
                item={item}
                series={series}
                canManageUsers={canManageUsers}
                onViewUser={() => setUserOpen(true)}
                onViewMap={() => setMapOpen(true)}
              />
            )}
            {item.office.coverUrl || item.office.pendingCoverUrl ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {item.office.coverUrl ? (
                  <figure>
                    <img
                      className="max-h-64 w-full rounded-lg object-contain"
                      src={item.office.coverUrl}
                      alt="当前事务所封面"
                    />
                    <figcaption className="text-xs text-muted-foreground">
                      当前封面
                    </figcaption>
                  </figure>
                ) : null}
                {item.office.pendingCoverUrl ? (
                  <figure>
                    <img
                      className="max-h-64 w-full rounded-lg object-contain"
                      src={item.office.pendingCoverUrl}
                      alt="待审核事务所封面"
                    />
                    <figcaption className="text-xs text-muted-foreground">
                      待审核封面，整体通过时一并发布
                    </figcaption>
                  </figure>
                ) : null}
              </div>
            ) : null}
            {!editing && item.office.reviewState === "pending" ? (
              <Field data-invalid={noteError || undefined}>
                <FieldLabel htmlFor={`office-review-note-${officeId}`}>
                  审核备注（拒绝时必填）
                </FieldLabel>
                <Textarea
                  id={`office-review-note-${officeId}`}
                  value={note}
                  onChange={(event) => {
                    setNote(event.currentTarget.value)
                    setNoteError(false)
                  }}
                  maxLength={1000}
                  disabled={busy || conflict}
                  aria-invalid={noteError}
                  placeholder="拒绝时必填；刷新版本后请重新核对理由。"
                />
                {noteError ? (
                  <p role="alert" className="text-sm text-destructive">
                    拒绝事务所时必须填写审核理由。
                  </p>
                ) : null}
              </Field>
            ) : null}
          </div>
        ) : null}
      </OfficeEditorDialog>
      {mapOpen && validPoint ? (
        <OfficePointMapDialog
          position={[longitude, latitude]}
          address={[draft.city, draft.address].filter(Boolean).join(" · ")}
          title={draft.name}
          onClose={() => setMapOpen(false)}
        />
      ) : null}
      {canManageUsers && item ? (
        <UserDetailDialog
          userId={userOpen ? item.owner.id : null}
          reloadKey={0}
          label={officeOwnerLabel(item)}
          onOpenChange={(value) => setUserOpen(value)}
        />
      ) : null}
    </>
  )
}
