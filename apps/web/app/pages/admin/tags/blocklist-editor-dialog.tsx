import { LoaderCircleIcon, SaveIcon } from "lucide-react"
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
import type { AdminNamecardTagBlocklistItem } from "~/lib/api"
import { TAG_BLOCKLIST_PATTERN_MAX_LENGTH } from "./tag-library-model"

export interface BlocklistEditorSubmission {
  pattern: string
  isRegex: boolean
}

export function BlocklistEditorDialog({
  open,
  item,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  item: AdminNamecardTagBlocklistItem | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (submission: BlocklistEditorSubmission) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        {open ? (
          <BlocklistEditorForm
            item={item}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BlocklistEditorForm({
  item,
  saving,
  onCancel,
  onSubmit,
}: {
  item: AdminNamecardTagBlocklistItem | null
  saving: boolean
  onCancel: () => void
  onSubmit: (submission: BlocklistEditorSubmission) => void
}) {
  const [pattern, setPattern] = useState(item?.pattern ?? "")
  const [isRegex, setIsRegex] = useState(item?.isRegex ?? false)

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
        <DialogTitle>{item ? "编辑屏蔽词" : "新增屏蔽词"}</DialogTitle>
        <DialogDescription>
          屏蔽词只阻止新建标签，不会自动删除已经存在的标签。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-tag-blocklist-pattern">
              屏蔽词
            </FieldLabel>
            <Input
              id="namecard-tag-blocklist-pattern"
              value={pattern}
              disabled={saving}
              maxLength={TAG_BLOCKLIST_PATTERN_MAX_LENGTH}
              required
              placeholder="例如：广告 或 ^出\s*售"
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
        <Button type="submit" disabled={saving || !valid}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {item ? "保存修改" : "新增屏蔽词"}
        </Button>
      </DialogFooter>
    </form>
  )
}
