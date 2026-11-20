import { TagsIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { AdminPagination } from "~/components/admin/admin-pagination"
import {
  AdminEmptyState,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
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
  getAdminNamecardFreeTags,
  mergeAdminNamecardFreeTag,
  promoteAdminNamecardFreeTag,
  type AdminNamecardFreeSort,
  type AdminNamecardTagFree,
  type AdminNamecardTagFreeList,
} from "~/lib/api"
import { BlockTagDialog, type BlockTagSubmission } from "./block-tag-dialog"
import { MergeTagDialog, type MergeTagSubmission } from "./merge-tag-dialog"
import {
  PromoteTagDialog,
  type PromoteTagSubmission,
} from "./promote-tag-dialog"
import { TAG_LIBRARY_PAGE_SIZE, TAG_NAME_MAX_LENGTH } from "./tag-library-model"
import { useTagListState } from "./use-tag-list-state"

const EMPTY_PAGE_INFO: AdminNamecardTagFreeList["pageInfo"] = {
  page: 1,
  pageSize: TAG_LIBRARY_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

const SORT_ITEMS = [
  { value: "frequency", label: "按使用频率" },
  { value: "recent", label: "按最近首次出现" },
]

interface FreeTagsPageResult {
  key: string
  items: AdminNamecardTagFree[]
  pageInfo: AdminNamecardTagFreeList["pageInfo"]
  error: boolean
}

export function FreeTagsTab({
  refreshSignal = 0,
}: {
  refreshSignal?: number
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sort: AdminNamecardFreeSort =
    searchParams.get("freeSort") === "recent" ? "recent" : "frequency"

  const [reloadToken, setReloadToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const [pageResult, setPageResult] = useState<FreeTagsPageResult | null>(null)

  const [promoteTarget, setPromoteTarget] =
    useState<AdminNamecardTagFree | null>(null)
  const [mergeTarget, setMergeTarget] = useState<AdminNamecardTagFree | null>(
    null
  )
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
    resetKeywordState,
    changePage,
  } = useTagListState("free", pageInfo)

  const requestKey = `${appliedQuery}\u0000${page}\u0000${sort}\u0000${refreshSignal}\u0000${reloadToken}`
  const currentPage = pageResult?.key === requestKey ? pageResult : null
  const loading = currentPage === null
  const error = currentPage?.error === true
  const items = currentPage?.items ?? []

  useEffect(() => {
    let active = true
    getAdminNamecardFreeTags({
      q: appliedQuery || undefined,
      sort,
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
  }, [appliedQuery, page, refreshSignal, reloadToken, requestKey, sort])

  function refresh() {
    setReloadToken((token) => token + 1)
  }

  function clearFilters() {
    resetKeywordState()
    const next = new URLSearchParams(searchParams)
    next.delete("freeQuery")
    next.delete("freePage")
    next.delete("freeSort")
    setSearchParams(next)
  }

  function changeSort(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "recent") next.set("freeSort", "recent")
    else next.delete("freeSort")
    next.delete("freePage")
    setSearchParams(next)
  }

  async function submitPromote(submission: PromoteTagSubmission) {
    if (!promoteTarget || saving) return
    setSaving(true)
    try {
      await promoteAdminNamecardFreeTag({
        name: promoteTarget.name,
        presetName: submission.presetName,
        aliases: submission.aliases,
      }).send()
      toast.success(`「${promoteTarget.name}」已转为预设标签`)
      setPromoteTarget(null)
      refresh()
    } catch (submitError) {
      toast.error(adminErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  async function submitMerge(submission: MergeTagSubmission) {
    if (!mergeTarget || saving) return
    setSaving(true)
    try {
      await mergeAdminNamecardFreeTag(submission.presetId, {
        name: mergeTarget.name,
      }).send()
      toast.success(`「${mergeTarget.name}」已并入预设标签`)
      setMergeTarget(null)
      refresh()
    } catch (submitError) {
      toast.error(adminErrorMessage(submitError))
    } finally {
      setSaving(false)
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
              placeholder="搜索自由标签"
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
        <label className="flex flex-col gap-1.5 lg:w-56">
          <span className="text-sm font-medium">排序</span>
          <Select
            items={SORT_ITEMS}
            value={sort}
            disabled={loading}
            onValueChange={(value) => changeSort(String(value))}
          >
            <SelectTrigger className={`${adminControlClass} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SORT_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={clearFilters}
          >
            清空
          </Button>
        </div>
      </form>

      <AdminPanel
        title="自由标签"
        description={`共 ${pageInfo.total} 条记录，第 ${pageInfo.page} 页；可提升为预设、并入别名或屏蔽。`}
        icon={TagsIcon}
      >
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>无法读取自由标签</AlertTitle>
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
            icon={TagsIcon}
            title="暂无自由标签"
            description="调整关键字，或等待用户在世界观名片上添加标签。"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标签</TableHead>
                  <TableHead>使用次数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((tag) => (
                  <TableRow key={tag.name}>
                    <TableCell
                      className="max-w-64 truncate font-medium"
                      title={tag.name}
                    >
                      {tag.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {tag.count}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex flex-nowrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => setPromoteTarget(tag)}
                        >
                          转为预设
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => setMergeTarget(tag)}
                        >
                          并入预设
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={saving}
                          onClick={() => setBlockTarget(tag)}
                        >
                          屏蔽
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

      <PromoteTagDialog
        open={promoteTarget !== null}
        tag={promoteTarget}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setPromoteTarget(null)
        }}
        onSubmit={submitPromote}
      />

      <MergeTagDialog
        open={mergeTarget !== null}
        tag={mergeTarget}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setMergeTarget(null)
        }}
        onSubmit={submitMerge}
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
    </div>
  )
}
