import { BanIcon, LoaderCircleIcon } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
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
import {
  TAG_BLOCKLIST_PATTERN_MAX_LENGTH,
  tagCountLabel,
} from "./tag-library-model"

export interface BlockTagSubmission {
  pattern: string
  isRegex: boolean
}

export function BlockTagDialog({
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
  onSubmit: (submission: BlockTagSubmission) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        {open && tag ? (
          <BlockTagForm
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

function BlockTagForm({
  tag,
  saving,
  onCancel,
  onSubmit,
}: {
  tag: AdminNamecardTagFree
  saving: boolean
  onCancel: () => void
  onSubmit: (submission: BlockTagSubmission) => void
}) {
  const [pattern, setPattern] = useState(tag.name)
  const [isRegex, setIsRegex] = useState(false)

  const trimmedPattern = pattern.trim()
  const valid =
    trimmedPattern.length > 0 &&
    trimmedPattern.length <= TAG_BLOCKLIST_PATTERN_MAX_LENGTH

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || saving) return
    onSubmit({ pattern: trimmedPattern, isRegex })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>屏蔽并移除标签</DialogTitle>
        <DialogDescription>
          「{tag.name}」（{tagCountLabel(tag.count)}）会立即从所有名片移除，并按下方规则阻止再次创建。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-tag-block-pattern">屏蔽词</FieldLabel>
            <Input
              id="namecard-tag-block-pattern"
              value={pattern}
              disabled={saving}
              maxLength={TAG_BLOCKLIST_PATTERN_MAX_LENGTH}
              required
              onChange={(event) => setPattern(event.target.value)}
            />
            <FieldDescription>
              关闭正则时按「包含」匹配；开启后按 JavaScript 正则表达式匹配。
            </FieldDescription>
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <Checkbox
              checked={isRegex}
              disabled={saving}
              onCheckedChange={(value) => setIsRegex(value === true)}
            />
            <span className="text-sm">按正则表达式匹配</span>
          </label>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          取消
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={saving || !valid}
        >
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <BanIcon data-icon="inline-start" />
          )}
          屏蔽并移除
        </Button>
      </DialogFooter>
    </form>
  )
}
