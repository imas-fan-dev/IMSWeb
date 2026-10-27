import {
  Building2Icon,
  CircleAlertIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { OfficeEditorDialog } from "~/components/community/office-editor-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  createFudabaOffice,
  getFudabaOwnerOffice,
  getFudabaOwnerOffices,
  updateFudabaOwnerOffice,
  type FudabaOwnerOffice,
  type FudabaSeries,
} from "~/lib/api"
import { useExchangeMapDialog } from "~/pages/community/exchange/components/exchange-page-surface"
import { apiMessage, isFeatureClosed } from "../account-me-model"
import { OfficeEditor } from "./office-editor"
import {
  emptyOfficeDraft,
  isOfficeConflict,
  officeDraft,
  officeReviewLabels,
  officeStatusLabels,
  parseOfficeDraft,
  type OfficeDraft,
  type WorkspaceFeedback,
} from "./office-location-model"

type WorkspacePhase = "loading" | "ready" | "error"

export function OfficeLocationWorkspace({
  initialOfficeId,
  series,
  homeCity,
  readOnly,
  onWriteClosed,
}: {
  initialOfficeId?: string
  series: FudabaSeries[]
  homeCity: string | null
  readOnly: boolean
  onWriteClosed(): void
}) {
  const mapDialog = useExchangeMapDialog()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<WorkspacePhase>("loading")
  const [offices, setOffices] = useState<FudabaOwnerOffice[]>([])
  const [office, setOffice] = useState<FudabaOwnerOffice | null>(null)
  const [creating, setCreating] = useState(false)
  const [loadingSelection, setLoadingSelection] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<OfficeDraft>(() =>
    emptyOfficeDraft(homeCity)
  )
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const generation = useRef(0)
  const selectedId = useRef<string | null>(null)
  const targetId = useRef<string | null>(null)
  const createKey = useRef<string | null>(null)
  const createFingerprint = useRef<string | null>(null)

  const loadSelection = useCallback(async (id: string) => {
    const current = ++generation.current
    targetId.current = id
    selectedId.current = id
    setOffice(null)
    setCreating(false)
    setSaving(false)
    setLoadingSelection(true)
    setFeedback(null)
    try {
      const result = await getFudabaOwnerOffice(id).send()
      if (generation.current !== current) return
      setOffice(result.office)
      setDraft(officeDraft(result.office))
      setOffices((items) =>
        items.map((item) => (item.id === id ? result.office : item))
      )
    } catch (error) {
      if (generation.current !== current) return
      setFeedback({
        kind: "error",
        message: apiMessage(error, "事务所详情载入失败，请重试。"),
      })
    } finally {
      if (generation.current === current) setLoadingSelection(false)
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    const current = ++generation.current
    targetId.current = selectedId.current
    setSaving(false)
    setPhase("loading")
    setLoadError(null)
    try {
      const result = await getFudabaOwnerOffices().send()
      if (generation.current !== current) return
      setOffices(result.items)
      setPhase("ready")
      const next =
        result.items.find((item) => item.id === selectedId.current)?.id ??
        result.items.find((item) => item.id === initialOfficeId)?.id ??
        null
      if (next) {
        setOpen(true)
        void loadSelection(next)
      } else {
        selectedId.current = null
        targetId.current = null
        setOffice(null)
        setCreating(false)
        setDraft(emptyOfficeDraft(homeCity))
      }
    } catch (error) {
      if (generation.current !== current) return
      setPhase("error")
      setLoadError(apiMessage(error, "事务所暂时无法加载。"))
    }
  }, [homeCity, initialOfficeId, loadSelection])

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void loadWorkspace(), 0)
    return () => {
      globalThis.clearTimeout(timer)
      generation.current += 1
    }
  }, [loadWorkspace])

  function beginCreate() {
    generation.current += 1
    selectedId.current = null
    targetId.current = null
    setOffice(null)
    setCreating(true)
    setSaving(false)
    setLoadingSelection(false)
    setDraft(emptyOfficeDraft(homeCity))
    setFeedback(null)
    createKey.current = null
    createFingerprint.current = null
    setOpen(true)
  }

  function replaceOffice(saved: FudabaOwnerOffice) {
    setOffices((items) => [
      saved,
      ...items.filter((item) => item.id !== saved.id),
    ])
    setOffice(saved)
    selectedId.current = saved.id
    targetId.current = saved.id
    setDraft(officeDraft(saved))
  }

  async function submitOffice() {
    if (readOnly || saving || office?.reviewInProgress) return
    const parsed = parseOfficeDraft(draft)
    if (!parsed.success) {
      setFeedback({
        kind: "error",
        message: "请填写事务所名称，并通过地点搜索选择有效地址。",
      })
      return
    }
    const current = generation.current
    const id = creating ? null : (office?.id ?? null)
    if (!creating && !id) return
    const isCurrent = () =>
      current === generation.current && targetId.current === id
    setSaving(true)
    setFeedback(null)
    try {
      if (creating) {
        const fingerprint = JSON.stringify(parsed.data)
        if (!createKey.current || createFingerprint.current !== fingerprint) {
          createKey.current = `fudaba-office-${globalThis.crypto.randomUUID()}`
          createFingerprint.current = fingerprint
        }
        const result = await createFudabaOffice(
          parsed.data,
          createKey.current
        ).send()
        if (!isCurrent()) return
        replaceOffice(result.office)
        setCreating(false)
        createKey.current = null
        createFingerprint.current = null
        setFeedback({
          kind: "success",
          message: "事务所已创建并提交整体审核，审核通过前不公开。",
        })
        mapDialog?.changed?.()
        toast.success("事务所已创建并提交审核")
        setOpen(false)
        return
      }
      if (!office || !id) return
      const result = await updateFudabaOwnerOffice(id, {
        ...parsed.data,
        expectedRevision: office.revision,
      }).send()
      if (!isCurrent()) return
      replaceOffice(result.office)
      const message =
        result.office.reviewState === "published"
          ? "事务所资料未发生变化，保持已公开。"
          : "事务所资料已保存并提交整体审核，审核通过前不公开。"
      setFeedback({ kind: "success", message })
      mapDialog?.changed?.()
      toast.success(message)
    } catch (error) {
      if (!isCurrent()) return
      if (isFeatureClosed(error)) {
        onWriteClosed()
        setFeedback({ kind: "error", message: "事务所编辑当前未开放。" })
      } else if (isOfficeConflict(error)) {
        setFeedback({
          kind: "conflict",
          message:
            "事务所已在其他窗口更新。当前输入仍保留，请载入最新版本后再修改。",
        })
      } else
        setFeedback({
          kind: "error",
          message: apiMessage(error, "事务所保存失败，请重试。"),
        })
    } finally {
      if (generation.current === current) setSaving(false)
    }
  }

  return (
    <section aria-labelledby="fudaba-office-location-title">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2
            id="fudaba-office-location-title"
            className="text-xl font-semibold"
          >
            事务所与地图位置
          </h2>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            事务所始终使用精确位置。新建或修改任意资料后统一审核，通过前不公开。
          </p>
        </div>
        <Button
          type="button"
          disabled={readOnly || saving}
          onClick={beginCreate}
        >
          <PlusIcon data-icon="inline-start" />
          新建事务所
        </Button>
      </div>
      {phase === "ready" ? (
        <div className="mt-6 grid gap-3" aria-label="我的事务所清单">
          {!offices.length ? (
            <p className="text-sm text-muted-foreground">
              还没有交换事务所，点击新建事务所开始。
            </p>
          ) : null}
          {offices.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-medium">{item.name}</span>
                <Badge variant="outline">
                  {item.status === "active"
                    ? officeReviewLabels[item.reviewState]
                    : officeStatusLabels[item.status]}
                </Badge>
              </div>
              <Button
                variant="outline"
                disabled={saving || loadingSelection}
                onClick={() => {
                  setOpen(true)
                  void loadSelection(item.id)
                }}
              >
                详情与编辑
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {phase === "loading" ? <p role="status">正在载入事务所</p> : null}
      {phase === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>事务所工作区暂时无法加载</AlertTitle>
          <AlertDescription>
            {loadError}
            <Button onClick={() => void loadWorkspace()}>重新载入</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <OfficeEditorDialog
        open={open}
        embedded={Boolean(mapDialog)}
        busy={saving}
        onClose={() => setOpen(false)}
        title={creating ? "新建事务所" : "事务所详情与编辑"}
      >
        {phase === "loading" || loadingSelection ? (
          <Skeleton className="mt-8 h-160 w-full" />
        ) : phase === "error" ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>事务所暂时无法加载</AlertTitle>
            <AlertDescription>
              {loadError}
              <Button onClick={() => void loadWorkspace()}>
                <RefreshCwIcon />
                重新载入
              </Button>
            </AlertDescription>
          </Alert>
        ) : !office && !creating && feedback?.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>事务所详情载入失败</AlertTitle>
            <AlertDescription>
              {feedback.message}
              <Button
                onClick={() => {
                  if (targetId.current) void loadSelection(targetId.current)
                }}
              >
                重试载入事务所
              </Button>
            </AlertDescription>
          </Alert>
        ) : creating || office ? (
          <div className="mt-4 min-w-0">
            <OfficeEditor
              mode={creating ? "create" : "edit"}
              office={office}
              draft={draft}
              series={series}
              disabled={readOnly}
              busy={saving}
              feedback={feedback}
              onChange={setDraft}
              onSubmit={() => void submitOffice()}
              onReload={() => {
                if (office) void loadSelection(office.id)
              }}
            />
          </div>
        ) : (
          <Empty className="mt-8 min-h-72 border-y">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>还没有交换事务所</EmptyTitle>
              <EmptyDescription>创建事务所后将整体提交审核。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </OfficeEditorDialog>
    </section>
  )
}
