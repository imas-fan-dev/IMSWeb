import {
  BanIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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
  blockAdminNamecardFreeTag,
  createAdminNamecardTagBlocklist,
  deleteAdminNamecardTagBlocklist,
  getAdminNamecardTagBlockedMatches,
  getAdminNamecardTagBlocklist,
  removeAdminNamecardTagBlocklistMatches,
  updateAdminNamecardTagBlocklist,
  type AdminNamecardTagBlockedMatch,
  type AdminNamecardTagBlocklistItem,
  type AdminNamecardTagBlocklistList,
  type AdminNamecardTagFree,
} from "~/lib/api"
import {
  BlockTagDialog,
  type BlockTagSubmission,
} from "./block-tag-dialog"
import {
  BlocklistEditorDialog,
  type BlocklistEditorSubmission,
} from "./blocklist-editor-dialog"
import {
  TAG_BLOCKLIST_QUERY_MAX_LENGTH,
  TAG_LIBRARY_PAGE_SIZE,
  formatTagTimestamp,
  tagCountLabel,
} from "./tag-library-model"
import { useTagListState } from "./use-tag-list-state"

const EMPTY_PAGE_INFO: AdminNamecardTagBlocklistList["pageInfo"] = {
  page: 1,
  pageSize: TAG_LIBRARY_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

interface BlocklistPageResult {
  key: string
  items: AdminNamecardTagBlocklistItem[]
  pageInfo: AdminNamecardTagBlocklistList["pageInfo"]
  error: boolean
}

export function BlocklistTab({
  refreshSignal = 0,
}: {
  refreshSignal?: number
}) {
  const [matches, setMatches] = useState<AdminNamecardTagBlockedMatch[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const [pageResult, setPageResult] =
    useState<BlocklistPageResult | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTarget, setEditorTarget] =
    useState<AdminNamecardTagBlocklistItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] =
    useState<AdminNamecardTagBlocklistItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [removeMatchesTarget, setRemoveMatchesTarget] =
    useState<AdminNamecardTagBlocklistItem | null>(null)
  const [removingMatches, setRemovingMatches] = useState(false)
  const [blockTarget, setBlockTarget] = useState<AdminNamecardTagFree | null>(
    null
  )

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
  } = useTagListState("blocklist", pageInfo)

  const requestKey = `${appliedQuery}\u0000${page}\u0000${refreshSignal}\u0000${reloadToken}`
  const currentPage = pageResult?.key === requestKey ? pageResult : null
  const loading = currentPage === null
  const error = currentPage?.error === true
  const items = currentPage?.items ?? []

  useEffect(() => {
    let active = true
    Promise.all([
      getAdminNamecardTagBlocklist({
        q: appliedQuery || undefined,
        page,
        pageSize: TAG_LIBRARY_PAGE_SIZE,
      }).send(),
      getAdminNamecardTagBlockedMatches().send(),
    ])
      .then(([list, blocked]) => {
        if (!active) return
        setMatches(blocked.items)
        setPageResult({
          key: requestKey,
          items: list.items,
          pageInfo: list.pageInfo,
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

  function openEdit(item: AdminNamecardTagBlocklistItem) {
    setEditorTarget(item)
    setEditorOpen(true)
  }

  async function submitEditor(submission: BlocklistEditorSubmission) {
    if (saving) return
    setSaving(true)
    try {
      if (editorTarget) {
        await updateAdminNamecardTagBlocklist(editorTarget.id, {
          pattern: submission.pattern,
          isRegex: submission.isRegex,
        }).send()
        toast.success("屏蔽词已更新")
      } else {
        await createAdminNamecardTagBlocklist({
          pattern: submission.pattern,
          isRegex: submission.isRegex,
        }).send()
        toast.success("屏蔽词已新增")
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
      await deleteAdminNamecardTagBlocklist(deleteTarget.id).send()
      toast.success(`屏蔽词「${deleteTarget.pattern}」已删除`)
      setDeleteTarget(null)
      refresh()
    } catch (deleteError) {
      toast.error(adminErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  async function confirmRemoveMatches() {
    if (!removeMatchesTarget || removingMatches) return
    setRemovingMatches(true)
    try {
      const result = await removeAdminNamecardTagBlocklistMatches(
        removeMatchesTarget.id
      ).send()
      toast.success(`已移除 ${result.removed} 条命中标签`)
      setRemoveMatchesTarget(null)
      refresh()
    } catch (removeError) {
      toast.error(adminErrorMessage(removeError))
    } finally {
      setRemovingMatches(false)
    }
  }

  async function submitBlock(submission: BlockTagSubmission) {
    if (!blockTarget || saving) return
    setSaving(true)
    try {
      const result = await blockAdminNamecardFreeTag({
        name: blockTarget.name,
        pattern: submission.pattern,
        isRegex: submission.isRegex,
      }).send()
      toast.success(
        `已屏蔽「${blockTarget.name}」，移除 ${result.removed} 条现存标签`
      )
      setBlockTarget(null)
      refresh()
    } catch (submitError) {
      toast.error(adminErrorMessage(submitError))
    } finally {
      setSaving(false)
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
              placeholder="搜索屏蔽词"
              maxLength={TAG_BLOCKLIST_QUERY_MAX_LENGTH}
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

      {matches.length > 0 ? (
        <AdminPanel
          title="被屏蔽词命中的现存标签"
          description="屏蔽词只阻止新建；下列标签在规则生效前已经存在，可逐条移除并加入屏蔽词。"
          icon={ShieldAlertIcon}
        >
          <ul className="flex flex-col gap-2">
            {matches.map((match) => (
              <li
                key={`${match.patternId}:${match.name}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-destructive/5 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BanIcon
                    className="size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium" title={match.name}>
                    {match.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tagCountLabel(match.count)}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() =>
                    setBlockTarget({ name: match.name, count: match.count })
                  }
                >
                  移除并屏蔽
                </Button>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      <AdminPanel
        title="屏蔽词"
        description={`共 ${pageInfo.total} 条记录，第 ${pageInfo.page} 页；只阻止新建标签。`}
        icon={BanIcon}
        action={
          <Button
            type="button"
            size="sm"
            disabled={saving || deleting || removingMatches}
            onClick={openCreate}
          >
            <PlusIcon data-icon="inline-start" />
            新增屏蔽词
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
            <AlertTitle>无法读取屏蔽词</AlertTitle>
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
            icon={BanIcon}
            title="暂无屏蔽词"
            description="新增屏蔽词后，新建标签会被立刻拒绝。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>屏蔽词</TableHead>
                  <TableHead>匹配方式</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell
                      className="max-w-72 truncate font-mono text-sm"
                      title={item.pattern}
                    >
                      {item.pattern}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.isRegex ? "default" : "secondary"}>
                        {item.isRegex ? "正则" : "包含"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTagTimestamp(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex flex-nowrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving || deleting || removingMatches}
                          onClick={() => openEdit(item)}
                        >
                          <PencilIcon data-icon="inline-start" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving || deleting || removingMatches}
                          onClick={() => setRemoveMatchesTarget(item)}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          移除命中
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={saving || deleting || removingMatches}
                          onClick={() => setDeleteTarget(item)}
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

      <BlocklistEditorDialog
        open={editorOpen}
        item={editorTarget}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setEditorOpen(false)
        }}
        onSubmit={submitEditor}
      />

      <BlockTagDialog
        open={blockTarget !== null}
        tag={blockTarget}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setBlockTarget(null)
        }}
        onSubmit={submitBlock}
      />

      <ConfirmActionDialog
        open={removeMatchesTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removingMatches) setRemoveMatchesTarget(null)
        }}
        title="移除命中标签"
        description={
          removeMatchesTarget
            ? `将移除「${removeMatchesTarget.pattern}」命中的全部现存自由标签；屏蔽词本身会保留。此操作不可撤销。`
            : ""
        }
        confirmLabel="移除命中标签"
        submitting={removingMatches}
        onConfirm={() => void confirmRemoveMatches()}
      />

      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title="删除屏蔽词"
        description={
          deleteTarget
            ? `「${deleteTarget.pattern}」将不再阻止新建标签。此操作不可撤销。`
            : ""
        }
        submitting={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
