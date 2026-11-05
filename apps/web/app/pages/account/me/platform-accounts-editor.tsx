import { Drawer } from "@base-ui/react/drawer"
import {
  HomeIcon,
  InfoIcon,
  LinkIcon,
  LoaderCircleIcon,
  TrashIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  decodePlatformValue,
  encodePlatformValue,
  formatPlatformValue,
  matchPlatformAccountKind,
  platformValueError,
} from "@imsweb/contracts/namecards"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { platformIconUrl } from "~/components/profile/platform-account-icons"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  deleteMyPlatformAccount,
  getMyPlatformAccounts,
  isApiError,
  saveMyPlatformAccount,
  type PlatformAccountKind,
} from "~/lib/api"
import { useMediaQuery } from "~/lib/use-media-query"

const GUIDE_LABEL = "查看支持的平台与链接模板"
const DESKTOP_QUERY = "(min-width: 768px)"

const MATCH_FAILED =
  "没有匹配到支持的平台，请检查平台是否受支持、链接格式是否符合提示中的模板。"
const ALREADY_ADDED = "这个平台已经添加过了，先移除再重新粘贴。"

/** 输入框里提示的是链接模板，而不是正则。 */
function placeholderFor(kind: PlatformAccountKind): string {
  if (kind.baseUrl) return kind.baseUrl
  return kind.group === "link" ? "https://" : ""
}

/** 桌面提示空间小、移动端抽屉空间大，同一张表两档字号。 */
const TEMPLATE_TABLE_SIZES = {
  dense: {
    table: "",
    headRow: "opacity-70",
    headCell: "pb-0.5 font-normal",
    nameCell: "py-0.5 pr-3 font-normal whitespace-nowrap",
    templateCell: "w-full py-0.5 font-mono text-[11px] break-all opacity-80",
  },
  regular: {
    table: "text-sm",
    headRow: "text-xs text-muted-foreground",
    headCell: "pb-1 font-normal",
    nameCell: "py-1 pr-3 font-normal whitespace-nowrap",
    templateCell:
      "w-full py-1 font-mono text-xs break-all text-muted-foreground",
  },
} as const

