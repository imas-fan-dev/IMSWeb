import { CheckIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react"
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
  type PlatformAccountEntry,
  type PlatformAccountKind,
} from "~/lib/api"

/** 个人主页地址与游戏 ID 都是「填一次就好」的值，所以逐行保存。 */
type RowState = {
  value: string
  saving: boolean
  error: string | null
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请重试"
}

function KindRow({
  kind,
  entry,
  onSaved,
  onCleared,
}: {
  kind: PlatformAccountKind
  entry: PlatformAccountEntry | undefined
  onSaved: (kindId: string, value: string) => void
  onCleared: (kindId: string) => void
}) {
  const [row, setRow] = useState<RowState>({
    value: entry?.value ?? "",
    saving: false,
    error: null,
  })

  async function save() {
    const value = row.value.trim()
    if (!value || row.saving) return
    setRow((current) => ({ ...current, saving: true, error: null }))
    try {
      await saveMyPlatformAccount(kind.id, value).send()
      onSaved(kind.id, value)
      toast.success(`${kind.name} 已保存`)
    } catch (error) {
      setRow((current) => ({ ...current, error: errorMessage(error) }))
    } finally {
      setRow((current) => ({ ...current, saving: false }))
    }
  }

  async function clear() {
    if (row.saving) return
    setRow((current) => ({ ...current, saving: true, error: null }))
    try {
      await deleteMyPlatformAccount(kind.id).send()
      setRow({ value: "", saving: false, error: null })
      onCleared(kind.id)
    } catch (error) {
      setRow((current) => ({ ...current, error: errorMessage(error) }))
    } finally {
      setRow((current) => ({ ...current, saving: false }))
    }
  }

  const icon = PLATFORM_ICON_URLS[kind.icon ?? ""] ?? null
  const dirty = row.value.trim() !== (entry?.value ?? "")

  return (
    <div className="flex items-start gap-3" data-platform-row={kind.id}>
      <span className="mt-2 flex size-5 shrink-0 items-center justify-center">
        {icon ? (
          <img src={icon} alt="" className="size-5" aria-hidden="true" />
        ) : (
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            ●
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <label
          className="text-xs text-muted-foreground"
          htmlFor={`platform-account-${kind.id}`}
        >
          {kind.name}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={`platform-account-${kind.id}`}
            value={row.value}
            placeholder={kind.baseUrl ?? undefined}
            className="h-8"
            aria-invalid={row.error ? true : undefined}
            onChange={(event) =>
              setRow((current) => ({
                ...current,
                value: event.currentTarget.value,
                error: null,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") void save()
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            aria-label={`保存 ${kind.name}`}
            disabled={!dirty || row.saving}
            onClick={() => void save()}
          >
            {row.saving ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <CheckIcon />
            )}
          </Button>
          {entry ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`清除 ${kind.name}`}
              disabled={row.saving}
              onClick={() => void clear()}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
        {row.error ? (
          <p className="text-xs text-destructive">{row.error}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * 账号资料里的平台账号区：每个平台一行，填完即存。
 * 输入既可以是完整地址，也可以只给标识符，服务端会统一解析。
 */
export function PlatformAccountsEditor() {
  const [kinds, setKinds] = useState<PlatformAccountKind[]>([])
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void getMyPlatformAccounts()
      .send()
      .then((result) => {
        if (!active) return
        setKinds(result.catalog)
        setEntries(
          Object.fromEntries(result.entries.map((entry) => [entry.kindId, entry.value]))
        )
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

  const games = kinds.filter((kind) => kind.group === "game")
  const socials = kinds.filter((kind) => kind.group === "social")
  const links = kinds.filter((kind) => kind.group === "link")

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" aria-label="正在载入平台账号">
        正在载入…
      </p>
    )
  }
  if (failed) {
    return (
      <p className="text-sm text-destructive">平台账号载入失败，请刷新页面重试。</p>
    )
  }

  return (
    <div className="space-y-5">
      {[
        { key: "game", title: "游戏 ID", items: games },
        { key: "social", title: "社交平台", items: socials },
        { key: "link", title: "个人主页", items: links },
      ].map((group) =>
        group.items.length ? (
          <div key={group.key} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              {group.title}
            </p>
            {group.items.map((kind) => (
              <KindRow
                key={kind.id}
                kind={kind}
                entry={
                  entries[kind.id]
                    ? { kindId: kind.id, value: entries[kind.id]! }
                    : undefined
                }
                onSaved={(kindId, value) =>
                  setEntries((current) => ({ ...current, [kindId]: value }))
                }
                onCleared={(kindId) =>
                  setEntries((current) => {
                    const next = { ...current }
                    delete next[kindId]
                    return next
                  })
                }
              />
            ))}
          </div>
        ) : null
      )}
    </div>
  )
}
