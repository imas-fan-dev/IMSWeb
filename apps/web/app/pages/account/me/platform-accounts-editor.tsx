import { HomeIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PLATFORM_ICON_URLS } from "~/components/profile/platform-account-icons"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  deleteMyPlatformAccount,
  getMyPlatformAccounts,
  isApiError,
  saveMyPlatformAccount,
  type PlatformAccountKind,
} from "~/lib/api"

const GROUP_LABELS: Record<string, string> = {
  game: "游戏 ID",
  link: "个人主页",
  social: "平台账号",
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请重试"
}

function KindIcon({ kind }: { kind: PlatformAccountKind }) {
  const url = PLATFORM_ICON_URLS[kind.icon ?? ""]
  if (kind.group === "link")
    return <HomeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
  if (url)
    return (
      <img
        src={url}
        alt=""
        className="size-4"
        style={kind.color ? { color: kind.color } : undefined}
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
        for (const entry of result.entries) entries[entry.kindId] = entry.value
        setKinds(result.catalog)
        setOriginal(entries)
        setDraft(entries)
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

  const dirty = kinds.filter(
    (kind) => (draft[kind.id] ?? "").trim() !== (original[kind.id] ?? "")
  )

  async function save() {
    if (saving || dirty.length === 0) return
    setSaving(true)
    setErrors({})
    const nextErrors: Record<string, string> = {}
    const nextOriginal = { ...original }
    for (const kind of dirty) {
      const value = (draft[kind.id] ?? "").trim()
      try {
        if (value) {
          await saveMyPlatformAccount(kind.id, value).send()
          nextOriginal[kind.id] = value
        } else {
          await deleteMyPlatformAccount(kind.id).send()
          delete nextOriginal[kind.id]
        }
      } catch (error) {
        nextErrors[kind.id] = errorMessage(error)
      }
    }
    setOriginal(nextOriginal)
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
      {(["game", "link", "social"] as const).map((group) => {
        const rows = kinds.filter((kind) => kind.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {GROUP_LABELS[group]}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((kind) => (
                <label key={kind.id} className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    <KindIcon kind={kind} />
                    {kind.name}
                  </span>
                  <Input
                    value={draft[kind.id] ?? ""}
                    placeholder={kind.pattern}
                    aria-label={kind.name}
                    aria-invalid={errors[kind.id] ? true : undefined}
                    maxLength={200}
                    onChange={(event) => {
                      const next = event.currentTarget.value
                      setDraft((current) => ({ ...current, [kind.id]: next }))
                    }}
                  />
                  {errors[kind.id] ? (
                    <span className="text-xs text-destructive">{errors[kind.id]}</span>
                  ) : null}
                </label>
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
