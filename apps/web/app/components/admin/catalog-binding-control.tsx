import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  getAdminCatalog,
  saveAdminCatalogBinding,
  type AdminCatalog,
} from "~/lib/api"

export function CatalogBindingControl({
  kind,
  id,
  projectId,
  onSaved,
  onBindingState,
}: {
  kind: "entry" | "navigation"
  id: number
  projectId: number
  onSaved: () => void
  onBindingState: (bound: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [value, setValue] = useState("independent")
  const [savedValue, setSavedValue] = useState("independent")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void getAdminCatalog()
      .send()
      .then((data) => {
        if (!active) return
        setCatalog(data)
        const target =
          kind === "entry"
            ? data.entries.find((e) => e.id === id)
            : data.navigationGroups.find((g) => g.id === id)
        const character =
          target && "characterProfileId" in target
            ? target.characterProfileId
            : null
        const selected = character
          ? `character:${character}`
          : target?.groupProfileId
            ? `group:${target.groupProfileId}`
            : "independent"
        setValue(selected)
        setSavedValue(selected)
        onBindingState(selected !== "independent")
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause) ?? "绑定资料加载失败")
      })
    return () => {
      active = false
    }
  }, [id, kind, onBindingState])

  const options = [{ value: "independent", label: "独立维护" }]
  if (catalog) {
    if (kind === "entry")
      for (const character of catalog.characters) {
        if (character.retired || character.isFallback) continue
        for (const profile of character.profiles)
          if (profile.projectId === projectId) {
            options.push({
              value: `character:${profile.id}`,
              label: `人物 · ${profile.nameCn ?? character.name}`,
            })
          }
      }
    for (const group of catalog.groups) {
      if (group.retired) continue
      for (const profile of group.profiles)
        if (profile.projectId === projectId) {
          options.push({
            value: `group:${profile.id}`,
            label: `组合／标签 · ${profile.nameCn ?? group.name}`,
          })
        }
    }
  }

  const [sourceKind, sourceProfileId] = savedValue.split(":")
  const sourceOwner =
    sourceKind === "character"
      ? catalog?.characters.find((owner) =>
          owner.profiles.some(
            (profile) => profile.id === Number(sourceProfileId)
          )
        )
      : sourceKind === "group"
        ? catalog?.groups.find((owner) =>
            owner.profiles.some(
              (profile) => profile.id === Number(sourceProfileId)
            )
          )
        : undefined

  async function save() {
    if (!catalog) return
    const target =
      kind === "entry"
        ? catalog.entries.find((e) => e.id === id)
        : catalog.navigationGroups.find((g) => g.id === id)
    if (!target) return
    const [source, profileId] = value.split(":")
    if (
      source !== "independent" &&
      source !== "character" &&
      source !== "group"
    )
      return
    setSaving(true)
    setError(null)
    try {
      await saveAdminCatalogBinding({
        kind,
        id,
        revision: target.revision,
        source,
        profileId: source === "independent" ? null : Number(profileId),
      }).send()
      toast.success(
        source === "independent" ? "已转为独立资料" : "资料绑定已保存"
      )
      setOpen(false)
      setSavedValue(value)
      onSaved()
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "保存绑定失败，请刷新后重试")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm text-muted-foreground">
        {savedValue === "independent"
          ? "这是独立业务条目，可关联角色档案，关联后名称与图片从档案读取。"
          : "名称、图片和代表色通过角色档案关联读取，请在对应企划档案中修改。"}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        资料绑定
      </Button>
      {sourceOwner ? (
        <NavigationLink
          className="ml-3 text-sm text-primary underline underline-offset-4"
          to={`/admin/idols?kind=${sourceKind}&projectId=${projectId}&ownerId=${sourceOwner.id}`}
        >
          查看来源企划档案
        </NavigationLink>
      ) : null}
      {error && !open ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) {
            setOpen(next)
            if (!next) setValue(savedValue)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>资料来源</DialogTitle>
            <DialogDescription>
              绑定后继承名称与图片，导航收录和剧情保持独立。解除绑定会保留当前展示资料。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-4">
            {error ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Select
              items={options}
              value={value}
              disabled={!catalog || saving}
              onValueChange={(next) => {
                if (next) setValue(String(next))
              }}
            >
              <SelectTrigger aria-label="资料来源">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              disabled={!catalog || saving}
              onClick={() => void save()}
            >
              {saving ? "正在保存…" : "保存绑定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
