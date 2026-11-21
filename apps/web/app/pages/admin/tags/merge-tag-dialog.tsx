import { LoaderCircleIcon, MergeIcon } from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  getAdminNamecardTagPresets,
  type AdminNamecardTagFree,
  type AdminNamecardTagPreset,
} from "~/lib/api"

export interface MergeTagSubmission {
  presetId: number
}

export function MergeTagDialog({
  open,
  tag,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  tag: AdminNamecardTagFree | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (submission: MergeTagSubmission) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        {open && tag ? (
          <MergeTagForm
            tag={tag}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MergeTagForm({
  tag,
  saving,
  onCancel,
  onSubmit,
}: {
  tag: AdminNamecardTagFree
  saving: boolean
  onCancel: () => void
  onSubmit: (submission: MergeTagSubmission) => void
}) {
  const [presets, setPresets] = useState<AdminNamecardTagPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [presetId, setPresetId] = useState("")

  useEffect(() => {
    let active = true
    getAdminNamecardTagPresets({ pageSize: 100 })
      .send()
      .then((result) => {
        if (active) setPresets(result.items)
      })
      .catch(() => {
        if (active) toast.error("预设标签加载失败，请稍后重试。")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const keyword = filter.trim().toLowerCase()
  const candidates = useMemo(() => {
    if (!keyword) return presets
    return presets.filter(
      (preset) =>
        preset.name.toLowerCase().includes(keyword) ||
        preset.aliases.some((alias) => alias.toLowerCase().includes(keyword))
    )
  }, [keyword, presets])

  const selected = candidates.find((preset) => String(preset.id) === presetId)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!presetId || saving) return
    onSubmit({ presetId: Number(presetId) })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>并入已有预设</DialogTitle>
        <DialogDescription>
          「{tag.name}」会被加进所选预设的别名；该标签当前共 {tag.count}{" "}
          次使用，现存标签也会一并指向它。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-tag-merge-search">
              目标预设
            </FieldLabel>
            <Input
              id="namecard-tag-merge-search"
              type="search"
              value={filter}
              disabled={saving || loading}
              placeholder="搜索名称 / 别名，然后点选"
              onChange={(event) => setFilter(event.target.value)}
            />
            <div
              role="listbox"
              aria-label="预设候选"
              className="max-h-56 overflow-y-auto rounded-lg border bg-background p-1"
            >
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {loading
                    ? "正在读取预设标签。"
                    : presets.length === 0
                      ? "没有可选的预设标签，请先到「预设标签」新建。"
                      : "没有匹配的预设标签。"}
                </p>
              ) : (
                candidates.map((preset) => {
                  const active = String(preset.id) === presetId
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={saving}
                      onClick={() => setPresetId(String(preset.id))}
                      className={
                        active
                          ? "flex w-full items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-left text-sm outline-none"
                          : "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/60"
                      }
                    >
                      <span className="truncate">{preset.name}</span>
                      {preset.aliases.length > 0 ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {preset.aliases.join(" / ")}
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
            <FieldDescription>
              {selected
                ? `已选择「${selected.name}」。`
                : `共 ${candidates.length} 个候选，点选一项作为目标预设。`}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={saving || !presetId || loading}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <MergeIcon data-icon="inline-start" />
          )}
          并入预设
        </Button>
      </DialogFooter>
    </form>
  )
}
