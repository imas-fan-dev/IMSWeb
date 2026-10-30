import { ClipboardListIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"

import { AdminPagination } from "~/components/admin/admin-pagination"
import {
  AdminEmptyState,
  AdminPageHeader,
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
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import type {
  NamecardFeedbackAuditList,
  NamecardLockAuditList,
} from "@imsweb/contracts/namecards"
import {
  getAdminNamecardFeedbackAudit,
  getAdminNamecardLockAudit,
} from "~/lib/api"
import { feedbackReasonLabel } from "~/pages/community/exchange/components/namecard-feedback-model"
import {
  AUDIT_TABS,
  auditTab,
  auditUserLabel,
  auditUserTitle,
  formatAuditMoment,
  type AuditTab,
} from "~/pages/admin/platform-audit/namecard-audit-model"

type PageInfo = NamecardLockAuditList["pageInfo"]

const EMPTY_PAGE_INFO: PageInfo = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

const OUTCOME_ITEMS = [
  { value: "all", label: "全部结果" },
  { value: "accepted", label: "已受理" },
  { value: "rejected", label: "未受理" },
]

export function meta() {
  return [{ title: "名片审计 | IMSWeb" }]
}

export default function AdminNamecardAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = auditTab(searchParams.get("tab"))
  const owner = searchParams.get("owner") ?? ""
  const reason = searchParams.get("reason") ?? ""
  const handler = searchParams.get("handler") ?? ""
  const reporter = searchParams.get("reporter") ?? ""
  const outcome = searchParams.get("outcome") ?? "all"
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  const [lockRows, setLockRows] = useState<NamecardLockAuditList["data"]>([])
  const [feedbackRows, setFeedbackRows] = useState<
    NamecardFeedbackAuditList["data"]
  >([])
  const [pageInfo, setPageInfo] = useState<PageInfo>(EMPTY_PAGE_INFO)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [error, setError] = useState(false)

  const loadKey = `${tab}:${owner}:${reason}:${handler}:${reporter}:${outcome}:${page}:${reloadToken}`
  const loading = loadedKey !== loadKey

  useEffect(() => {
    let active = true
    const request =
      tab === "locks"
        ? getAdminNamecardLockAudit({
            page,
            owner,
            reason,
            handler,
          }).send()
        : getAdminNamecardFeedbackAudit({
            page,
            owner,
            reporter,
            outcome: outcome === "all" ? undefined : (outcome as "accepted" | "rejected"),
            handler,
          }).send()
    void request
      .then((next) => {
        if (!active) return
        if ("data" in next && next.success) {
          const rows = next.data
          if (tab === "locks") {
            setLockRows(rows as NamecardLockAuditList["data"])
            setFeedbackRows([])
          } else {
            setFeedbackRows(rows as NamecardFeedbackAuditList["data"])
            setLockRows([])
          }
          setPageInfo(next.pageInfo)
        }
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoadedKey(loadKey)
      })
    return () => {
      active = false
    }
  }, [handler, loadKey, outcome, owner, page, reason, reporter, tab])

  const applyFilters = useCallback(
    (patch: Record<string, string> = {}) => {
      const next = new URLSearchParams()
      const merged: Record<string, string> = { tab, ...patch }
      for (const [key, value] of Object.entries(merged)) {
        if (!value || (key === "outcome" && value === "all")) continue
        next.set(key, value)
      }
      setSearchParams(next)
    },
    [setSearchParams, tab]
  )

  function switchTab(next: AuditTab) {
    setSearchParams({ tab: next })
  }

  const filterKey = `${tab}:${owner}:${reason}:${handler}:${reporter}:${outcome}`

  const hasFilters =
    owner !== "" ||
    (tab === "locks" ? reason !== "" : reporter !== "" || outcome !== "all") ||
    handler !== ""

  const rows = tab === "locks" ? lockRows : feedbackRows

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="NAMECARD AUDIT"
        title="名片审计"
        description="锁定与反馈记录：只读，用于追踪处理过程与问题用户。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            刷新
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(value) => switchTab(auditTab(value))}>
        <TabsList aria-label="名片审计类型">
          {AUDIT_TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>读取失败</AlertTitle>
          <AlertDescription>名片的审计记录无法加载，请稍后重试。</AlertDescription>
        </Alert>
      ) : null}

      <AdminPanel
        title={tab === "locks" ? "锁定记录" : "反馈记录"}
        description={
          tab === "locks"
            ? "当前仍处于锁定状态的名片；解锁后对应的记录会被删除。"
            : "已经处理过的反馈；待处理的反馈留在反馈队列里。"
        }
      >
        <AuditFilters
          key={filterKey}
          tab={tab}
          filters={{ owner, reason, handler, reporter, outcome }}
          hasFilters={hasFilters}
          onSubmit={(next) => applyFilters(next)}
          onClear={() => setSearchParams({ tab })}
        />

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <AdminEmptyState
            icon={ClipboardListIcon}
            title="没有符合条件的记录"
            description={
              hasFilters
                ? "换一个筛选条件试试。"
                : tab === "locks"
                  ? "目前没有名片处于锁定状态。"
                  : "还没有已经处理过的反馈。"
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名片</TableHead>
                <TableHead>归属用户</TableHead>
                {tab === "feedback" ? <TableHead>反馈人</TableHead> : null}
                <TableHead>{tab === "locks" ? "锁定理由" : "反馈理由"}</TableHead>
                {tab === "feedback" ? <TableHead>处理结果</TableHead> : null}
                <TableHead>处理人</TableHead>
                <TableHead>处理时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tab === "locks"
                ? lockRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">名片 #{row.cardNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.producerName ?? "未填写制作人"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <UserCell
                            user={row.owner}
                            onPick={() => applyFilters({ owner: row.owner!.name, page: "" })}
                          />
                        ) : (
                          <span className="text-muted-foreground">无归属用户</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-pre-wrap">
                        {row.reason}
                      </TableCell>
                      <TableCell>{row.handledBy ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatAuditMoment(row.lockedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                : feedbackRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">名片 #{row.cardNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.producerName ?? "未填写制作人"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <UserCell
                            user={row.owner}
                            onPick={() => applyFilters({ owner: row.owner!.name, page: "" })}
                          />
                        ) : (
                          <span className="text-muted-foreground">无归属用户</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <UserCell
                          user={row.reporter}
                          onPick={() =>
                            applyFilters({ reporter: row.reporter.name, page: "" })
                          }
                        />
                      </TableCell>
                      <TableCell>{feedbackReasonLabel(row.reason)}</TableCell>
                      <TableCell>
                        {row.outcome === "accepted" ? "已受理" : "未受理"}
                      </TableCell>
                      <TableCell>{row.handledBy ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatAuditMoment(row.handledAt)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}

        <AdminPagination
          page={page}
          totalPages={pageInfo.totalPages}
          disabled={loading}
          onChange={(nextPage) => {
            const next = new URLSearchParams(searchParams)
            if (nextPage <= 1) next.delete("page")
            else next.set("page", String(nextPage))
            setSearchParams(next)
          }}
        />
      </AdminPanel>
    </div>
  )
}

interface AuditFiltersValue {
  owner: string
  reason: string
  handler: string
  reporter: string
  outcome: string
}

/**
 * Mounted with a key built from the URL, so switching tabs or following a
 * filter link always starts from the filters the table is actually using.
 */
function AuditFilters({
  tab,
  filters,
  hasFilters,
  onSubmit,
  onClear,
}: {
  tab: AuditTab
  filters: AuditFiltersValue
  hasFilters: boolean
  onSubmit: (next: Record<string, string>) => void
  onClear: () => void
}) {
  const [owner, setOwner] = useState(filters.owner)
  const [reason, setReason] = useState(filters.reason)
  const [handler, setHandler] = useState(filters.handler)
  const [reporter, setReporter] = useState(filters.reporter)
  const [outcome, setOutcome] = useState(filters.outcome)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      owner: owner.trim(),
      reason: tab === "locks" ? reason.trim() : "",
      handler: handler.trim(),
      reporter: tab === "feedback" ? reporter.trim() : "",
      outcome: tab === "feedback" ? outcome : "all",
    })
  }

  return (
    <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">归属用户</span>
        <Input
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          placeholder="显示名称或账号 ID"
          className="w-48"
        />
      </label>
      {tab === "locks" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">锁定理由</span>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="理由关键词"
            className="w-48"
          />
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">反馈人</span>
            <Input
              value={reporter}
              onChange={(event) => setReporter(event.target.value)}
              placeholder="显示名称或账号 ID"
              className="w-48"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">处理结果</span>
            <Select
              value={outcome}
              onValueChange={(value) => setOutcome(String(value))}
              items={OUTCOME_ITEMS}
            >
              <SelectTrigger className="w-36" aria-label="处理结果">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {OUTCOME_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">处理人</span>
        <Input
          value={handler}
          onChange={(event) => setHandler(event.target.value)}
          placeholder="处理人用户名"
          className="w-40"
        />
      </label>
      <Button type="submit">
        <SearchIcon data-icon="inline-start" aria-hidden="true" />
        查询
      </Button>
      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={onClear}>
          清除筛选
        </Button>
      ) : null}
    </form>
  )
}

function UserCell({
  user,
  onPick,
}: {
  user: { name: string; total: number; pageCount: number }
  onPick: () => void
}) {
  return (
    <button
      type="button"
      className={`cursor-pointer text-left underline-offset-2 hover:underline ${adminControlClass}`}
      title={auditUserTitle(user)}
      onClick={onPick}
    >
      {auditUserLabel(user)}
    </button>
  )
}
