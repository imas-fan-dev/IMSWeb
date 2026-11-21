import { ArrowUpRightIcon, LoaderCircleIcon } from "lucide-react"
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
import type { AdminNamecardTagFree } from "~/lib/api"
import { AliasChipField } from "./alias-chip-field"
import {
  TAG_NAME_MAX_LENGTH,
  appendAliases,
} from "./tag-library-model"

export interface PromoteTagSubmission {
  presetName: string
  aliases: string[]
}

export function PromoteTagDialog({
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
  onSubmit: (submission: PromoteTagSubmission) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        {open && tag ? (
          <PromoteTagForm
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

function PromoteTagForm({
  tag,
  saving,
  onCancel,
  onSubmit,
}: {
  tag: AdminNamecardTagFree
  saving: boolean
  onCancel: () => void
  onSubmit: (submission: PromoteTagSubmission) => void
}) {
  const [presetName, setPresetName] = useState(tag.name)
  const [aliases, setAliases] = useState<string[]>([])
  const [aliasDraft, setAliasDraft] = useState("")

  const trimmedName = presetName.trim()
  const valid = trimmedName.length > 0 && trimmedName.length <= TAG_NAME_MAX_LENGTH

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || saving) return
    onSubmit({
      presetName: trimmedName,
      aliases: appendAliases(aliases, aliasDraft),
    })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>转为预设标签</DialogTitle>
        <DialogDescription>
          「{tag.name}」当前共 {tag.count} 次使用；转为预设后，所有名片上的该标签会同步指向新预设。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-tag-promote-name">预设名称</FieldLabel>
            <Input
              id="namecard-tag-promote-name"
              value={presetName}
              disabled={saving}
              maxLength={TAG_NAME_MAX_LENGTH}
              required
              onChange={(event) => setPresetName(event.target.value)}
            />
            <FieldDescription>
              留空以外的名称都可用；与现有预设或别名重名会被拒绝。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-tag-promote-aliases">别名</FieldLabel>
            <AliasChipField
              id="namecard-tag-promote-aliases"
              aliases={aliases}
              draft={aliasDraft}
              disabled={saving}
              onChange={setAliases}
              onDraftChange={setAliasDraft}
            />
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
            <ArrowUpRightIcon data-icon="inline-start" />
          )}
          转为预设
        </Button>
      </DialogFooter>
    </form>
  )
}
