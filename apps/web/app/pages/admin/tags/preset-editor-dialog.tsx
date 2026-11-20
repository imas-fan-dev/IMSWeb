import { LoaderCircleIcon, SaveIcon } from "lucide-react"
import { useState, type FormEvent } from "react"

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
import type { AdminNamecardTagPreset } from "~/lib/api"
import { AliasChipField } from "./alias-chip-field"
import {
  TAG_NAME_MAX_LENGTH,
  appendAliases,
} from "./tag-library-model"

export interface PresetEditorSubmission {
  name: string
  aliases: string[]
}

export function PresetEditorDialog({
  open,
  preset,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  /** `null` creates a preset; a row edits it in place. */
  preset: AdminNamecardTagPreset | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (submission: PresetEditorSubmission) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        {open ? (
          <PresetEditorForm
            preset={preset}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PresetEditorForm({
  preset,
  saving,
  onCancel,
  onSubmit,
}: {
  preset: AdminNamecardTagPreset | null
  saving: boolean
  onCancel: () => void
  onSubmit: (submission: PresetEditorSubmission) => void
}) {
  const [name, setName] = useState(preset?.name ?? "")
  const [aliases, setAliases] = useState<string[]>(preset?.aliases ?? [])
  const [aliasDraft, setAliasDraft] = useState("")

  const trimmedName = name.trim()
  const valid = trimmedName.length > 0 && trimmedName.length <= TAG_NAME_MAX_LENGTH

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || saving) return
    onSubmit({
      name: trimmedName,
      aliases: appendAliases(aliases, aliasDraft),
    })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{preset ? "编辑预设标签" : "新增预设标签"}</DialogTitle>
        <DialogDescription>
          {preset
            ? "修改名称会同步到所有使用该预设的名片；别名只用于输入匹配。"
            : "预设标签会出现在标签编辑器与名片墙筛选的候选里。"}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-tag-preset-name">名称</FieldLabel>
            <Input
              id="namecard-tag-preset-name"
              value={name}
              disabled={saving}
              maxLength={TAG_NAME_MAX_LENGTH}
              required
              placeholder="例如：COSPLAY"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-tag-preset-aliases">别名</FieldLabel>
            <AliasChipField
              id="namecard-tag-preset-aliases"
              aliases={aliases}
              draft={aliasDraft}
              disabled={saving}
              onChange={setAliases}
              onDraftChange={setAliasDraft}
            />
            <FieldDescription>
              名称与别名都会命中候选；重名或重复别名会被服务端拒绝。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={saving || !valid}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {preset ? "保存修改" : "新增预设"}
        </Button>
      </DialogFooter>
    </form>
  )
}
