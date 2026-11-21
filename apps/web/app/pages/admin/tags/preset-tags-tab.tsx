import { BookmarkIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AdminPagination } from "~/components/admin/admin-pagination"
import {
  AdminEmptyState,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  createAdminNamecardTagPreset,
  deleteAdminNamecardTagPreset,
  getAdminNamecardTagPresets,
  updateAdminNamecardTagPreset,
  type AdminNamecardTagPreset,
  type AdminNamecardTagPresetList,
} from "~/lib/api"
import {
  PresetEditorDialog,
  type PresetEditorSubmission,
} from "./preset-editor-dialog"
import {
  TAG_LIBRARY_PAGE_SIZE,
  TAG_NAME_MAX_LENGTH,
  formatTagTimestamp,
} from "./tag-library-model"
import { useTagListState } from "./use-tag-list-state"

const EMPTY_PAGE_INFO: AdminNamecardTagPresetList["pageInfo"] = {
  page: 1,
  pageSize: TAG_LIBRARY_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

interface PresetTagsPageResult {
  key: string
  items: AdminNamecardTagPreset[]
  pageInfo: AdminNamecardTagPresetList["pageInfo"]
  error: boolean
}

export function PresetTagsTab({
  refreshSignal = 0,
}: {
  refreshSignal?: number
}) {
  const [reloadToken, setReloadToken] = useState(0)
  const [pageResult, setPageResult] =
    useState<PresetTagsPageResult | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTarget, setEditorTarget] =
    useState<AdminNamecardTagPreset | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] =
    useState<AdminNamecardTagPreset | null>(null)
  const [deleting, setDeleting] = useState(false)

  const pageInfo = pageResult?.pageInfo ?? EMPTY_PAGE_INFO

  const {
    page,
    appliedQuery,
    draftQuery,
    setDraftQuery,
    scheduleQuery,
    submitSearch,
    clearKeyword,
    changePage,
  } = useTagListState("preset", pageInfo)

  const requestKey = `${appliedQuery}\u0000${page}\u0000${refreshSignal}\u0000${reloadToken}`
  const currentPage = pageResult?.key === requestKey ? pageResult : null
  const loading = currentPage === null
  const error = currentPage?.error === true
  const items = currentPage?.items ?? []

  useEffect(() => {
    let active = true
    getAdminNamecardTagPresets({
      q: appliedQuery || undefined,
      page,
      pageSize: TAG_LIBRARY_PAGE_SIZE,
    })
      .send()
      .then((result) => {
        if (!active) return
        setPageResult({
          key: requestKey,
          items: result.items,
          pageInfo: result.pageInfo,
          error: false,
        })
      })
      .catch(() => {
        if (!active) return
        setPageResult((previous) => ({
          key: requestKey,
          items: previous?.items ?? [],
          pageInfo: previous?.pageInfo ?? EMPTY_PAGE_INFO,
          error: true,
        }))
      })
    return () => {
      active = false
    }
  }, [appliedQuery, page, refreshSignal, reloadToken, requestKey])

  function refresh() {
    setReloadToken((token) => token + 1)
  }

  function openCreate() {
    setEditorTarget(null)
    setEditorOpen(true)
  }

  function openEdit(preset: AdminNamecardTagPreset) {
    setEditorTarget(preset)
    setEditorOpen(true)
  }

  async function submitEditor(submission: PresetEditorSubmission) {
    if (saving) return
    setSaving(true)
    try {
      if (editorTarget) {
        await updateAdminNamecardTagPreset(editorTarget.id, {
          name: submission.name,
          aliases: submission.aliases,
        }).send()
        toast.success("预设标签已更新")
      } else {
        await createAdminNamecardTagPreset({
          name: submission.name,
          aliases: submission.aliases,
        }).send()
        toast.success("预设标签已新增")
      }
      setEditorOpen(false)
      refresh()
    } catch (submitError) {
      toast.error(adminErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteAdminNamecardTagPreset(deleteTarget.id).send()
      toast.success(`「${deleteTarget.name}」已删除`)
      setDeleteTarget(null)
      refresh()
    } catch (deleteError) {
      toast.error(adminErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <form
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
        onSubmit={submitSearch}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">关键字</span>
          <div className="relative">
            <Input
              value={draftQuery}
              placeholder="搜索预设名称 / 别名"
              maxLength={TAG_NAME_MAX_LENGTH}
              className={
                draftQuery ? adminControlClass + " pr-9" : adminControlClass
              }
              disabled={loading}
              onChange={(event) => {
                setDraftQuery(event.target.value)
                scheduleQuery(event.target.value)
              }}
            />
            {draftQuery ? (
              <button
                type="button"
                aria-label="清除关键字"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={clearKeyword}
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
        </label>
      </form>

      <AdminPanel
        title="预设标签"
        description={`共 ${pageInfo.total} 条记录，第 ${pageInfo.page} 页；名称与别名都会进入候选。`}
        icon={BookmarkIcon}
        action={
          <Button
            type="button"
            size="sm"
            disabled={saving || deleting}
            onClick={openCreate}
          >
            <PlusIcon data-icon="inline-start" />
            新增预设
          </Button>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>无法读取预设标签</AlertTitle>
            <AlertDescription>
              请确认管理会话有效，然后重试。
            </AlertDescription>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refresh}
              >
                重试
              </Button>
            </div>
          </Alert>
        ) : items.length === 0 ? (
          <AdminEmptyState
            icon={BookmarkIcon}
            title="暂无预设标签"
            description="新增一个预设，或在自由标签里把常用标签提升为预设。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>别名</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell
                      className="max-w-48 truncate font-medium"
                      title={preset.name}
                    >
                      {preset.name}
                    </TableCell>
                    <TableCell>
                      {preset.aliases.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex max-w-64 flex-wrap gap-1">
                          {preset.aliases.map((alias) => (
                            <Badge key={alias} variant="secondary">
                              {alias}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTagTimestamp(preset.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex flex-nowrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving || deleting}
                          onClick={() => openEdit(preset)}
                        >
                          <PencilIcon data-icon="inline-start" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={saving || deleting}
                          onClick={() => setDeleteTarget(preset)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <AdminPagination
          page={pageInfo.page}
          totalPages={pageInfo.totalPages}
          disabled={loading}
          onChange={changePage}
        />
      </AdminPanel>

      <PresetEditorDialog
        open={editorOpen}
        preset={editorTarget}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setEditorOpen(false)
        }}
        onSubmit={submitEditor}
      />

      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title="删除预设标签"
        description={
          deleteTarget
            ? `「${deleteTarget.name}」将从候选中移除，使用它的名片会退回自由标签并保留显示名。此操作不可撤销。`
            : ""
        }
        submitting={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
