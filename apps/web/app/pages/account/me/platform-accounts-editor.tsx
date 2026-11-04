import {
  ArrowLeftIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  EyeIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"

import {
  decodePlatformValue,
  encodePlatformValue,
  formatPlatformValue,
  platformValueError,
} from "@imsweb/contracts/namecards"

import { Button } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  deleteMyPlatformAccount,
  getMyPlatformAccounts,
  isApiError,
  saveMyPlatformAccount,
  type MyPlatformAccounts,
  type PlatformAccountKind,
} from "~/lib/api"
import { PlatformAccountKindIcon } from "./components/platform-account-kind-icon"

type Entry = MyPlatformAccounts["entries"][number]
type EditorDialog =
  | { step: "choose"; query: string }
  | {
      step: "edit" | "remove"
      kind: PlatformAccountKind
      value: string
      username: string
    }

const GROUPS = [
  { title: "个人主页", match: ["link"] },
  { title: "游戏 ID", match: ["game"] },
  { title: "平台账号", match: ["social", "showcase", "game-platform"] },
] as const
const alwaysCurrent = () => true

function platformAccountHref(kind: PlatformAccountKind, entry: Entry) {
  const target =
    kind.group === "link"
      ? entry.value
      : kind.baseUrl?.replace("{value}", encodeURIComponent(entry.value))
  if (!target) return null
  try {
    const url = new URL(target)
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function PlatformAccountsEditor({
  readOnly = false,
  readOnlyReason = null,
  isOperationCurrent = alwaysCurrent,
}: {
  readOnly?: boolean
  readOnlyReason?: string | null
  isOperationCurrent?: () => boolean
}) {
  const [catalog, setCatalog] = useState<PlatformAccountKind[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [dialog, setDialog] = useState<EditorDialog | null>(null)
  const [pending, setPending] = useState<"save" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const valueInput = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const mounted = useRef(false)
  const access = useRef({ readOnly, isOperationCurrent })
  const fieldId = useId()

  useEffect(() => {
    access.current = { readOnly, isOperationCurrent }
  }, [readOnly, isOperationCurrent])

  useEffect(() => {
    mounted.current = true
    let active = true
    void getMyPlatformAccounts()
      .send()
      .then((result) => {
        if (!active) return
        setCatalog(result.catalog)
        setEntries(result.entries)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      mounted.current = false
    }
  }, [])

  const selected = dialog && dialog.step !== "choose" ? dialog : null
  const selectedId = selected?.kind.id
  const editingId = selected?.step === "edit" ? selectedId : undefined
  useEffect(() => {
    if (editingId) valueInput.current?.focus()
  }, [editingId])

  const existing = entries.find((entry) => entry.kindId === selectedId)
  const value = selected
    ? formatPlatformValue(selected.kind, selected.value)
    : ""
  const encoded = selected ? encodePlatformValue(selected.kind, value) : ""
  const validation = selected
    ? encoded.length > 200
      ? "账号标识超出平台允许的长度"
      : platformValueError(selected.kind, encoded)
    : null
  const message = error ?? validation
  const available = catalog.filter(
    (kind) => kind.enabled && !entries.some((entry) => entry.kindId === kind.id)
  )
  const choices = available.filter((kind) =>
    `${kind.name} ${kind.id}`
      .toLocaleLowerCase()
      .includes(
        (dialog?.step === "choose" ? dialog.query : "")
          .trim()
          .toLocaleLowerCase()
      )
  )

  function canWrite() {
    return !access.current.readOnly && access.current.isOperationCurrent()
  }

  function choose() {
    if (busy.current || !canWrite()) return
    setError(null)
    setDialog({ step: "choose", query: "" })
  }

  function openAccount(
    kind: PlatformAccountKind,
    entry?: Entry,
    step: "edit" | "remove" = "edit"
  ) {
    if (busy.current || !canWrite()) return
    setError(null)
    setDialog({
      step,
      kind,
      value: entry ? decodePlatformValue(kind, entry.value) : "",
      username: entry?.username ?? "",
    })
  }

  function close() {
    if (!busy.current) setDialog(null)
  }

  async function mutate(remove: boolean) {
    if (!selected || busy.current || !canWrite()) return
    const { kind, username } = selected
    if (!remove && !kind.enabled) return
    if (!remove && validation) return
    if (!remove && !value && !existing) {
      if (username.trim()) {
        setError("请先填写账号标识，再保存用户名。")
      } else {
        setDialog(null)
      }
      return
    }
    const deleting = remove || !value
    // Keep the operation's original workspace generation as well as current access.
    const operationCurrent = isOperationCurrent
    const current = () => mounted.current && operationCurrent() && canWrite()
    busy.current = true
    setPending(deleting ? "remove" : "save")
    setError(null)
    try {
      if (deleting) {
        await deleteMyPlatformAccount(kind.id).send()
        if (!current()) return
        setEntries((items) => items.filter((item) => item.kindId !== kind.id))
      } else {
        const saved = await saveMyPlatformAccount(
          kind.id,
          value,
          kind.baseUrl ? username.trim() || null : null
        ).send()
        if (!current()) return
        setEntries((items) => [
          ...items.filter((item) => item.kindId !== kind.id),
          saved,
        ])
      }
      setDialog(null)
      toast.success(deleting ? "平台账号已移除" : "平台账号已保存")
    } catch (failure) {
      if (current()) {
        setError(
          isApiError(failure)
            ? failure.message
            : deleting
              ? "移除失败，请重试"
              : "保存失败，请重试"
        )
      }
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void mutate(false)
  }

  if (loading) {
    return (
      <p
        role="status"
        className="flex h-24 items-center justify-center text-sm text-muted-foreground"
      >
        <LoaderCircleIcon
          className="mr-2 size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        正在载入
      </p>
    )
  }
  if (failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        平台账号暂时无法加载，请刷新页面重试。
      </p>
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          全部选填，只显示已添加的内容。
        </p>
        <Button
          ref={addButton}
          type="button"
          disabled={readOnly || available.length === 0}
          aria-haspopup="dialog"
          onClick={(event) => {
            returnFocus.current = event.currentTarget
            choose()
          }}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          添加账号
        </Button>
      </div>
      {readOnlyReason ? (
        <p className="text-sm text-muted-foreground">{readOnlyReason}</p>
      ) : null}
      {entries.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-8 text-center">
          <CreditCardIcon
            className="mb-4 size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">还没有添加平台账号</p>
          <p className="mt-2 text-sm/6 text-muted-foreground">
            {available.length
              ? "点击「添加账号」，选择你想展示的内容。可以只添加一项，也可以保持空白。"
              : "暂时没有可添加的平台。"}
          </p>
        </div>
      ) : null}
      {GROUPS.map((group) => {
        const rows = catalog.flatMap((kind) => {
          const entry = entries.find((item) => item.kindId === kind.id)
          return entry &&
            (group.match as readonly string[]).includes(kind.group)
            ? [{ kind, entry }]
            : []
        })
        if (!rows.length) return null
        return (
          <section
            key={group.title}
            aria-label={group.title}
            className="space-y-3"
          >
            <h3 className="text-sm font-medium text-muted-foreground">
              {group.title}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map(({ kind, entry }) => {
                const href = platformAccountHref(kind, entry)
                const body = (
                  <>
                    <PlatformAccountKindIcon kind={kind} className="size-5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="min-w-0 wrap-anywhere">
                          {kind.name}
                        </span>
                        {href ? (
                          <ExternalLinkIcon
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {entry.username ||
                          decodePlatformValue(kind, entry.value)}
                      </span>
                      {!kind.enabled ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          已停用 · 可移除
                        </span>
                      ) : null}
                    </span>
                  </>
                )
                const contentClass =
                  "flex min-h-24 min-w-0 flex-1 items-center gap-3 rounded-lg p-4 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-18 lg:py-2.5"
                return (
                  <div
                    key={kind.id}
                    role="group"
                    aria-label={`${kind.name}账号`}
                    className="flex min-w-0 rounded-lg border bg-card/95 transition-colors hover:bg-muted/60"
                  >
                    {href ? (
                      <>
                        <NavigationLink
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={
                            kind.group === "link"
                              ? "打开个人主页"
                              : `打开${kind.name}主页`
                          }
                          className={contentClass}
                        >
                          {body}
                        </NavigationLink>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="shrink-0 self-center max-sm:size-11"
                          aria-label={`编辑${kind.name}`}
                          aria-haspopup="dialog"
                          disabled={readOnly}
                          onClick={(event) => {
                            returnFocus.current = event.currentTarget
                            openAccount(kind, entry)
                          }}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={contentClass}
                        aria-label={`编辑${kind.name}`}
                        aria-haspopup="dialog"
                        disabled={readOnly}
                        onClick={(event) => {
                          returnFocus.current = event.currentTarget
                          openAccount(kind, entry)
                        }}
                      >
                        {body}
                        <PencilIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="mr-2 shrink-0 self-center text-muted-foreground hover:text-destructive max-sm:size-11"
                      aria-label={`删除${kind.name}账号`}
                      aria-haspopup="dialog"
                      title="删除"
                      disabled={readOnly}
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget
                        openAccount(kind, entry, "remove")
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="flex items-start gap-2 text-xs/6 text-muted-foreground">
        <EyeIcon className="mt-1 size-4 shrink-0" aria-hidden="true" />
        每个平台单独保存，可以随时编辑或移除。
      </p>

      <Dialog
        open={dialog !== null && dialog.step !== "remove" && !readOnly}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          layout="pinned"
          className="sm:max-w-lg"
          showCloseButton={!pending}
          finalFocus={() =>
            returnFocus.current?.isConnected
              ? returnFocus.current
              : addButton.current
          }
        >
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-3">
              {selected && !existing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={Boolean(pending)}
                  aria-label="返回选择平台"
                  onClick={choose}
                >
                  <ArrowLeftIcon aria-hidden="true" />
                </Button>
              ) : null}
              {selected ? (
                <PlatformAccountKindIcon
                  kind={selected.kind}
                  className="size-5"
                />
              ) : (
                <PlusIcon aria-hidden="true" className="size-5 text-primary" />
              )}
              <DialogTitle>
                {selected ? selected.kind.name : "添加平台账号"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {selected
                ? "按需填写，保存后显示在个人主页。"
                : "先选择要添加的内容，再填写账号信息。仅显示尚未添加的平台。"}
            </DialogDescription>
          </DialogHeader>
          {dialog?.step === "choose" ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-search`}>选择平台</FieldLabel>
                <Input
                  id={`${fieldId}-search`}
                  type="search"
                  placeholder="搜索平台或游戏"
                  value={dialog.query}
                  onChange={(event) =>
                    setDialog({
                      step: "choose",
                      query: event.currentTarget.value,
                    })
                  }
                />
              </Field>
              <DialogBody className="space-y-5 p-1">
                {GROUPS.map((group) => {
                  const kinds = choices.filter((kind) =>
                    (group.match as readonly string[]).includes(kind.group)
                  )
                  if (!kinds.length) return null
                  return (
                    <section
                      key={group.title}
                      aria-label={group.title}
                      className="space-y-2"
                    >
                      <h3 className="text-xs font-medium text-muted-foreground">
                        {group.title}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {kinds.map((kind) => (
                          <button
                            key={kind.id}
                            type="button"
                            aria-label={`选择${kind.name}`}
                            className="flex min-h-16 min-w-0 items-center gap-3 rounded-lg border bg-background/70 p-3 text-left hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                            onClick={() => openAccount(kind)}
                          >
                            <PlatformAccountKindIcon
                              kind={kind}
                              className="size-5"
                            />
                            <span className="min-w-0 flex-1 text-sm wrap-anywhere">
                              {kind.name}
                            </span>
                            <PlusIcon
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                      </div>
                    </section>
                  )
                })}
                {!choices.length ? (
                  <p
                    role="status"
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {available.length
                      ? "没有找到这个平台，试试其他关键词。"
                      : "所有可用平台都已添加。"}
                  </p>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
              </DialogFooter>
            </>
          ) : selected ? (
            <>
              <DialogBody>
                <form
                  id={`${fieldId}-form`}
                  className="space-y-5 p-1"
                  aria-busy={Boolean(pending)}
                  onSubmit={submit}
                >
                  {!selected.kind.enabled ? (
                    <p className="text-sm text-muted-foreground">
                      该平台已停用，你仍可移除已保存的账号。
                    </p>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor={`${fieldId}-value`}>
                      {selected.kind.group === "link"
                        ? "主页链接"
                        : selected.kind.group === "game"
                          ? "游戏 ID"
                          : "账号标识或链接"}
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        选填
                      </span>
                    </FieldLabel>
                    <Input
                      ref={valueInput}
                      id={`${fieldId}-value`}
                      aria-label={selected.kind.name}
                      aria-invalid={Boolean(message)}
                      aria-describedby={
                        message ? `${fieldId}-error` : `${fieldId}-help`
                      }
                      value={selected.value}
                      placeholder={
                        selected.kind.baseUrl ??
                        (selected.kind.group === "link"
                          ? "https://"
                          : "输入账号标识")
                      }
                      maxLength={200}
                      autoComplete="off"
                      disabled={Boolean(pending) || !selected.kind.enabled}
                      onChange={(event) => {
                        const raw = event.currentTarget.value
                        // Keep a trailing space while typing handles such as Xbox Gamertags.
                        const next = /\s$/.test(raw)
                          ? raw
                          : formatPlatformValue(selected.kind, raw)
                        setError(null)
                        setDialog({ ...selected, value: next })
                      }}
                    />
                    <FieldDescription id={`${fieldId}-help`}>
                      {selected.kind.baseUrl
                        ? "可以粘贴完整链接，也可以只填写标识符。"
                        : selected.kind.group === "link"
                          ? "填写完整的个人网站或博客链接。"
                          : "填写符合该平台格式的游戏或账号标识。"}
                    </FieldDescription>
                  </Field>
                  {selected.kind.baseUrl ? (
                    <Field>
                      <FieldLabel htmlFor={`${fieldId}-username`}>
                        用户名
                        <span className="ml-auto text-xs font-normal text-muted-foreground">
                          选填
                        </span>
                      </FieldLabel>
                      <Input
                        id={`${fieldId}-username`}
                        aria-label={`${selected.kind.name} 用户名`}
                        value={selected.username}
                        maxLength={60}
                        placeholder="用于个人主页展示"
                        disabled={Boolean(pending) || !selected.kind.enabled}
                        onChange={(event) => {
                          setError(null)
                          setDialog({
                            ...selected,
                            username: event.currentTarget.value,
                          })
                        }}
                      />
                    </Field>
                  ) : null}
                  {message ? (
                    <p
                      role="alert"
                      id={`${fieldId}-error`}
                      className="text-sm text-destructive"
                    >
                      {message}
                    </p>
                  ) : null}
                  <p className="rounded-lg bg-muted/60 p-3 text-xs/6 text-muted-foreground">
                    {existing
                      ? "清空账号标识并保存，或点击「移除」，即可从个人主页移除此项。"
                      : "不填写则不会添加，你不必填写所有平台。"}
                  </p>
                </form>
              </DialogBody>
              <DialogFooter className="flex-row items-center justify-end">
                {existing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive"
                    disabled={Boolean(pending)}
                    onClick={() => void mutate(true)}
                  >
                    <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                    {pending === "remove" ? "正在移除" : "移除"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(pending)}
                  onClick={close}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  form={`${fieldId}-form`}
                  disabled={
                    Boolean(pending) ||
                    Boolean(validation) ||
                    !selected.kind.enabled
                  }
                >
                  {pending === "save" ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : null}
                  {pending === "save" ? "正在保存" : "保存"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={dialog?.step === "remove" && !readOnly}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <AlertDialogContent
          aria-busy={Boolean(pending)}
          finalFocus={() =>
            returnFocus.current?.isConnected
              ? returnFocus.current
              : addButton.current
          }
        >
          <AlertDialogHeader>
            <AlertDialogTitle>移除{selected?.kind.name}账号</AlertDialogTitle>
            <AlertDialogDescription>
              将清空这条记录的账号标识和用户名，并从个人主页中移除。你可以稍后重新添加。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pending)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(pending)}
              onClick={() => void mutate(true)}
            >
              {pending === "remove" ? "正在删除" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
