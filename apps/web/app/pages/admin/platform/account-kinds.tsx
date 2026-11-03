import {
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { useDebouncedValue } from "~/lib/use-debounced-value"

import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
} from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  deleteAdminPlatformAccountKind,
  getAdminPlatformAccountKinds,
  isApiError,
  saveAdminPlatformAccountKind,
  uploadAdminPlatformAccountKindIcon,
  type PlatformAccountKind,
} from "~/lib/api"

export function meta() {
  return [{ title: "平台账号 | IMSWeb" }]
}

const GROUP_ITEMS = [
  { value: "link", label: "链接" },
  { value: "game", label: "游戏 ID" },
  { value: "social", label: "社交平台" },
  { value: "showcase", label: "展示平台" },
  { value: "game-platform", label: "游戏平台" },
]

interface Draft {
  id: string
  name: string
  group: "game" | "social" | "showcase" | "game-platform" | "link"
  pattern: string
  baseUrl: string
  color: string
  icon: string
  displayOrder: string
  enabled: boolean
  iconUrl: string
}

/**
 * 预览取图顺序：已上传 → 图标键对应的 simple-icons 图 → 大写首字母。
 * 图标键直接当作 slug 请求，不必等后台收录，所以输入新平台名立刻能看到效果。
 */
function iconPreview(draft: Draft, key: string): { src: string | null; letter: string } {
  const letter = (draft.icon || draft.name || "?").charAt(0).toUpperCase()
  if (draft.iconUrl) return { src: draft.iconUrl, letter }
  const slug = key.trim()
  if (!slug) return { src: null, letter }
  return { src: `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`, letter }
}

function emptyDraft(): Draft {
  return {
    id: "",
    name: "",
    group: "social",
    pattern: "^[A-Za-z0-9_-]{1,32}$",
    baseUrl: "",
    color: "",
    icon: "",
    displayOrder: "100",
    enabled: true,
    iconUrl: "",
  }
}

function draftFrom(kind: PlatformAccountKind): Draft {
  return {
    id: kind.id,
    name: kind.name,
    group: kind.group,
    pattern: kind.pattern,
    baseUrl: kind.baseUrl ?? "",
    color: kind.color ?? "",
    icon: kind.icon ?? "",
    displayOrder: String(kind.displayOrder),
    enabled: kind.enabled,
    iconUrl: kind.iconUrl ?? "",
  }
}

