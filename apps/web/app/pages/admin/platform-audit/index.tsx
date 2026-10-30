import { ClipboardListIcon, RefreshCwIcon, XIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { useSearchParams } from "react-router"

import { AdminPagination } from "~/components/admin/admin-pagination"
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
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
  NamecardAuditUser,
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
  auditUserBadge,
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

const ACTION_ITEMS = [
  { value: "all", label: "全部操作" },
  { value: "locked", label: "已锁定" },
  { value: "unlocked", label: "已解锁" },
]

/** Typing settles before the table refetches, so every keystroke is one wait. */
const FILTER_DEBOUNCE_MS = 260

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
  const action = searchParams.get("action") ?? "all"
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

  const ownerInput = useRef<HTMLInputElement>(null)
  const reasonInput = useRef<HTMLInputElement>(null)
  const reporterInput = useRef<HTMLInputElement>(null)
  const handlerInput = useRef<HTMLInputElement>(null)
  const filterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingFilters = useRef<Record<string, string>>({})

  const loadKey = `${tab}:${owner}:${reason}:${handler}:${reporter}:${outcome}:${action}:${page}:${reloadToken}`
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
            action: action === "all" ? undefined : (action as "locked" | "unlocked"),
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
  }, [action, handler, loadKey, outcome, owner, page, reason, reporter, tab])

  useEffect(() => () => clearTimeout(filterTimer.current), [])

  const applyFilters = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams()
      const merged: Record<string, string> = { tab, ...patch }
      for (const [key, value] of Object.entries(merged)) {
        if (!value || key === "page" && value === "") continue
        if (key === "outcome" && value === "all") continue
        if (key === "action" && value === "all") continue
        next.set(key, value)
      }
      setSearchParams(next)
    },
    [setSearchParams, tab]
  )

  /** Typing filters the table on its own; no confirm button in the way. */
  const queueFilter = useCallback(
    (patch: Record<string, string>) => {
      pendingFilters.current = { ...pendingFilters.current, ...patch, page: "" }
      clearTimeout(filterTimer.current)
      filterTimer.current = setTimeout(() => {
        filterTimer.current = undefined
        const pending = pendingFilters.current
        pendingFilters.current = {}
        applyFilters(pending)
      }, FILTER_DEBOUNCE_MS)
    },
    [applyFilters]
  )

  const pickUser = useCallback(
    (field: "owner" | "reporter", name: string) => {
      const input = field === "owner" ? ownerInput.current : reporterInput.current
      if (input) input.value = name
      applyFilters({ [field]: name })
    },
    [applyFilters]
  )

  const clearField = useCallback(
    (field: "owner" | "reason" | "reporter" | "handler") => {
      const input = {
        owner: ownerInput,
        reason: reasonInput,
        reporter: reporterInput,
        handler: handlerInput,
      }[field].current
      if (input) input.value = ""
      applyFilters({ [field]: "", page: "" })
    },
    [applyFilters]
  )

  function switchTab(next: AuditTab) {
    setSearchParams({ tab: next })
  }

  const hasFilters =
    owner !== "" ||
    handler !== "" ||
    (tab === "locks"
      ? reason !== "" || action !== "all"
      : reporter !== "" || outcome !== "all")

  function clearFilters() {
    if (ownerInput.current) ownerInput.current.value = ""
    if (reasonInput.current) reasonInput.current.value = ""
    if (reporterInput.current) reporterInput.current.value = ""
    if (handlerInput.current) handlerInput.current.value = ""
    setSearchParams({ tab })
  }

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
            ? "每次锁定与解锁都会留下一条记录，按时间倒序排列。"
            : "已经处理过的反馈；待处理的反馈留在反馈队列里。"
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <FilterField label="归属用户">
            <ClearableInput
              inputRef={ownerInput}
              defaultValue={owner}
              placeholder="显示名称或账号 ID"
              onValueChange={(value) => queueFilter({ owner: value })}
              onClear={() => clearField("owner")}
            />
          </FilterField>
          {tab === "locks" ? (
            <>
              <FilterField label="锁定理由">
                <ClearableInput
                  inputRef={reasonInput}
                  defaultValue={reason}
                  placeholder="理由关键词"
                  onValueChange={(value) => queueFilter({ reason: value })}
                  onClear={() => clearField("reason")}
                />
              </FilterField>
              <FilterField label="操作">
                <Select
                  value={action}
                  onValueChange={(value) => applyFilters({ action: String(value) })}
                  items={ACTION_ITEMS}
                >
                  <SelectTrigger className="w-36" aria-label="操作">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ACTION_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FilterField>
            </>
          ) : (
            <>
              <FilterField label="反馈人">
                <ClearableInput
                  inputRef={reporterInput}
                  defaultValue={reporter}
                  placeholder="显示名称或账号 ID"
                  onValueChange={(value) => queueFilter({ reporter: value })}
                  onClear={() => clearField("reporter")}
                />
              </FilterField>
              <FilterField label="处理结果">
                <Select
                  value={outcome}
                  onValueChange={(value) => applyFilters({ outcome: String(value) })}
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
              </FilterField>
            </>
          )}
          <FilterField label="处理人">
            <ClearableInput
              inputRef={handlerInput}
              defaultValue={handler}
              placeholder="处理人用户名"
              onValueChange={(value) => queueFilter({ handler: value })}
              onClear={() => clearField("handler")}
            />
          </FilterField>
          <Button
            type="button"
            variant="ghost"
            disabled={!hasFilters}
            onClick={clearFilters}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            清除筛选
          </Button>
        </div>

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
                  ? "还没有任何锁定记录。"
                  : "还没有已经处理过的反馈。"
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名片</TableHead>
                {tab === "locks" ? <TableHead>操作</TableHead> : null}
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
                      <CardCell
                        cardNumber={row.cardNumber}
                        producerName={row.producerName}
                      />
                      <TableCell className="whitespace-nowrap">
                        {row.action === "locked" ? "已锁定" : "已解锁"}
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <UserCell
                            user={row.owner}
                            onPick={() => pickUser("owner", row.owner!.name)}
                          />
                        ) : (
                          <span className="text-muted-foreground">无归属用户</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-pre-wrap text-muted-foreground">
                        {row.reason ?? "—"}
                      </TableCell>
                      <TableCell>{row.handledBy ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatAuditMoment(row.occurredAt)}
                      </TableCell>
                    </TableRow>
                  ))
                : feedbackRows.map((row) => (
                    <TableRow key={row.id}>
                      <CardCell
                        cardNumber={row.cardNumber}
                        producerName={row.producerName}
                      />
                      <TableCell>
                        {row.owner ? (
                          <UserCell
                            user={row.owner}
                            onPick={() => pickUser("owner", row.owner!.name)}
                          />
                        ) : (
                          <span className="text-muted-foreground">无归属用户</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <UserCell
                          user={row.reporter}
                          onPick={() => pickUser("reporter", row.reporter.name)}
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

function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** The clear cross sits inside the field so a filter never needs the keyboard. */
function ClearableInput({
  inputRef,
  defaultValue,
  placeholder,
  onValueChange,
  onClear,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  defaultValue: string
  placeholder: string
  onValueChange: (value: string) => void
  onClear: () => void
}) {
  return (
    <span className="relative block">
      <Input
        ref={inputRef}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-48 pr-9"
        onInput={(event) => onValueChange(event.currentTarget.value.trim())}
      />
      <button
        type="button"
        aria-label={`清空${placeholder}`}
        className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onClear}
      >
        <XIcon className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}

function CardCell({
  cardNumber,
  producerName,
}: {
  cardNumber: number
  producerName: string | null
}) {
  return (
    <TableCell>
      <div className="font-medium">名片 #{cardNumber}</div>
      <div className="text-xs text-muted-foreground">
        {producerName ?? "未填写制作人"}
      </div>
    </TableCell>
  )
}

/**
 * A name that reads as text until hovered: the click filters the table, and the
 * lifetime count only matters when an account repeats.
 */
function UserCell({
  user,
  onPick,
}: {
  user: NamecardAuditUser
  onPick: () => void
}) {
  return (
    <button
      type="button"
      className="cursor-pointer text-left text-foreground underline decoration-border decoration-dotted underline-offset-2 hover:decoration-foreground"
      title={auditUserTitle(user)}
      onClick={onPick}
    >
      {user.name}
      {auditUserBadge(user) ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {auditUserBadge(user)}
        </span>
      ) : null}
    </button>
  )
}

