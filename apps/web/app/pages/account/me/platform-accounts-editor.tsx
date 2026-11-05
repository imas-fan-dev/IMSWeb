import { HomeIcon, InfoIcon, LinkIcon, LoaderCircleIcon, TrashIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  decodePlatformValue,
  encodePlatformValue,
  formatPlatformValue,
  matchPlatformAccountKind,
  platformValueError,
} from "@imsweb/contracts/namecards"

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

const MATCH_FAILED =
  "没有匹配到支持的平台，请检查平台是否受支持、链接格式是否符合提示中的模板。"
const ALREADY_ADDED = "这个平台已经添加过了，先移除再重新粘贴。"

/** 输入框里提示的是链接模板，而不是正则。 */
function placeholderFor(kind: PlatformAccountKind): string {
  if (kind.baseUrl) return kind.baseUrl
  return kind.group === "link" ? "https://" : ""
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请重试"
}

function KindIcon({ kind }: { kind: PlatformAccountKind }) {
  if (kind.group === "link")
    return <HomeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
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
    return <div className="truncate text-sm font-medium">{value}</div>
  }
  const prefix = kind.baseUrl.slice(0, marker)
  const suffix = kind.baseUrl.slice(marker + "{value}".length)
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
      <span className="text-muted-foreground">{prefix}</span>
      <span>{value}</span>
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </div>
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

  useEffect(() => {
    let active = true
    void getMyPlatformAccounts()
      .send()
      .then((result) => {
        if (!active) return
        const entries: Record<string, string> = {}
        const names: Record<string, string> = {}
        const catalogById = new Map(result.catalog.map((kind) => [kind.id, kind]))
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
  // 只有填过或刚添加的平台才出现，顺序跟随后台的排序值。
  const filledKinds = templatedKinds.filter(
    (kind) => (draft[kind.id] ?? "").trim() !== ""
  )

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
    setPasted("")
    setPasteError(null)
  }

  function removeEntry(kind: PlatformAccountKind) {
    // 只在前端移除，点【保存】时才真正删除；刷新会恢复成服务端状态。
    setDraft((current) => ({ ...current, [kind.id]: "" }))
    setUsernames((current) => ({ ...current, [kind.id]: "" }))
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
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" aria-hidden="true" />
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
          <h3 className="text-sm font-medium text-muted-foreground">个人主页</h3>
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
        <h3 className="text-sm font-medium text-muted-foreground">平台账号</h3>
        <div className="flex items-start gap-2">
          <div className="relative min-w-0 flex-1">
            <LinkIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={pasted}
              aria-label="粘贴平台链接"
              aria-invalid={pasteError ? true : undefined}
              placeholder="粘贴平台主页链接，例如 https://space.bilibili.com/12345"
              className="pl-9"
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
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="查看支持的平台与链接模板"
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
                  <ul className="space-y-0.5">
                    {templatedKinds.map((kind) => (
                      <li
                        key={kind.id}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span>{kind.name}</span>
                        <span className="font-mono text-[11px] break-all opacity-80">
                          {kind.baseUrl}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {pasteError ? (
          <span className="text-xs text-destructive">{pasteError}</span>
        ) : null}

        {filledKinds.length > 0 ? (
          <div className="grid gap-4">
            {filledKinds.map((kind) => (
              <div
                key={kind.id}
                className="flex flex-col gap-1.5"
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
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0">用户名</span>
                  <Input
                    value={usernames[kind.id] ?? ""}
                    placeholder="选填，用于主页展示"
                    aria-label={`${kind.name} 用户名`}
                    className="h-8 text-xs"
                    maxLength={60}
                    onChange={(event) => {
                      const next = event.currentTarget.value
                      setUsernames((current) => ({
                        ...current,
                        [kind.id]: next,
                      }))
                    }}
                  />
                </label>
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
          粘贴平台链接即可添加，移除条目后点保存生效；留空即从主页移除。
        </span>
      </div>
    </div>
  )
}