export default function AdminPlatformAccountKindsPage() {
  const [kinds, setKinds] = useState<PlatformAccountKind[]>([])
  const [loadedToken, setLoadedToken] = useState(-1)
  const [reloadToken, setReloadToken] = useState(0)
  // 载入状态由 token 派生，effect 里不再同步 setState。
  const loading = loadedToken !== reloadToken
  const [error, setError] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<PlatformAccountKind | null>(null)

  useEffect(() => {
    let active = true
    void getAdminPlatformAccountKinds()
      .send()
      .then((next) => {
        if (!active) return
        setKinds(next.kinds)
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoadedToken(reloadToken)
      })
    return () => {
      active = false
    }
  }, [reloadToken])

  // 记录「哪一组图标键 + 上传图」加载失败，换输入自然失效，无需 effect。
  const [failedPreview, setFailedPreview] = useState("")
  const [pendingIcon, setPendingIcon] = useState<File | null>(null)
  const debouncedIcon = useDebouncedValue(draft?.icon ?? "", 400)
  const preview = draft ? iconPreview(draft, debouncedIcon) : null
  const previewKey = `${draft?.icon ?? ""}|${draft?.iconUrl ?? ""}`
  const previewFailed = failedPreview === previewKey

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  async function uploadIcon(file: File | null) {
    if (!file || !draft || creating) return
    setSaving(true)
    try {
      await uploadAdminPlatformAccountKindIcon(draft.id, file).send()
      toast.success("图标已更新")
      setDraft(null)
      setReloadToken((token) => token + 1)
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "图标上传失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    try {
      const next = await saveAdminPlatformAccountKind(draft.id.trim(), {
        name: draft.name.trim(),
        group: draft.group,
        pattern: draft.pattern.trim(),
        baseUrl: draft.baseUrl.trim() || null,
        color: draft.color.trim() || null,
        icon: draft.icon.trim() || null,
        displayOrder: Number(draft.displayOrder) || 0,
        enabled: draft.enabled,
      }).send()
      setKinds(next.kinds)
      const icon = pendingIcon
      const createdId = draft.id.trim()
      setPendingIcon(null)
      setDraft(null)
      toast.success(creating ? "平台已添加" : "平台已更新")
      if (creating && icon) {
        try {
          await uploadAdminPlatformAccountKindIcon(createdId, icon).send()
          toast.success("图标已上传")
          setReloadToken((token) => token + 1)
        } catch (error) {
          toast.error(isApiError(error) ? error.message : "图标上传失败，请重试")
        }
      }
    } catch (saveError) {
      toast.error(
        isApiError(saveError) ? saveError.message : "保存失败，请检查填写内容"
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await deleteAdminPlatformAccountKind(removing.id).send()
      setKinds((current) => current.filter((item) => item.id !== removing.id))
      toast.success("平台已删除")
    } catch (deleteError) {
      toast.error(isApiError(deleteError) ? deleteError.message : "删除失败")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="PLATFORM ACCOUNTS"
        title="平台账号"
        description="维护可用于个人主页的平台：标识符、校验正则、品牌色与图标键。用户填报的内容按这里的规则校验。"
        actions={
          <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            刷新
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCreating(true)
              setDraft(emptyDraft())
            }}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新增平台
          </Button>
          </div>
        }
      />

      <AdminPanel
        title="平台目录"
        description={`共 ${kinds.length} 个平台，按排序值升序`}
        icon={PencilIcon}
      >
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircleIcon className="mr-2 size-4 animate-spin" aria-hidden="true" />
            正在载入
          </div>
        ) : error ? (
          <AdminEmptyState
            icon={PencilIcon}
            title="无法读取平台目录"
            description="请确认管理会话有效，然后刷新页面重试。"
          />
        ) : kinds.length === 0 ? (
          <AdminEmptyState
            icon={PencilIcon}
            title="还没有平台"
            description="点击右上角【新增平台】开始配置。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">标识符</th>
                  <th className="py-2 pr-3">名称</th>
                  <th className="py-2 pr-3">分组</th>
                  <th className="py-2 pr-3">校验正则</th>
                  <th className="py-2 pr-3">链接模板</th>
                  <th className="py-2 pr-3">色值</th>
                  <th className="py-2 pr-3">图标</th>
                  <th className="py-2 pr-3">排序</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) => (
                  <tr key={kind.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{kind.id}</td>
                    <td className="py-2 pr-3">{kind.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {GROUP_ITEMS.find((item) => item.value === kind.group)?.label}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3 font-mono text-xs">
                      {kind.pattern}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3 font-mono text-xs">
                      {kind.baseUrl ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {kind.color ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <span
                            aria-hidden="true"
                            className="inline-block size-3 rounded-full border"
                            style={{ backgroundColor: kind.color }}
                          />
                          {kind.color}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{kind.icon ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{kind.displayOrder}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={kind.enabled ? "secondary" : "outline"}>
                        {kind.enabled ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label={`编辑 ${kind.name}`}
                          onClick={() => {
                            setCreating(false)
                            setDraft(draftFrom(kind))
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="destructive"
                          aria-label={`删除 ${kind.name}`}
                          onClick={() => setRemoving(kind)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{creating ? "新增平台" : `编辑 ${draft?.name ?? ""}`}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="kind-id">标识符</FieldLabel>
              <Input
                id="kind-id"
                value={draft?.id ?? ""}
                disabled={!creating}
                maxLength={32}
                className="font-mono"
                onChange={(event) => patch({ id: event.currentTarget.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kind-name">名称</FieldLabel>
              <Input
                id="kind-name"
                value={draft?.name ?? ""}
                maxLength={40}
                onChange={(event) => patch({ name: event.currentTarget.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kind-group">分组</FieldLabel>
              <Select
                value={draft?.group ?? "social"}
                items={GROUP_ITEMS}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? { ...current, group: String(value) as Draft["group"] }
                      : current
                  )
                }
              >
                <SelectTrigger id="kind-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="kind-order">排序</FieldLabel>
              <Input
                id="kind-order"
                value={draft?.displayOrder ?? ""}
                inputMode="numeric"
                onChange={(event) =>
                  patch({ displayOrder: event.currentTarget.value })
                }
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="kind-base">链接模板</FieldLabel>
              <Input
                id="kind-base"
                value={draft?.baseUrl ?? ""}
                maxLength={200}
                placeholder="https://example.com/{value}"
                className="font-mono"
                onChange={(event) => patch({ baseUrl: event.currentTarget.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kind-color">品牌色</FieldLabel>
              <Input
                id="kind-color"
                value={draft?.color ?? ""}
                maxLength={7}
                placeholder="#ff6699"
                className="font-mono"
                onChange={(event) => patch({ color: event.currentTarget.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kind-icon">图标键</FieldLabel>
              <Input
                id="kind-icon"
                value={draft?.icon ?? ""}
                maxLength={40}
                className="font-mono"
                onChange={(event) => patch({ icon: event.currentTarget.value })}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="kind-icon-file">图标文件</FieldLabel>
              <div className="flex items-center gap-3">
                {preview?.src && !previewFailed ? (
                  <img
                    src={preview.src}
                    alt=""
                    className="size-10 rounded-md border object-contain"
                    onError={() => setFailedPreview(previewKey)}
                  />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-md border text-sm font-medium text-muted-foreground">
                    {preview?.letter ?? "—"}
                  </span>
                )}
                <Input
                  id="kind-icon-file"
                  type="file"
                  accept="image/png,image/webp,image/avif,image/gif,image/svg+xml"
                  disabled={saving}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ""
                    if (!file) return
                    // 新建时平台行还不存在，先把文件留住，保存成功后再上传。
                    if (creating) {
                      setPendingIcon(file)
                      return
                    }
                    void uploadIcon(file)
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                只收带透明通道的 PNG、WebP、AVIF、GIF 或 SVG；重传会直接替换现有文件。没有上传时按图标键取
                <NavigationLink
                  href="https://simpleicons.org/"
                  className="mx-0.5 underline underline-offset-2"
                >
                  simple-icons
                </NavigationLink>
                的同名图标，再没有就显示大写首字母。
              </p>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft?.enabled ?? true}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current ? { ...current, enabled: checked === true } : current
                  )
                }
              />
              启用
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "正在保存" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`删除平台「${removing?.name ?? ""}」？`}
        description="该平台下用户已填写的值会一并删除，且无法恢复。"
        confirmLabel="确认删除"
        variant="destructive"
        submitting={false}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