/** 平台名一列不换行，模板一列统一左对齐；提示和移动端抽屉共用。 */
function PlatformTemplateTable({
  kinds,
  size = "dense",
}: {
  kinds: PlatformAccountKind[]
  size?: keyof typeof TEMPLATE_TABLE_SIZES
}) {
  const styles = TEMPLATE_TABLE_SIZES[size]
  return (
    <table className={`w-full border-collapse text-left ${styles.table}`}>
      <thead>
        <tr className={styles.headRow}>
          <th
            scope="col"
            className={`pr-3 whitespace-nowrap ${styles.headCell}`}
          >
            平台
          </th>
          <th scope="col" className={styles.headCell}>
            链接模板
          </th>
        </tr>
      </thead>
      <tbody>
        {kinds.map((kind) => (
          <tr key={kind.id} className="align-top">
            <th scope="row" className={styles.nameCell}>
              {kind.name}
            </th>
            <td className={styles.templateCell}>{kind.baseUrl}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请重试"
}

function KindIcon({ kind }: { kind: PlatformAccountKind }) {
  if (kind.group === "link")
    return (
      <HomeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
    )
  // 图标只收带透明通道的文件，所以一律当单色遮罩用，颜色由品牌色提供。
  const url = platformIconUrl(kind.icon, kind.iconUrl)
  if (url)
    return (
      <span
        aria-hidden="true"
        className="size-4 shrink-0"
        style={{
          backgroundColor: kind.color ?? "currentColor",
          maskImage: `url("${url}")`,
          WebkitMaskImage: `url("${url}")`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
    )
  return (
    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
      {kind.name.slice(0, 1)}
    </span>
  )
}

/**
 * 已添加的平台条目：整行只读，模板部分弱化，`{value}` 保持正常颜色。
 * 想改值只能先移除再重新粘贴链接。
 */
function PlatformLink({
  kind,
  value,
}: {
  kind: PlatformAccountKind
  value: string
}) {
  const marker = kind.baseUrl?.indexOf("{value}") ?? -1
  if (!kind.baseUrl || marker < 0) {
    return <div className="min-w-0 truncate text-sm font-medium">{value}</div>
  }
  const prefix = kind.baseUrl.slice(0, marker)
  const suffix = kind.baseUrl.slice(marker + "{value}".length)
  const href = kind.baseUrl.replace("{value}", encodePlatformValue(kind, value))
  return (
    <NavigationLink
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="block min-w-0 truncate rounded-md border bg-muted/30 px-3 py-1.5 text-sm hover:underline"
    >
      <span className="text-muted-foreground">{prefix}</span>
      <span>{value}</span>
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </NavigationLink>
  )
}

/**
 * 所有平台一次编辑、一次保存：值变了才发请求，清空即删除。
 *
 * 有链接模板的平台不再逐个铺开：粘贴一条平台链接就自动定位平台并生成
 * 只读条目，没有模板的平台（游戏 ID、平台 ID）仍然常驻输入框。
 */
export function PlatformAccountsEditor() {
  const [kinds, setKinds] = useState<PlatformAccountKind[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [usernames, setUsernames] = useState<Record<string, string>>({})
  const [originalUsernames, setOriginalUsernames] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pasted, setPasted] = useState("")
  const [pasteError, setPasteError] = useState<string | null>(null)
  // 本次编辑里新加的平台排在前面，免得新条目落在可视区外；保存后刷新回到后台排序。
  const [addedAt, setAddedAt] = useState<Record<string, number>>({})
  // 触屏上悬停提示不好用：窄屏改成可以下滑关闭的底部抽屉。
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  useEffect(() => {
    let active = true
    void getMyPlatformAccounts()
      .send()
      .then((result) => {
        if (!active) return
        const entries: Record<string, string> = {}
        const names: Record<string, string> = {}
        const catalogById = new Map(
          result.catalog.map((kind) => [kind.id, kind])
        )
        for (const entry of result.entries) {
          const kind = catalogById.get(entry.kindId)
          entries[entry.kindId] = kind
            ? decodePlatformValue(kind, entry.value)
            : entry.value
          names[entry.kindId] = entry.username ?? ""
        }
        setKinds(result.catalog)
        setOriginal(entries)
        setDraft(entries)
        setOriginalUsernames(names)
        setUsernames(names)
        setFailed(false)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const homepageKinds = kinds.filter((kind) => kind.group === "link")
  const gameKinds = kinds.filter(
    (kind) => kind.group === "game" && !kind.baseUrl
  )
  const templatedKinds = kinds.filter((kind) => kind.baseUrl)
  const idKinds = kinds.filter(
    (kind) => !kind.baseUrl && kind.group !== "link" && kind.group !== "game"
  )
  // 只有填过或刚添加的平台才出现：本次新加的按添加先后倒序排在前面，
  // 其余跟随后台的排序值（sort 稳定，未标注的条目保持原顺序）。
  const filledKinds = templatedKinds
    .filter((kind) => (draft[kind.id] ?? "").trim() !== "")
    .sort((left, right) => (addedAt[right.id] ?? 0) - (addedAt[left.id] ?? 0))

  const localErrors: Record<string, string> = {}
  for (const kind of kinds) {
    // 校验的是最终存下的形式（YouTube 的 handle 会先转成百分号转义）。
    const message = platformValueError(
      kind,
      encodePlatformValue(kind, (draft[kind.id] ?? "").trim())
    )
    if (message) localErrors[kind.id] = message
  }

  const dirty = kinds.filter(
    (kind) =>
      (draft[kind.id] ?? "").trim() !== (original[kind.id] ?? "") ||
      (usernames[kind.id] ?? "").trim() !== (originalUsernames[kind.id] ?? "")
  )

  function handlePaste(text: string, preventDefault: () => void) {
    const kind = matchPlatformAccountKind(templatedKinds, text)
    if (!kind) {
      setPasteError(MATCH_FAILED)
      return
    }
    if ((draft[kind.id] ?? "").trim() !== "") {
      setPasteError(ALREADY_ADDED)
      return
    }
    const value = formatPlatformValue(kind, text)
    const invalid = platformValueError(kind, encodePlatformValue(kind, value))
    if (!value || invalid) {
      setPasteError(invalid ?? MATCH_FAILED)
      return
    }
    preventDefault()
    setDraft((current) => ({ ...current, [kind.id]: value }))
    setAddedAt((current) => ({
      ...current,
      [kind.id]: Math.max(0, ...Object.values(current)) + 1,
    }))
    setPasted("")
    setPasteError(null)
  }

  function removeEntry(kind: PlatformAccountKind) {
    // 只在前端移除，点【保存】时才真正删除；刷新会恢复成服务端状态。
    setDraft((current) => ({ ...current, [kind.id]: "" }))
    setUsernames((current) => ({ ...current, [kind.id]: "" }))
    setAddedAt((current) => {
      const next = { ...current }
      delete next[kind.id]
      return next
    })
    setPasteError(null)
  }

  async function save() {
    if (saving || dirty.length === 0) return
    setSaving(true)
    setErrors({})
    const nextErrors: Record<string, string> = {}
    const nextOriginal = { ...original }
    const nextUsernames = { ...originalUsernames }
    for (const kind of dirty) {
      const value = (draft[kind.id] ?? "").trim()
      try {
        if (value) {
          // 只有外链形式的账号才有用户名。
          const username = kind.baseUrl
            ? (usernames[kind.id] ?? "").trim() || null
            : null
          await saveMyPlatformAccount(kind.id, value, username).send()
          nextOriginal[kind.id] = value
          nextUsernames[kind.id] = username ?? ""
        } else {
          await deleteMyPlatformAccount(kind.id).send()
          delete nextOriginal[kind.id]
          delete nextUsernames[kind.id]
        }
      } catch (error) {
        nextErrors[kind.id] = errorMessage(error)
      }
    }
    setOriginal(nextOriginal)
    setOriginalUsernames(nextUsernames)
    setErrors(nextErrors)
    setSaving(false)
    if (Object.keys(nextErrors).length === 0) toast.success("平台账号已保存")
  }

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircleIcon
          className="mr-2 size-4 animate-spin"
          aria-hidden="true"
        />
        正在载入
      </div>
    )
  }

  if (failed) {
    return (
      <p className="text-sm text-destructive">
        平台账号暂时无法加载，请刷新页面重试。
      </p>
    )
  }

  function renderInput(kind: PlatformAccountKind) {
    return (
      <label key={kind.id} className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-sm">
          <KindIcon kind={kind} />
          {kind.name}
        </span>
        <Input
          value={draft[kind.id] ?? ""}
          placeholder={placeholderFor(kind)}
          aria-label={kind.name}
          aria-invalid={
            errors[kind.id] || localErrors[kind.id] ? true : undefined
          }
          maxLength={200}
          onChange={(event) => {
            const next = formatPlatformValue(kind, event.currentTarget.value)
            setDraft((current) => ({ ...current, [kind.id]: next }))
          }}
        />
        {errors[kind.id] || localErrors[kind.id] ? (
          <span className="text-xs text-destructive">
            {errors[kind.id] ?? localErrors[kind.id]}
          </span>
        ) : null}
      </label>
    )
  }

  return (
    <div className="space-y-6">
      {homepageKinds.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            个人主页
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {homepageKinds.map(renderInput)}
          </div>
        </section>
      ) : null}

      {gameKinds.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">游戏 ID</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {gameKinds.map(renderInput)}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <LinkIcon aria-hidden="true" className="size-4" />
          平台账号
        </h3>
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Input
              value={pasted}
              aria-label="粘贴平台链接"
              aria-invalid={pasteError ? true : undefined}
              placeholder="粘贴平台主页链接，例如 https://space.bilibili.com/12345"
              maxLength={300}
              onChange={(event) => {
                // 粘贴失败时浏览器仍会把文本放进输入框，这次 change 不能把提示清掉。
                const inputType = (event.nativeEvent as InputEvent).inputType
                if (inputType !== "insertFromPaste") setPasteError(null)
                setPasted(event.currentTarget.value)
              }}
              onPaste={(event) => {
                const text = event.clipboardData?.getData("text") ?? ""
                handlePaste(text, () => event.preventDefault())
              }}
            />
            {pasteError ? (
              <span className="text-xs text-destructive">{pasteError}</span>
            ) : null}
          </div>
          {isDesktop ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={GUIDE_LABEL}
                    />
                  }
                >
                  <InfoIcon aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="end"
                  className="w-[min(20rem,calc(100vw-2rem))] max-w-none text-background"
                >
                  <div className="w-full space-y-1 text-left">
                    <p className="font-medium">支持的平台</p>
                    <PlatformTemplateTable kinds={templatedKinds} />
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Drawer.Root swipeDirection="down">
              <Drawer.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={GUIDE_LABEL}
                  />
                }
              >
                <InfoIcon aria-hidden="true" />
              </Drawer.Trigger>
              <Drawer.Portal>
                <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/30 opacity-[calc(0.9-var(--drawer-swipe-progress))] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs" />
                <Drawer.Viewport className="fixed inset-0 z-50 flex flex-col justify-end">
                  <Drawer.Popup className="flex max-h-[80dvh] transform-[translateY(var(--drawer-swipe-movement-y))] flex-col rounded-t-2xl border-t bg-popover text-popover-foreground shadow-lg transition-transform duration-300 ease-out outline-none data-ending-style:transform-[translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:transform-[translateY(100%)] data-swiping:duration-0 data-swiping:select-none">
                    <Drawer.Content className="flex min-h-0 flex-col gap-2 p-4 pb-[calc(1rem+var(--safe-area-bottom))]">
                      <div
                        aria-hidden="true"
                        className="mx-auto h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
                      />
                      <Drawer.Title className="font-heading text-base font-medium">
                        支持的平台
                      </Drawer.Title>
                      <div className="-mx-1 min-h-0 overflow-y-auto overscroll-contain px-1">
                        <PlatformTemplateTable
                          kinds={templatedKinds}
                          size="regular"
                        />
                      </div>
                    </Drawer.Content>
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>
          )}
        </div>

        {filledKinds.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filledKinds.map((kind) => (
              <div
                key={kind.id}
                className="flex min-w-0 flex-col gap-1.5"
                data-platform-entry={kind.id}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <KindIcon kind={kind} />
                  <span className="truncate">{kind.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`移除 ${kind.name}`}
                    onClick={() => removeEntry(kind)}
                  >
                    <TrashIcon aria-hidden="true" />
                  </Button>
                </div>
                <PlatformLink kind={kind} value={draft[kind.id] ?? ""} />
                {errors[kind.id] || localErrors[kind.id] ? (
                  <span className="text-xs text-destructive">
                    {errors[kind.id] ?? localErrors[kind.id]}
                  </span>
                ) : null}
                <Input
                  value={usernames[kind.id] ?? ""}
                  placeholder="用户名（选填）"
                  aria-label={`${kind.name} 用户名`}
                  maxLength={60}
                  onChange={(event) => {
                    const next = event.currentTarget.value
                    setUsernames((current) => ({ ...current, [kind.id]: next }))
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {idKinds.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">平台 ID</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {idKinds.map(renderInput)}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={saving || dirty.length === 0}
          onClick={() => void save()}
        >
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {saving ? "正在保存" : "保存"}
        </Button>
        <span className="text-xs text-muted-foreground">
          粘贴平台链接即可添加；移除条目或清空上面的输入框，点保存后生效。
        </span>
      </div>
    </div>
  )
}
