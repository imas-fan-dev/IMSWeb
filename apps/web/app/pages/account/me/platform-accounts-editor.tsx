import { HomeIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  decodePlatformValue,
  encodePlatformValue,
  formatPlatformValue,
  platformValueError,
} from "@imsweb/contracts/namecards"

import { platformIconUrl } from "~/components/profile/platform-account-icons"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  deleteMyPlatformAccount,
  getMyPlatformAccounts,
  isApiError,
  saveMyPlatformAccount,
  type PlatformAccountKind,
} from "~/lib/api"

/** 输入框里提示的是链接模板，而不是正则。 */
/** 占位符直接给出后台配置的模板，`{value}` 留在原地当提示。 */
function placeholderFor(kind: PlatformAccountKind): string {
  if (kind.baseUrl) return kind.baseUrl
  return kind.group === "link" ? "https://" : ""
}

/** 前端只分三块：个人主页（无标题）、游戏 ID、平台账号（社交/展示/游戏平台合并）。 */
const EDITOR_GROUPS = [
  // 个人主页单独一条链接，不占分组标题，放在最前面。
  { key: "homepage", title: null, match: ["link"] },
  { key: "game", title: "游戏 ID", match: ["game"] },
  {
    key: "platform",
    title: "平台账号",
    match: ["social", "showcase", "game-platform"],
  },
] as const

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
 * 所有平台一起编辑、一次保存：值变了才发请求，清空即删除。
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

  return (
    <div className="space-y-6">
      {EDITOR_GROUPS.map((group) => {
        const rows = kinds.filter((kind) =>
          (group.match as readonly string[]).includes(kind.group)
        )
        if (rows.length === 0) return null
        return (
          <div key={group.key} className="space-y-2">
            {group.title ? (
              <h3 className="text-sm font-medium text-muted-foreground">
                {group.title}
              </h3>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((kind) => (
                <div key={kind.id} className="flex flex-col gap-1.5">
                  <label className="flex flex-col gap-1.5">
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
                      // 粘贴整条链接也在这里归一：平台前缀、query、大小写。
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
                  {kind.baseUrl ? (
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
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-3">
        <Button type="button" disabled={saving || dirty.length === 0} onClick={() => void save()}>
          {saving ? (
            <LoaderCircleIcon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          ) : null}
          {saving ? "正在保存" : "保存"}
        </Button>
        <span className="text-xs text-muted-foreground">
          粘贴完整链接或只填标识符都可以；留空即从主页移除。
        </span>
      </div>
    </div>
  )
}
