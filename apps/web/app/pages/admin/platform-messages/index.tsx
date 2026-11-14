import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router"
import { toast } from "sonner"

import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
  adminTextareaClass,
} from "~/components/admin/admin-ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { Textarea } from "~/components/ui/textarea"
import { adminErrorMessage } from "~/lib/admin-error"
import { cn } from "~/lib/utils"
import { useNavigation } from "~/lib/navigation/use-navigation"
import {
  ADMIN_STATION_MESSAGE_MAX_LEAD_MS,
  ADMIN_STATION_MESSAGE_MIN_LEAD_MS,
  getAdminStationMessageRecipients,
  sendAdminStationMessage,
  type AdminStationMessageAudience,
  type AdminStationMessageSendInput,
  type AdminStationMessageTargetList,
  type AdminStationMessageTarget,
} from "~/lib/api"

interface AdminOutletContext {
  adminSession: { adminRole: string | null }
}

const TITLE_LIMIT = 200
const BODY_LIMIT = 4000
const RECIPIENT_PAGE_SIZE = 8

const EMPTY_PAGE_INFO: AdminStationMessageTargetList["pageInfo"] = {
  page: 1,
  pageSize: RECIPIENT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** Local minute string the contract stores alongside the epoch timestamp, so a
 * draft whose clock minute drifted is rejected instead of silently shifting. */
function localMinute(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function scheduleBounds() {
  const now = Date.now()
  return {
    min: localMinute(new Date(now + ADMIN_STATION_MESSAGE_MIN_LEAD_MS)),
    max: localMinute(new Date(now + ADMIN_STATION_MESSAGE_MAX_LEAD_MS)),
  }
}

function recipientLabel(target: AdminStationMessageTarget) {
  return target.displayName || target.email || target.accountId
}

/** Lead time of a picked instant, or null when the field is not a valid date.
 * Module scope keeps the clock read out of render. */
function scheduleLeadMs(value: string) {
  const when = new Date(value).getTime()
  return Number.isSafeInteger(when) ? when - Date.now() : null
}

/** `datetime-local` value rendered for humans; module scope keeps the clock
 * read out of the component body. */
function formatLocalMinute(value: string) {
  const when = new Date(value).getTime()
  return value.length > 0 && Number.isSafeInteger(when)
    ? new Date(when).toLocaleString()
    : "未选择时间"
}

function formatTime(value: number | null) {
  return value === null ? "—" : new Date(value).toLocaleString()
}

interface ModeSwitchOption<T extends string> {
  value: T
  label: string
}

/** Draft-option switch. Deliberately flat (no filled button): the only filled
 * control on the page is the submit button, so the two cannot be confused.
 * Also stops the "立即发送" option from looking like the submit action. */
function ModeSwitch<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: readonly ModeSwitchOption<T>[]
  disabled: boolean
  onChange: (next: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-fit rounded-lg border bg-muted/40 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === option.value
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled ? "cursor-not-allowed opacity-50" : null
          )}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function meta() {
  return [{ title: "发送通知 | IMSWeb" }]
}

export default function AdminPlatformMessagesPage() {
  const { adminSession } = useOutletContext<AdminOutletContext>()
  const navigate = useNavigation()
  const canSend = adminSession.adminRole === "super_admin"

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [audience, setAudience] = useState<AdminStationMessageAudience>("all")
  const [forwardEmail, setForwardEmail] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduledLocal, setScheduledLocal] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [selected, setSelected] = useState<AdminStationMessageTarget[]>([])
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [targets, setTargets] = useState<AdminStationMessageTarget[]>([])
  const [pageInfo, setPageInfo] =
    useState<AdminStationMessageTargetList["pageInfo"]>(EMPTY_PAGE_INFO)
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [targetsError, setTargetsError] = useState(false)

  const selectedIds = useMemo(
    () => new Set(selected.map((target) => target.accountId)),
    [selected]
  )
  const bounds = scheduleBounds()

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!canSend || audience !== "selected") return
    let active = true
    getAdminStationMessageRecipients({
      query: query || undefined,
      page,
      pageSize: RECIPIENT_PAGE_SIZE,
    })
      .send()
      .then((result) => {
        if (!active) return
        setTargets(result.targets)
        setPageInfo(result.pageInfo)
        setTargetsError(false)
      })
      .catch(() => {
        if (!active) return
        setTargetsError(true)
      })
      .finally(() => {
        if (!active) return
        setLoadingTargets(false)
      })
    return () => {
      active = false
    }
  }, [audience, canSend, page, query])

  function toggleRecipient(target: AdminStationMessageTarget) {
    setSelected((current) =>
      current.some((item) => item.accountId === target.accountId)
        ? current.filter((item) => item.accountId !== target.accountId)
        : [...current, target]
    )
  }

  function resetDraft() {
    setTitle("")
    setBody("")
    setAudience("all")
    setSelected([])
    setForwardEmail(false)
    setScheduling(false)
    setScheduledLocal("")
    setSearch("")
    setQuery("")
    setPage(1)
  }

  function draftProblem() {
    if (title.trim().length === 0) return "请填写标题"
    if (title.trim().length > TITLE_LIMIT)
      return `标题不能超过 ${TITLE_LIMIT} 字`
    if (body.trim().length === 0) return "请填写正文"
    if (body.trim().length > BODY_LIMIT) return `正文不能超过 ${BODY_LIMIT} 字`
    if (audience === "selected" && selected.length === 0)
      return "请至少选择一位接收用户"
    if (!scheduling) return null
    if (scheduledLocal.length === 0) return "请选择定时发送时间"
    const lead = scheduleLeadMs(scheduledLocal)
    if (lead === null) return "定时发送时间无效"
    if (lead < ADMIN_STATION_MESSAGE_MIN_LEAD_MS)
      return "定时发送至少要留出 1 分钟"
    if (lead > ADMIN_STATION_MESSAGE_MAX_LEAD_MS)
      return "定时发送最多预约 90 天"
    return null
  }

  async function submit() {
    const problem = draftProblem()
    if (problem) {
      toast.error(problem)
      return
    }
    const scheduledAt = scheduling ? new Date(scheduledLocal).getTime() : null
    const input: AdminStationMessageSendInput = {
      title: title.trim(),
      body: body.trim(),
      audience,
      ...(audience === "selected"
        ? { accountIds: selected.map((target) => target.accountId) }
        : {}),
      forwardEmail,
      scheduledAt,
      ...(scheduledAt === null ? {} : { scheduledLocalMinute: scheduledLocal }),
    }
    setSubmitting(true)
    try {
      const result = await sendAdminStationMessage(input).send()
      const message = result.message
      toast.success(
        message.status === "sent"
          ? `已送达 ${message.deliveredCount} 位用户`
          : `已排定于 ${formatTime(message.scheduledAt)} 发送`
      )
      resetDraft()
      navigate("/admin/platform/messages/history")
    } catch (error) {
      toast.error(adminErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canSend) {
    return (
      <div className="flex flex-col gap-8">
        <AdminPageHeader
          eyebrow="PLATFORM MESSAGES"
          title="发送通知"
          description="向站内用户批量发送通知。"
        />
        <Alert variant="destructive">
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>仅最高管理员可访问</AlertTitle>
          <AlertDescription>站内群发会影响全站用户。</AlertDescription>
        </Alert>
      </div>
    )
  }

  const problem = draftProblem()
  const busy = submitting

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AdminPageHeader
        eyebrow="PLATFORM MESSAGES"
        title="发送通知"
        description="通知会进入用户的「消息」面板并计入未读角标；勾选转发后还会寄往已绑定邮箱。"
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>
              {audience === "all" ? "群发" : `指定 ${selected.length} 人`}
            </AdminStatus>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/platform/messages/history")}
            >
              历史审计
            </Button>
          </div>
        }
      />

      <AdminPanel
        title="内容"
        description="标题与正文会原样出现在收件人的消息面板里。"
        icon={MailCheckIcon}
        footer={
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {title.trim().length}/{TITLE_LIMIT} 字标题 · {body.trim().length}/
              {BODY_LIMIT} 字正文
            </span>
          </div>
        }
      >
        <div className="grid min-w-0 gap-5">
          <AdminField label="标题" htmlFor="station-message-title">
            <Input
              id="station-message-title"
              value={title}
              maxLength={TITLE_LIMIT}
              className={adminControlClass}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </AdminField>
          <AdminField label="正文" htmlFor="station-message-body">
            <Textarea
              id="station-message-body"
              value={body}
              maxLength={BODY_LIMIT}
              rows={8}
              className={adminTextareaClass}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
            />
          </AdminField>
          <label className="flex min-h-16 items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <Checkbox
              checked={forwardEmail}
              disabled={busy}
              onCheckedChange={(checked) => setForwardEmail(checked === true)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                同时转发到绑定邮箱
              </span>
              <span className="mt-1 block text-xs/5 text-muted-foreground">
                只有绑定了邮箱的收件人会收到邮件；SMTP 由「邮件配置」提供。
              </span>
            </span>
          </label>
        </div>
      </AdminPanel>

      <AdminPanel
        title="接收用户"
        description="群发会覆盖当前所有有效站内用户。"
        icon={UsersRoundIcon}
      >
        <div className="grid min-w-0 gap-4">
          <ModeSwitch
            label="接收范围"
            value={audience}
            disabled={busy}
            options={[
              { value: "all", label: "全部用户" },
              { value: "selected", label: "指定用户" },
            ]}
            onChange={setAudience}
          />

          {audience === "selected" ? (
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    placeholder="按昵称、邮箱或账号 ID 检索"
                    className={`${adminControlClass} pl-9`}
                    disabled={busy}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <AdminStatus>共 {pageInfo.total} 位</AdminStatus>
              </div>

              {selected.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selected.map((target) => (
                    <Badge key={target.accountId} variant="secondary">
                      {recipientLabel(target)}
                      <button
                        type="button"
                        className="ml-1 rounded-full"
                        aria-label={`移除 ${recipientLabel(target)}`}
                        disabled={busy}
                        onClick={() => toggleRecipient(target)}
                      >
                        <XIcon className="size-3" aria-hidden="true" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}

              {targetsError ? (
                <Alert variant="destructive">
                  <AlertTitle>收件人读取失败</AlertTitle>
                  <AlertDescription>请稍后重试。</AlertDescription>
                </Alert>
              ) : null}

              <div className="divide-y rounded-lg border">
                {loadingTargets
                  ? Array.from({ length: 3 }, (_, index) => (
                      <div key={index} className="p-3">
                        <Skeleton className="h-4 w-48" />
                      </div>
                    ))
                  : targets.map((target) => {
                      const picked = selectedIds.has(target.accountId)
                      return (
                        <button
                          key={target.accountId}
                          type="button"
                          className="flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted/40"
                          disabled={busy}
                          onClick={() => toggleRecipient(target)}
                        >
                          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] border">
                            {picked ? (
                              <CheckIcon
                                className="size-3"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {target.displayName || "（未设置昵称）"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {target.email ?? "未绑定邮箱"} ·{" "}
                              {target.accountId}
                            </span>
                          </span>
                          {target.status === "active" ? null : (
                            <Badge variant="secondary">{target.status}</Badge>
                          )}
                        </button>
                      )
                    })}
                {!loadingTargets && targets.length === 0 && !targetsError ? (
                  <AdminEmptyState
                    icon={UsersRoundIcon}
                    title="没有匹配的站内用户"
                    description="换一个昵称、邮箱或账号 ID 再试。"
                  />
                ) : null}
              </div>

              {pageInfo.totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || page <= 1}
                    onClick={() => {
                      setLoadingTargets(true)
                      setPage((current) => Math.max(1, current - 1))
                    }}
                  >
                    <ArrowLeftIcon data-icon="inline-start" />
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {pageInfo.page} / {pageInfo.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !pageInfo.hasNextPage}
                    onClick={() => {
                      setLoadingTargets(true)
                      setPage((current) => current + 1)
                    }}
                  >
                    下一页
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminPanel>

      <AdminPanel
        title="发送时机"
        description="定时发送由 API 内的派发器按分钟轮询。"
        icon={CalendarClockIcon}
      >
        <div className="grid min-w-0 gap-4">
          <ModeSwitch
            label="发送时机"
            value={scheduling ? "scheduled" : "now"}
            disabled={busy}
            options={[
              { value: "now", label: "立即发送" },
              { value: "scheduled", label: "定时发送" },
            ]}
            onChange={(next) => setScheduling(next === "scheduled")}
          />
          {scheduling ? (
            <AdminField
              label="发送时间"
              htmlFor="station-message-schedule"
              description="使用本机时区；最早 1 分钟后，最晚 90 天内。"
            >
              <Input
                id="station-message-schedule"
                type="datetime-local"
                value={scheduledLocal}
                min={bounds.min}
                max={bounds.max}
                className={adminControlClass}
                disabled={busy}
                onChange={(event) => setScheduledLocal(event.target.value)}
              />
            </AdminField>
          ) : null}
        </div>
      </AdminPanel>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
        <div className="min-w-0 text-sm text-muted-foreground">
          {problem ? (
            problem
          ) : (
            <>
              {audience === "all"
                ? "将发送给所有有效站内用户"
                : `将发送给 ${selected.length} 位指定用户`}
              {scheduling
                ? ` · 排定于 ${formatLocalMinute(scheduledLocal)}`
                : " · 提交后立即送达"}
            </>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          disabled={busy || problem !== null}
          onClick={() => void submit()}
        >
          {busy ? (
            <LoaderCircleIcon
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <SendIcon data-icon="inline-start" />
          )}
          {scheduling ? "排定发送通知" : "立即发送通知"}
        </Button>
      </div>
    </div>
  )
}
